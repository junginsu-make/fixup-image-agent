import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { advanceJob, initialJobState, isTerminal } from "./state";
import { leaseExpiredAt, resolveSubmission } from "./claim";
import type {
  CreateJobInput,
  CreateJobResult,
  JobItemRecord,
  JobRecord,
  PdpJobRepository,
} from "./repository";

/**
 * 로컬 개발용 작업 저장소. `LOCAL_STORE=1` 에서 쓴다.
 *
 * ── 왜 파일인가 ────────────────────────────────────────────────
 *
 * 메모리에 두면 서버를 다시 띄울 때마다 날아간다. 그런데 이 기능이 하려는 일이
 * 바로 **「다시 띄워도 되찾기」** 다 — 메모리에 두면 고치려는 것을 로컬에서
 * 확인할 수 없다.
 *
 * ── 운영과 같은 답을 낸다 ──────────────────────────────────────
 *
 * `__tests__/repository.test.ts` 의 계약 시험이 이 구현으로 돈다. Supabase
 * 구현도 같은 시험을 통과해야 한다.
 *
 * **운영 값을 여기 채우지 않는다**(저장소 CLAUDE.md). 이 저장소는 로컬 파일만 본다.
 */

interface LocalJobsFile {
  version: 1;
  jobs: JobRecord[];
}

export function createLocalJobRepository(root: string): PdpJobRepository {
  const file = path.join(root, "pdp-jobs.json");

  function read(): LocalJobsFile {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as LocalJobsFile;
    } catch {
      return { version: 1, jobs: [] };
    }
  }

  function write(data: LocalJobsFile): void {
    mkdirSync(root, { recursive: true });
    /*
      **먼저 옆에 쓰고 바꿔 끼운다.** 쓰다가 죽으면 반쯤 쓰인 파일이 남고,
      다음에 읽을 때 통째로 못 읽는다 — 되찾으려던 작업을 파일이 깨져 잃는다.
    */
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
    renameSync(temporary, file);
  }

  function keyOf(userId: string, idempotencyKey: string): string {
    return `${userId}::${idempotencyKey}`;
  }

  /** 열쇠는 사용자마다 따로다. 남과 같은 값을 써도 남남이어야 한다. */
  const keyIndex = new Map<string, string>();

  function rebuildIndex(jobs: JobRecord[]): void {
    keyIndex.clear();
    for (const job of jobs) {
      keyIndex.set(keyOf(job.userId, job.idempotencyKey), job.id);
    }
  }

  return {
    async createOrGet(input: CreateJobInput): Promise<CreateJobResult> {
      const data = read();
      rebuildIndex(data.jobs);

      const existingId = keyIndex.get(keyOf(input.userId, input.idempotencyKey));
      const existing = existingId ? data.jobs.find((job) => job.id === existingId) : undefined;

      const decision = resolveSubmission(
        existing
          ? {
              id: existing.id,
              fingerprint: existing.fingerprint,
              generation: existing.state.generation,
              leaseUntil: existing.leaseUntil ? new Date(existing.leaseUntil) : null,
            }
          : null,
        input.fingerprint,
      );
      if (decision.kind !== "create") return decision;

      const now = new Date().toISOString();
      const job: JobRecord = {
        id: randomUUID(),
        userId: input.userId,
        teamId: input.teamId,
        documentId: input.documentId,
        revision: input.revision,
        operation: input.operation,
        sectionIds: input.sectionIds,
        reservationRequestId: input.reservationRequestId,
        fingerprint: input.fingerprint,
        idempotencyKey: input.idempotencyKey,
        state: initialJobState(),
        leaseUntil: null,
        leaseOwner: null,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
      data.jobs.push(job);
      write(data);
      return { kind: "created", jobId: job.id };
    },

    async get(jobId: string, userId: string): Promise<JobRecord | null> {
      const job = read().jobs.find((entry) => entry.id === jobId);
      // 남의 것이면 **없는 것과 똑같이** 답한다. 있다는 사실도 알려 주지 않는다.
      if (!job || job.userId !== userId) return null;
      return job;
    },

    async advance(jobId, userId, event) {
      const data = read();
      const job = data.jobs.find((entry) => entry.id === jobId);
      if (!job || job.userId !== userId) {
        throw new Error(`작업을 찾지 못했거나 권한이 없습니다: ${jobId}`);
      }

      job.state = advanceJob(job.state, event);
      job.updatedAt = new Date().toISOString();
      // 끝난 작업은 아무도 다시 잡지 않는다.
      if (isTerminal(job.state)) {
        job.leaseUntil = null;
        job.leaseOwner = null;
      }
      write(data);
      return job;
    },

    async claimNext(workerId, leaseMs) {
      const data = read();
      const now = new Date();

      const job = data.jobs.find(
        (entry) =>
          !isTerminal(entry.state) &&
          // 아직 예약도 안 된 작업은 라우트가 쥐고 있다. 워커가 가로채지 않는다.
          entry.state.generation !== "validated" &&
          leaseExpiredAt(entry.leaseUntil ? new Date(entry.leaseUntil) : null, now),
      );
      if (!job) return null;

      job.leaseOwner = workerId;
      job.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      job.updatedAt = now.toISOString();
      write(data);
      return job;
    },

    async recordItem(jobId: string, item: JobItemRecord) {
      const data = read();
      const job = data.jobs.find((entry) => entry.id === jobId);
      if (!job) throw new Error(`작업을 찾지 못했습니다: ${jobId}`);

      // 같은 (섹션, 시도)는 한 줄이다. 나중 것이 이긴다 — 저장이 끝난 뒤에
      // 경로가 생기므로, 덮어쓰지 않으면 경로 없는 줄이 남는다.
      const at = job.items.findIndex(
        (entry) => entry.sectionId === item.sectionId && entry.attempt === item.attempt,
      );
      if (at >= 0) job.items[at] = { ...job.items[at], ...item };
      else job.items.push(item);

      job.updatedAt = new Date().toISOString();
      write(data);
    },

    async debugRaw() {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    },
  };
}
