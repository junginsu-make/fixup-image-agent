import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **카드뉴스 기획·게시글 문구도 예약을 거친다**(설계 2026-09-30 §3.1).
 *
 * 둘 다 회원 확인만 하고 예약 없이 웹검색 조사·Apify·글 모델을 불렀다. 그래서
 * 크레딧이 없어도, 운영자가 멈춰도 돌았다. 새 작업 이름은 안 만든다 —
 * `sns_image` + `sns:{id}:plan` / `sns:{id}:caption`, 0 크레딧이다.
 */
vi.mock("server-only", () => ({}));

const order: string[] = [];
const reserveCalls: Array<{ operation: string; units: number; resource?: string }> = [];
const settleCalls: Array<{ success: boolean; code?: string }> = [];
let reserveOk = true;
let project: Record<string, unknown> | undefined;
let providerThrows: Error | null = null;
let 정산결과: unknown = { remaining: 0 };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async (_request: Request, operation: string, units: number, plan?: { resource: string }) => {
    order.push("reserve");
    reserveCalls.push({ operation, units, resource: plan?.resource });
    return reserveOk
      ? { ok: true as const, userId: "u1", requestId: "sns-request", usage: undefined }
      : {
          ok: false as const,
          response: Response.json({ ok: false, code: "credits_required", message: "크레딧이 없어 이 기능을 쓸 수 없습니다." }, { status: 403 }),
        };
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, code?: string) => {
    order.push("settle");
    settleCalls.push({ success, code });
    return 정산결과;
  },
}));

vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({
    get: async () => project,
    save: async (id: string, flow: unknown, status: string) => {
      order.push("save");
      return { id, status, data: { flow } };
    },
  }),
  snsWriteDenied: () => undefined,
}));

vi.mock("../../../../lib/sns/actual-flow", () => ({
  createActualPlanningFlow: async () => {
    order.push("plan");
    if (providerThrows) throw providerThrows;
    return { cards: [] };
  },
}));

vi.mock("../../../../lib/sns/source-adapters", () => ({ createSourceAdapters: () => ({}) }));

vi.mock("../../../../lib/sns/providers", () => ({
  createSnsPlanningProviders: () => ({ captionPrimary: {}, captionBackup: undefined }),
  SnsProviderConfigurationError: class extends Error { status = 503; },
}));

vi.mock("../../../../lib/sns/runtime", () => ({
  replaceSnsCardRows: async () => undefined,
  refreshProjectAssetUrls: async (value: unknown) => value,
}));

vi.mock("@fixup/sns-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fixup/sns-core")>()),
  writeCaption: async () => {
    order.push("caption");
    if (providerThrows) throw providerThrows;
    return { caption: "게시글", issues: [] };
  },
}));

const planRoute = await import("../projects/[id]/plan/route");
const captionRoute = await import("../projects/[id]/caption/route");

type Route = { POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
const post = (route: Route) =>
  route.POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  order.length = 0;
  reserveCalls.length = 0;
  settleCalls.length = 0;
  reserveOk = true;
  providerThrows = null;
  정산결과 = { remaining: 0 };
  project = {
    id: "p1", title: "제목", toneNote: undefined, language: "ko", status: "ready",
    data: { flow: { cards: [{ copy: { headline: "머리", body: "본문" } }] } },
  };
});

describe.each([
  { name: "기획·원고", route: planRoute as Route, step: "plan", resource: "sns:p1:plan", failure: "sns_plan_failed" },
  { name: "게시글 문구", route: captionRoute as Route, step: "caption", resource: "sns:p1:caption", failure: "sns_caption_failed" },
])("카드뉴스 $name", ({ route, step, resource, failure }) => {
  it("부르기 전에 기존 작업 이름과 제 resource 로 자리를 잡는다", async () => {
    await post(route);
    expect(order.slice(0, 2)).toEqual(["reserve", step]);
    expect(reserveCalls).toEqual([{ operation: "sns_image", units: 0, resource }]);
  });

  it("자리를 못 잡으면 부르지 않고 그 거절을 그대로 돌려준다", async () => {
    reserveOk = false;
    const response = await post(route);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("credits_required");
    expect(order).not.toContain(step);
  });

  it("없는 작업이면 자리를 잡지 않는다", async () => {
    project = undefined;
    const response = await post(route);
    expect(response.status).toBe(404);
    expect(reserveCalls).toEqual([]);
  });

  it("끝나면 성공으로 닫는다", async () => {
    const response = await post(route);
    expect(response.status).toBe(200);
    expect(settleCalls).toEqual([{ success: true, code: undefined }]);
  });

  it("부르다 실패해도 닫는다 — 안 닫으면 예약이 만료까지 남는다", async () => {
    providerThrows = new Error("모델이 죽었다");
    const response = await post(route);
    expect(response.status).toBe(500);
    expect(settleCalls).toEqual([{ success: false, code: failure }]);
  });

  it("정산이 못 닫혀도 결과는 돌려준다", async () => {
    정산결과 = undefined;
    const response = await post(route);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
