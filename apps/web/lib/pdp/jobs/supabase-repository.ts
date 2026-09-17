import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceJob, isTerminal, type PdpJobEvent, type PdpJobState } from "./state";
import { resolveSubmission } from "./claim";
import type {
  CreateJobInput,
  CreateJobResult,
  JobItemRecord,
  JobRecord,
  PdpJobRepository,
} from "./repository";

/**
 * 운영용 작업 저장소. 표는 `202609180001_pdp_jobs.sql` 이 만든다.
 *
 * ── 같은 계약을 지킨다 ─────────────────────────────────────────
 *
 * `__tests__/repository-contract.ts` 의 시험이 이 구현에도 돈다. 로컬 파일
 * 구현과 **같은 답을 내야** 로컬에서 본 동작을 운영에서 믿을 수 있다.
 *
 * ── 쓰기는 전부 service role 로 ───────────────────────────────
 *
 * 회원에게는 select 만 열려 있다(마이그레이션의 grant). 예약·상태·원가를
 * 회원이 직접 고칠 수 있으면 안 된다. 그래서 이 저장소는 admin 클라이언트를
 * 받고, **소유권은 코드가 확인한다** — service role 은 RLS 를 지나치므로
 * `user_id` 조건을 빠뜨리면 남의 것을 읽는다.
 */

type Row = {
  id: string;
  user_id: string;
  team_id: string | null;
  document_id: string;
  revision: number;
  operation: string;
  section_ids: string[];
  idempotency_key: string;
  fingerprint: string;
  reservation_request_id: string;
  generation: PdpJobState["generation"];
  settlement: PdpJobState["settlement"];
  persistence: PdpJobState["persistence"];
  submission: PdpJobState["submission"];
  lease_owner: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  section_id: string;
  attempt: number;
  provider_request_id: string | null;
  model: string | null;
  output_path: string | null;
  qa: unknown;
  error_code: string | null;
  cost_usd: number | null;
};

const JOBS = "pdp_generation_jobs";
const ITEMS = "pdp_generation_items";

function toRecord(row: Row, items: ItemRow[]): JobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id,
    documentId: row.document_id,
    revision: row.revision,
    operation: row.operation,
    sectionIds: row.section_ids ?? [],
    reservationRequestId: row.reservation_request_id,
    idempotencyKey: row.idempotency_key,
    fingerprint: row.fingerprint,
    state: {
      generation: row.generation,
      settlement: row.settlement,
      persistence: row.persistence,
      submission: row.submission,
    },
    leaseUntil: row.lease_until,
    leaseOwner: row.lease_owner,
    items: items.map((item) => ({
      sectionId: item.section_id,
      attempt: item.attempt,
      providerRequestId: item.provider_request_id ?? undefined,
      model: item.model ?? undefined,
      outputPath: item.output_path ?? undefined,
      qa: item.qa ?? undefined,
      errorCode: item.error_code ?? undefined,
      costUsd: item.cost_usd ?? undefined,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseJobRepository(admin: SupabaseClient<any>): PdpJobRepository {
  async function itemsOf(jobId: string): Promise<ItemRow[]> {
    const { data } = await admin.from(ITEMS).select("*").eq("job_id", jobId).order("attempt");
    return (data ?? []) as ItemRow[];
  }

  async function rowOf(jobId: string, userId: string): Promise<Row | null> {
    const { data } = await admin
      .from(JOBS)
      .select("*")
      // **`user_id` 를 빠뜨리면 남의 것을 읽는다.** service role 은 RLS 를 지나친다.
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    return (data as Row | null) ?? null;
  }

  return {
    async createOrGet(input: CreateJobInput): Promise<CreateJobResult> {
      const { data: found } = await admin
        .from(JOBS)
        .select("*")
        // 열쇠는 사용자마다 따로다. 남과 같은 값을 써도 남남이어야 한다.
        .eq("user_id", input.userId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();

      const existing = found as Row | null;
      const decision = resolveSubmission(
        existing
          ? {
              id: existing.id,
              fingerprint: existing.fingerprint,
              generation: existing.generation,
              leaseUntil: existing.lease_until ? new Date(existing.lease_until) : null,
            }
          : null,
        input.fingerprint,
      );
      if (decision.kind !== "create") return decision;

      const { data, error } = await admin
        .from(JOBS)
        .insert({
          user_id: input.userId,
          team_id: input.teamId,
          document_id: input.documentId,
          revision: input.revision,
          operation: input.operation,
          section_ids: input.sectionIds,
          idempotency_key: input.idempotencyKey,
          fingerprint: input.fingerprint,
          reservation_request_id: input.reservationRequestId,
        })
        .select("id")
        .single();

      if (error) {
        /*
          **동시에 둘이 눌렀을 때.** 위에서 못 찾았는데 넣는 사이에 남이 먼저
          넣으면 unique 제약에 걸린다(`23505`). 그때는 방금 생긴 그 줄을 다시
          읽어 같은 판단을 내린다 — 여기서 던지면 사용자는 이미 만들어진 작업을
          못 보고 다시 눌러 두 번 낸다.
        */
        if ((error as { code?: string }).code !== "23505") throw error;
        const { data: raced } = await admin
          .from(JOBS)
          .select("*")
          .eq("user_id", input.userId)
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        const row = raced as Row | null;
        if (!row) throw error;
        return resolveSubmission(
          {
            id: row.id,
            fingerprint: row.fingerprint,
            generation: row.generation,
            leaseUntil: row.lease_until ? new Date(row.lease_until) : null,
          },
          input.fingerprint,
        ) as CreateJobResult;
      }

      return { kind: "created", jobId: (data as { id: string }).id };
    },

    async get(jobId: string, userId: string): Promise<JobRecord | null> {
      const row = await rowOf(jobId, userId);
      // 남의 것이면 **없는 것과 똑같이** 답한다.
      if (!row) return null;
      return toRecord(row, await itemsOf(jobId));
    },

    async advance(jobId: string, userId: string, event: PdpJobEvent): Promise<JobRecord> {
      const row = await rowOf(jobId, userId);
      if (!row) throw new Error(`작업을 찾지 못했거나 권한이 없습니다: ${jobId}`);

      // 전이 판단은 상태 기계 한 곳에서만 한다. 여기서 또 적으면 갈린다.
      const next = advanceJob(
        {
          generation: row.generation,
          settlement: row.settlement,
          persistence: row.persistence,
          submission: row.submission,
        },
        event,
      );
      const done = isTerminal(next);

      const { data, error } = await admin
        .from(JOBS)
        .update({
          generation: next.generation,
          settlement: next.settlement,
          persistence: next.persistence,
          submission: next.submission,
          // 끝난 작업은 아무도 다시 잡지 않는다.
          ...(done ? { lease_owner: null, lease_until: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) throw error;

      return toRecord(data as Row, await itemsOf(jobId));
    },

    async claimNext(workerId: string, leaseMs: number): Promise<JobRecord | null> {
      const now = new Date();
      const nowIso = now.toISOString();

      const { data: candidates } = await admin
        .from(JOBS)
        .select("*")
        .not("generation", "in", "(completed,review_required,partial,failed)")
        // 아직 예약도 안 된 작업은 라우트가 쥐고 있다. 워커가 가로채지 않는다.
        .neq("generation", "validated")
        .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
        .order("created_at")
        .limit(10);

      for (const row of (candidates ?? []) as Row[]) {
        /*
          **잡기는 조건부 update 로 한다.** 읽고 나서 쓰면 그 사이에 남이 잡을 수
          있고, 둘이 같은 작업을 돌리면 같은 그림을 두 번 만들어 두 번 낸다.
          `updated_at` 이 그대로일 때만 바뀌므로, 먼저 쓴 쪽만 이긴다.
        */
        const { data: claimed } = await admin
          .from(JOBS)
          .update({
            lease_owner: workerId,
            lease_until: new Date(now.getTime() + leaseMs).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("updated_at", row.updated_at)
          .select("*")
          .maybeSingle();

        if (claimed) return toRecord(claimed as Row, await itemsOf(row.id));
      }
      return null;
    },

    async recordItem(jobId: string, item: JobItemRecord): Promise<void> {
      const { error } = await admin.from(ITEMS).upsert(
        {
          job_id: jobId,
          section_id: item.sectionId,
          attempt: item.attempt,
          provider_request_id: item.providerRequestId ?? null,
          model: item.model ?? null,
          output_path: item.outputPath ?? null,
          qa: item.qa ?? null,
          error_code: item.errorCode ?? null,
          cost_usd: item.costUsd ?? null,
          updated_at: new Date().toISOString(),
        },
        // 같은 (섹션, 시도)는 한 줄이다. 두 줄이 되면 같은 그림을 두 번 센다.
        { onConflict: "job_id,section_id,attempt" },
      );
      if (error) throw error;
    },
  };
}
