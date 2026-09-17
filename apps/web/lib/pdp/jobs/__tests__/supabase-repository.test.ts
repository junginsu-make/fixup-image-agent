import { describe, expect, it } from "vitest";
import { createSupabaseJobRepository } from "../supabase-repository";

/**
 * **운영 저장소가 보내는 질의를 잰다.**
 *
 * 실제 DB 로는 여기서 돌리지 않는다 — 이 저장소의 `.env.local` 은 Supabase 를
 * 일부러 비워 두었고(저장소 CLAUDE.md), 값을 채우면 로컬 시험이 **운영 데이터를
 * 건드린다.** 그래서 계약 전체가 아니라 **사고로 이어지는 지점**만 잰다.
 *
 * 무엇이 사고인가:
 *   - `user_id` 조건이 빠지면 **남의 작업을 읽는다.** service role 은 RLS 를
 *     지나치므로 코드가 빠뜨리면 막아 주는 것이 없다
 *   - 잡기를 조건 없이 쓰면 **두 워커가 같은 작업을 돌려** 같은 그림을 두 번 만든다
 *   - `onConflict` 가 없으면 같은 섹션이 두 줄이 되어 **같은 그림을 두 번 센다**
 *
 * 실제 DB 에서의 검증은 첫 운영 실행 때 한다 — 그 전까지 이 구현은 미검증이다.
 */
type Call = { table: string; op: string; filters: Array<[string, string, unknown]>; payload?: unknown; options?: unknown };

function 기록하는클라이언트(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];

  function builder(table: string, op: string, payload?: unknown, options?: unknown) {
    const call: Call = { table, op, filters: [], payload, options };
    calls.push(call);

    const chain: Record<string, unknown> = {
      eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
      neq: (column: string, value: unknown) => (call.filters.push(["neq", column, value]), chain),
      not: (column: string, _op: string, value: unknown) => (call.filters.push(["not", column, value]), chain),
      or: (expr: string) => (call.filters.push(["or", expr, null]), chain),
      order: () => chain,
      limit: () => chain,
      select: () => chain,
      maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (rows[table] ?? [])[0] ?? { id: "job-1" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
    };
    return chain;
  }

  const client = {
    from: (table: string) => ({
      select: () => builder(table, "select"),
      insert: (payload: unknown) => builder(table, "insert", payload),
      update: (payload: unknown) => builder(table, "update", payload),
      upsert: (payload: unknown, options: unknown) => builder(table, "upsert", payload, options),
    }),
  };
  return { client, calls };
}

const 열 = (call: Call | undefined, kind: string) =>
  (call?.filters ?? []).filter(([op]) => op === kind).map(([, column]) => column);

describe("남의 작업을 읽지 않는다", () => {
  it("**읽을 때 user_id 로 좁힌다**", async () => {
    const { client, calls } = 기록하는클라이언트();
    await createSupabaseJobRepository(client as never).get("job-1", "u1");

    const 조회 = calls.find((call) => call.table === "pdp_generation_jobs" && call.op === "select");
    expect(열(조회, "eq")).toContain("user_id");
    expect(열(조회, "eq")).toContain("id");
  });

  it("**바꿀 때도 user_id 로 좁힌다**", async () => {
    const row = {
      id: "job-1", user_id: "u1", generation: "validated", settlement: "not_started",
      persistence: "pending", submission: "known", lease_until: null, section_ids: [],
    };
    const { client, calls } = 기록하는클라이언트({ pdp_generation_jobs: [row] });
    await createSupabaseJobRepository(client as never).advance("job-1", "u1", { type: "reserved" });

    const 갱신 = calls.find((call) => call.op === "update");
    expect(열(갱신, "eq")).toContain("user_id");
  });

  it("멱등 조회도 사용자별이다 — 남과 같은 열쇠를 써도 남남이어야 한다", async () => {
    const { client, calls } = 기록하는클라이언트();
    await createSupabaseJobRepository(client as never).createOrGet({
      userId: "u1", teamId: null, idempotencyKey: "k1", fingerprint: "f1",
      documentId: "d1", revision: 1, operation: "pdp_image", sectionIds: [], reservationRequestId: "r1",
    });

    const 조회 = calls.find((call) => call.op === "select");
    expect(열(조회, "eq")).toContain("user_id");
    expect(열(조회, "eq")).toContain("idempotency_key");
  });
});

describe("두 워커가 같은 작업을 돌리지 않는다", () => {
  it("**잡기는 조건부 update 다** — 읽고 나서 그냥 쓰면 사이에 남이 잡는다", async () => {
    const row = {
      id: "job-1", user_id: "u1", generation: "reserved", settlement: "pending",
      persistence: "pending", submission: "known", lease_until: null,
      updated_at: "2026-09-17T10:00:00.000Z", section_ids: [],
    };
    const { client, calls } = 기록하는클라이언트({ pdp_generation_jobs: [row] });
    await createSupabaseJobRepository(client as never).claimNext("worker-a", 60_000);

    const 잡기 = calls.find((call) => call.op === "update");
    // 읽었을 때와 `updated_at` 이 같을 때만 바뀐다. 먼저 쓴 쪽만 이긴다.
    expect(열(잡기, "eq")).toContain("updated_at");
    expect((잡기?.payload as { lease_owner?: string })?.lease_owner).toBe("worker-a");
  });

  it("끝난 작업과 아직 예약 전 작업은 후보에서 뺀다", async () => {
    const { client, calls } = 기록하는클라이언트();
    await createSupabaseJobRepository(client as never).claimNext("worker-a", 60_000);

    const 후보 = calls.find((call) => call.op === "select");
    expect(열(후보, "not")).toContain("generation");
    expect(열(후보, "neq")).toContain("generation");
  });
});

describe("같은 결과를 두 줄로 세지 않는다", () => {
  it("**섹션 결과는 upsert 이고 충돌 열쇠가 셋이다**", async () => {
    const { client, calls } = 기록하는클라이언트();
    await createSupabaseJobRepository(client as never).recordItem("job-1", {
      sectionId: "s1", attempt: 1, outputPath: "u1/pdp/d1/s1.png",
    });

    const 쓰기 = calls.find((call) => call.op === "upsert");
    expect((쓰기?.options as { onConflict?: string })?.onConflict).toBe("job_id,section_id,attempt");
  });

  it("**그림이 아니라 경로를 담는다**", async () => {
    const { client, calls } = 기록하는클라이언트();
    await createSupabaseJobRepository(client as never).recordItem("job-1", {
      sectionId: "s1", attempt: 1, outputPath: "u1/pdp/d1/s1.png",
    });

    const payload = calls.find((call) => call.op === "upsert")?.payload as Record<string, unknown>;
    expect(payload.output_path).toBe("u1/pdp/d1/s1.png");
    expect(Object.keys(payload)).not.toContain("image_base64");
  });
});
