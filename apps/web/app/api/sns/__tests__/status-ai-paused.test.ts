import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **운영자가 멈추면 카드뉴스 상태 조회가 다음 장을 안 보낸다**(설계 2026-09-30 §3.3·§5).
 *
 * 카드뉴스는 예약을 한 번 잡고 상태 조회가 한 장씩 보낸다 — 새 요청이 아니라서 `credit_reserve`
 * 의 멈춤 검사를 다시 안 지난다. 그래서 여기서 스위치를 읽고, 켜져 있으면 사이드바 「중지」와
 * 같은 길(`stopQueuedGeneration` + `settleSnsReservation`)을 탄다. 받아 둔 카드는 남는다.
 */
vi.mock("server-only", () => ({}));

const order: string[] = [];
let paused = false;
let saved: { status: string; flow: { cards: Array<{ index: number; status: string; error?: string }> } } | undefined;

const flow = () => ({
  cards: [
    { index: 1, kind: "generated", status: "done" },
    { index: 2, kind: "generated", status: "pending" },
  ],
  costs: [],
  generation: { selectedCardIndexes: [1, 2], reservationId: "33333333-3333-4333-8333-333333333333" },
});

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/ai-control/pause", () => ({ isAiPaused: async () => paused }));
vi.mock("../../../../lib/sns/project-lock", () => ({ withSnsProjectLock: async (_id: string, run: () => Promise<Response>) => run() }));
vi.mock("../../../../lib/sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({
    get: async () => ({ id: "p1", modelId: "nano-banana-pro", data: { flow: flow() } }),
    save: async (_id: string, next: unknown, status: string) => {
      order.push("save");
      saved = { status, flow: next as never };
      return { id: "p1", status, data: { flow: next } };
    },
  }),
  snsWriteDenied: () => undefined,
}));
vi.mock("../../../../lib/sns-generation-store", () => ({ snsSubmittedGenerationRequestStoreForUser: () => ({}) }));
vi.mock("../../../../lib/sns/settle", () => ({
  settleSnsReservation: async (_user: string, next: unknown) => { order.push("settle"); return next; },
}));
vi.mock("../../../../lib/sns/providers", () => ({
  createSnsGenerationProviders: () => { order.push("providers"); return {}; },
  SnsProviderConfigurationError: class extends Error { status = 503; },
}));
vi.mock("../../../../lib/sns/runtime", () => ({
  refreshProjectAssetUrls: async (value: unknown) => value,
  createQueuedGenerationDependencies: async () => ({}),
}));
vi.mock("../../../../lib/sns/queued-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns/queued-flow")>()),
  pollQueuedFlow: async (_project: unknown, current: unknown) => { order.push("poll"); return current; },
}));

const { POST } = await import("../projects/[id]/status/route");
const call = () => POST(new Request("http://local/api/sns/projects/p1/status", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  order.length = 0;
  saved = undefined;
});

describe("멈춤이 켜져 있으면", () => {
  beforeEach(() => { paused = true; });

  it("다음 장을 안 보내고 중지 길을 탄다 — 정산하고 끝난 흐름으로 저장", async () => {
    const response = await call();
    const body = await response.json();

    expect(order).toEqual(["settle", "save"]);
    expect(body).toMatchObject({ ok: true, active: false, paused: true });
    expect(saved?.status).toBe("ready");
  });

  it("받아 둔 카드는 남기고, 못 만든 카드에는 멈춘 까닭을 적는다", async () => {
    await call();
    expect(saved?.flow.cards).toEqual([
      expect.objectContaining({ index: 1, status: "done" }),
      expect.objectContaining({ index: 2, status: "failed", error: expect.stringContaining("운영자가 AI 사용을 멈춰") }),
    ]);
  });
});

describe("멈춤이 꺼져 있으면", () => {
  it("지금처럼 다음 장을 본다", async () => {
    paused = false;
    await call();
    expect(order).toContain("poll");
    expect(order).not.toContain("settle");
  });
});
