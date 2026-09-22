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
