import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SnsFlowState } from "../../../app/api/sns/flow-service";
const { finalize } = vi.hoisted(() => ({ finalize: vi.fn() }));
vi.mock("../../membership/api", () => ({ finalizeAiUsage: finalize }));
import { settleSnsReservation } from "../settle";

function flow(status: "done" | "failed" = "done"): SnsFlowState {
  return { stage: "result", planningIssues: [], copyIssues: [], cards: [{ index: 0, status, kind: "generated", role: "body", copy: { index: 0, headline: "Test" } }],
    costs: [{ cardIndex: 0, costUsd: .15 }, { cardIndex: 0, costUsd: .15 }, { cardIndex: 0, costUsd: .15 }, { cardIndex: 0, costUsd: .15 }],
    generation: { selectedCardIndexes: [0], falReferenceUrls: {}, startedAt: "2026-09-22T00:00:00Z", reservationId: "request", costBaselineCount: 1, costBaselineUsd: .15 },
  };
}
describe("완성 카드와 내부 API 호출을 따로 정산", () => {
  beforeEach(() => { finalize.mockReset(); });
  it("3개의 새 그림 슬롯은 회사 원가 3장, 회원에게는 카드 1장", async () => {
    finalize.mockResolvedValue({ settlementPending: false });
    const result = await settleSnsReservation("user", flow(), "nano-banana-pro");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ billableImages: 3, deliveredImages: 1, completionConfirmed: true });
    expect(result.generation?.reservationId).toBeUndefined();
  });
  it("중지로 실패 표시된 카드는 제공사 완료 증거가 아니며 예약 연결을 남긴다", async () => {
    finalize.mockResolvedValue({ settlementPending: true });
    const result = await settleSnsReservation("user", flow("failed"), "nano-banana-pro");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ deliveredImages: 0, completionConfirmed: false });
    expect(result.generation?.reservationId).toBe("request");
  });
  it("정산 RPC 장애에서도 재처리 연결을 잃지 않는다", async () => {
    finalize.mockRejectedValue(new Error("DB unavailable"));
    expect((await settleSnsReservation("user", flow())).generation?.reservationId).toBe("request");
  });
});

/*
 * **장부에는 이번 회차에 실제로 쓴 모델을 적는다**(2026-09-29 사용자 요청).
 *
 * 관리자 원가 화면은 장부의 모델 × 모델별 단가로 원가를 낸다. 칸 배치형은 칸 비율
 * 때문에 모델이 바뀔 수 있는데 작업의 모델을 적어, 다른 모델의 단가로 잡혔다.
 * 한 회차에 모델이 섞이면 **가장 많이 쓴 모델**을 적는다 — 장부 한 줄에 모델이
 * 하나라 정확히 나눌 수는 없다. 옛 기록(모델 없음)은 작업의 모델로 센다.
 */
describe("원가 장부의 모델", () => {
  beforeEach(() => { finalize.mockReset(); finalize.mockResolvedValue({ settlementPending: false }); });
  const withModels = (models: Array<string | undefined>): SnsFlowState => ({
    ...flow(),
    costs: [{ cardIndex: 0, costUsd: .15, modelId: "옛회차모델" }, ...models.map((modelId) => ({ cardIndex: 0, costUsd: .15, ...(modelId ? { modelId } : {}) }))],
  });

  it("이번 회차에 실제로 쓴 모델을 적는다 — 작업의 모델이 아니다", async () => {
    await settleSnsReservation("user", withModels(["gpt-image-2.5-flare", "gpt-image-2.5-flare", "gpt-image-2.5-flare"]), "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "gpt-image-2.5-flare" });
  });

  it("섞였으면 가장 많이 쓴 모델이다 — 옛 기록은 작업의 모델로 센다", async () => {
    await settleSnsReservation("user", withModels(["gpt-image-2.5-flare", undefined, undefined]), "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "nano-banana" });
  });

  it("앞 회차 기록은 안 센다", async () => {
    // 기준선(1) 앞의 「옛회차모델」은 이번 회차가 아니다.
    await settleSnsReservation("user", withModels(["gpt-image-2.5-flare"]), "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "gpt-image-2.5-flare" });
  });

  it("동점이면 작업의 모델이다", async () => {
    await settleSnsReservation("user", withModels(["gpt-image-2.5-flare", undefined]), "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "nano-banana" });
  });

  it("아직 값이 안 나온 장(중지 등)의 모델은 세지 않는다 — 청구 장수와 같은 장만 센다", async () => {
    const stopped: SnsFlowState = {
      ...withModels(["gpt-image-2.5-flare"]),
    };
    stopped.costs = [
      ...stopped.costs,
      { cardIndex: 0, costUsd: null, modelId: "gpt-image-2.5-sunburst" },
      { cardIndex: 0, costUsd: null, modelId: "gpt-image-2.5-sunburst" },
    ];
    await settleSnsReservation("user", stopped, "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "gpt-image-2.5-flare", billableImages: 1 });
  });

  it("모델 기록이 하나도 없으면 작업의 모델 — 지금까지와 같다", async () => {
    await settleSnsReservation("user", withModels([undefined, undefined]), "nano-banana");
    expect(finalize.mock.calls[0]![4]).toMatchObject({ model: "nano-banana" });
  });
});
