import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **예약마다 프로세스 표식을 남긴다**(설계 §3.5). 재시작 뒤 새 프로세스가 「내 것이 아닌
 * 예약」을 가려 정리한다. 표식을 못 남겨도 사용자의 생성은 막지 않는다 — 그 예약은
 * 정리 대상에서 빠질 뿐이다(옛 동작).
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>>, failTag: false }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self,
        single: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
        maybeSingle: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
      };
      return self;
    },
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: { allowed: true, reason: "ok", usage: {}, policy: "image-v2" }, error: null }),
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            if (Object.keys(filters).length === 2) {
              state.updates.push({ table, values, filters });
              return Promise.resolve({ error: state.failTag ? { message: "boom" } : null });
            }
            return chain;
          },
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "u1" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const { BOOT_ID } = await import("../../runtime/boot-id");
const REQUEST = "11111111-1111-4111-8111-111111111111";
const req = () => new Request("http://local/api/pdp/images", { headers: { "x-idempotency-key": REQUEST } });

beforeEach(() => { state.updates.length = 0; state.failTag = false; process.env.CREDIT_LEDGER = "1"; });

describe("reserveAiUsage — 프로세스 표식", () => {
  it("예약이 되면 그 줄에 이 프로세스의 표식을 적는다", async () => {
    const result = await reserveAiUsage(req(), "pdp_image", 1, { outputs: [{ width: 1024, height: 1024 }], resource: "pdp:image" });
    expect(result.ok).toBe(true);
    expect(state.updates).toEqual([{ table: "generation_events", values: { boot_id: BOOT_ID }, filters: { user_id: "u1", request_id: REQUEST } }]);
  });

  it("표식은 uuid 이고 프로세스 안에서 바뀌지 않는다", async () => {
    expect(BOOT_ID).toMatch(/^[0-9a-f-]{36}$/);
    expect((await import("../../runtime/boot-id")).BOOT_ID).toBe(BOOT_ID);
  });

  it("표식 실패는 요청을 막지 않는다", async () => {
    state.failTag = true;
    const result = await reserveAiUsage(req(), "pdp_image", 1, { outputs: [{ width: 1024, height: 1024 }], resource: "pdp:image" });
    expect(result.ok).toBe(true);
  });

  it("장부가 꺼져 있으면 적지 않는다", async () => {
    process.env.CREDIT_LEDGER = "";
    await reserveAiUsage(req(), "pdp_image", 1).catch(() => undefined);
    expect(state.updates).toEqual([]);
  });
});
