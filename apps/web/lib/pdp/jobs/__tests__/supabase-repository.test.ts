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
      // **무엇으로 정렬하는지까지 본다.** 안 재면 정렬을 지워도 통과한다.
      order: (column: string, options?: unknown) => (call.filters.push(["order", column, options]), chain),
      limit: (count: number) => (call.filters.push(["limit", String(count), null]), chain),
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

const 인자 = (call: Call | undefined, kind: string) =>
  (call?.filters ?? []).find(([op]) => op === kind)?.[2];

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

/**
 * **문서로 찾을 때도 남의 것을 읽지 않는다**(K-04).
 *
 * 이 길은 사용자가 **자기 초안 id** 만 들고 들어온다. `user_id` 를 빠뜨리면
 * 초안 id 를 아는 것만으로 남의 그림을 되찾는다 — service role 은 RLS 를
 * 지나치므로 코드가 빠뜨리면 막아 주는 것이 없다.
 */
describe("문서로 찾을 때", () => {
  it("**user_id·document_id·revision 셋으로 좁힌다**", async () => {
    const { client, calls } = 기록하는클라이언트();

    await createSupabaseJobRepository(client as never).findLatestForDocument("u1", "doc-1", 3);

    const 찾기 = calls[0];
    expect(열(찾기, "eq")).toEqual(expect.arrayContaining(["user_id", "document_id", "revision"]));
  });

  it("**없으면 `null` 이다** — 섹션을 읽으러 가지 않는다", async () => {
    const { client, calls } = 기록하는클라이언트();

    expect(await createSupabaseJobRepository(client as never).findLatestForDocument("u1", "doc-1", 3)).toBeNull();
    // 작업이 없는데 섹션 표를 또 읽으면 헛걸음이다.
    expect(calls).toHaveLength(1);
  });

  /**
   * **가장 나중 것을 준다.**
   *
   * 같은 개정판으로 여러 번 만들었으면 마지막 것이 사용자가 기억하는 화면이다.
   * 정렬을 빠뜨리면 DB 가 주는 순서대로 아무거나 온다 — 옛 작업이 올 수 있다.
   */
  it("**만든 차례의 역순으로 첫 줄만 읽는다**", async () => {
    const { client, calls } = 기록하는클라이언트();

    await createSupabaseJobRepository(client as never).findLatestForDocument("u1", "doc-1", 3);

    expect(열(calls[0], "order")).toEqual(["created_at"]);
    expect(인자(calls[0], "order")).toEqual({ ascending: false });
    expect(열(calls[0], "limit")).toEqual(["1"]);
  });

  /**
   * **섹션 결과도 함께 와야 한다.** 되찾을 그림이 거기 적혀 있다. 작업 줄만
   * 주면 화면은 「작업은 있는데 그림이 없다」로 읽고 아무것도 못 되찾는다.
   */
  it("**찾았으면 그 작업의 섹션을 읽는다**", async () => {
    const { client, calls } = 기록하는클라이언트({
      pdp_generation_jobs: [{
        id: "job-7", user_id: "u1", team_id: null, document_id: "doc-1", revision: 3,
        operation: "pdp_image", section_ids: ["s1"], reservation_request_id: "res-1",
        idempotency_key: "k1", fingerprint: "f1",
        generation: "completed", settlement: "settled", persistence: "stored", submission: "known",
        lease_until: null, lease_owner: null,
        created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:01:00Z",
      }],
      pdp_generation_items: [{ job_id: "job-7", section_id: "s1", attempt: 1, output_path: "u1/j/s1.png" }],
    });

    const found = await createSupabaseJobRepository(client as never).findLatestForDocument("u1", "doc-1", 3);

    expect(found?.id).toBe("job-7");
    expect(found?.items.map((item) => item.outputPath)).toEqual(["u1/j/s1.png"]);
    // 섹션 표를 **그 작업 번호로** 읽는다. 다른 값으로 읽으면 남의 것이 온다.
    const 섹션읽기 = calls.find((call) => call.table === "pdp_generation_items");
    expect((섹션읽기?.filters ?? []).some(([op, column, value]) => op === "eq" && column === "job_id" && value === "job-7")).toBe(true);
  });
});
