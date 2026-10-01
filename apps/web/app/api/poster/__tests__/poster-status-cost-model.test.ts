import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자 원가 화면은 실제로 쓴 모델로 값을 매긴다**(2026-09-29 사용자 요청).
 *
 * 원가 화면은 `generation_events.model` × `model_prices` 로 값을 낸다
 * (`202609100004_llm_cost.sql`). 그런데 결과를 받아 확정할 때 **작업의 모델**
 * (`project.modelId`)을 적고 있었다. 처음 만들기는 고른 모델이 그 비율을 못
 * 만들면 다른 모델로 바꾸고(`chooseModelForRatio`), 고치기는 부모 그림의 모델을
 * 쓴다 — 그런 요청은 **다른 모델의 단가**로 원가가 잡혔다.
 *
 * 실제로 쓴 모델은 제출할 때 요청 줄(`poster_generation_requests.model_id`)에
 * 적힌다(`flow.ts`). 그것을 읽어 적는다. 회원이 깎이는 장수는 원래 요청 줄의
 * 단가를 쓰므로 이 변경과 무관하다.
 */

vi.mock("server-only", () => ({}));

const costs: Array<{ model: string } | undefined> = [];
let project: { id: string; modelId: string; data: Record<string, unknown> } | undefined;
let requestModel: string | null = null;
/** 조회가 실패하는 경우. */
let modelLookupFails = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  finalizeAiUsage: async (
    _reservation: unknown, _success: boolean, _units: number, _errorCode?: string, cost?: { model: string },
  ) => { costs.push(cost); },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => project,
      update: async (_id: string, patch: Record<string, unknown>) => Object.assign(project!, patch),
    },
    requests: {
      unitCost: async () => 0.1,
      complete: async () => {},
      // **어느 줄을 묻는지 가린다.** 인자를 무시하면 엉뚱한 줄(작업 id 등)을 읽어도
      // 통과한다 — 운영에서는 그때 null 이 와 조용히 작업의 모델로 돌아간다(2026-09-29 리뷰).
      modelOf: async (id: string) => {
        if (modelLookupFails) throw new Error("DB unavailable");
        return id === "r1" ? requestModel : null;
      },
    },
    images: { byProject: async () => [], add: async () => [] },
  }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({
    queue: {
      jobStatus: async () => "completed",
      // 결과가 없어도 확정은 한다 — 여기서 보는 것은 무엇을 적느냐다.
      jobResult: async () => ({ images: [] }),
    },
  }),
  PosterProviderConfigurationError: class extends Error {
    missing: string[] = [];
  },
}));

const { POST } = await import("../projects/[id]/status/route");

const call = () =>
  POST(
    new Request("http://localhost/api/poster/projects/p1/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestRowId: "r1", falRequestId: "f1", endpoint: "openai/gpt-image-2.5/sunburst/edit" }),
    }),
    { params: Promise.resolve({ id: "p1" }) },
  );

beforeEach(() => {
  costs.length = 0;
  requestModel = null;
  modelLookupFails = false;
  project = { id: "p1", modelId: "nano-banana-pro", data: { reservationId: "res-1" } };
});

describe("원가 장부에 적는 모델", () => {
  it("요청 줄에 적힌 실제 모델을 적는다 — 작업의 모델이 아니다", async () => {
    // 작업은 nano-banana-pro 로 골랐지만 그 비율을 못 만들어 flare 로 만들었다.
    requestModel = "gpt-image-2.5-flare";
    await call();
    expect(costs).toHaveLength(1);
    expect(costs[0]?.model).toBe("gpt-image-2.5-flare");
  });

  it("요청 줄에 모델이 없는 옛 기록이면 작업의 모델로 떨어진다 — 지금까지와 같다", async () => {
    requestModel = null;
    await call();
    expect(costs[0]?.model).toBe("nano-banana-pro");
  });
});

describe("모델 조회가 실패해도", () => {
  it("확정은 한다 — 작업의 모델로 적고 결과를 돌려준다", async () => {
    modelLookupFails = true;
    const response = await call();
    expect(response.status).toBe(200);
    expect(costs[0]?.model).toBe("nano-banana-pro");
  });
});
