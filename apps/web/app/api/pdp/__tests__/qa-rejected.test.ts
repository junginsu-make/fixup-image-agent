import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **검수 불합격은 「끝났는지 모르는」 실패가 아니다**(2026-10-07 운영 조사).
 *
 * fal 은 그림을 돌려줬고 우리가 검수에서 버렸다. 끝난 것이 확실한데도 한 장
 * 다시 만들기는 `completionConfirmed` 를 안 넘겨, 장부가 「끝났는지 모름」
 * (needs_review)으로 보내 1크레딧이 계속 묶였다. 일괄 경로는 처음부터 넘겼다.
 *
 * fal 자체 실패 · 시간 초과는 정말 모른다 — 그쪽은 그대로 둔다.
 */
const state = vi.hoisted(() => ({ settle: vi.fn(), generate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => ({ ok: true, userId: "u1", requestId: "r1" }),
  finalizeAiUsage: vi.fn(),
  settleAiUsage: state.settle,
}));
vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<typeof import("@fixup/pdp-core")>("@fixup/pdp-core");
  return { ...actual, generateSectionImage: state.generate };
});
vi.mock("../../../../lib/pdp/providers", () => ({ createPdpProviders: () => ({ llm: { generate: vi.fn() } }) }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));

const { PdpServiceError } = await import("@fixup/pdp-core");
const { POST: single } = await import("../images/route");
const { POST: batch } = await import("../images/batch/route");

const section = { section_id: "s1", headline: "제품", bullets: [], prompt_en: "a product", layout_notes: "" };
const request = (data: unknown) => new Request("http://local/api/pdp", { method: "POST", body: JSON.stringify(data) });
const body = () => ({ originalImageBase64: "AAAA", aspectRatio: "3:4", section, sections: [section] });

/** 검수 모델이 적는 설명에는 사용자 카피가 섞일 수 있다. 기록에 나오면 안 된다. */
const 사용자글 = "봄맞이 특가 비밀문구";
const qaRejected = () =>
  new PdpServiceError(
    "PDP_IMAGE_QA_REJECTED",
    "생성 결과가 품질 기준에 미달했습니다.",
    JSON.stringify([
      { type: "forbidden_brand", severity: "critical", evidence: `${사용자글} 옆 로고 https://x.example/a.png`, correctionHint: "remove logo" },
      { type: "text_typo", severity: "minor", location: "headline", evidence: `제목 「${사용자글}」 오타`, correctionHint: "fix" },
    ]),
    2,
  );

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  state.settle.mockResolvedValue(undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const 정산 = () => state.settle.mock.calls[0] as [unknown, boolean, number, string, Record<string, unknown>];

describe("한 장 다시 만들기의 실패 정산", () => {
  it("검수 불합격은 끝난 것이 확실하다 — 예약을 바로 푼다", async () => {
    state.generate.mockRejectedValue(qaRejected());
    const response = await single(request(body()));

    expect(response.status).toBe(422);
    expect(state.settle).toHaveBeenCalledTimes(1);
    const [, success, units, code, cost] = 정산();
    expect([success, units, code]).toEqual([false, 0, "PDP_IMAGE_QA_REJECTED"]);
    expect(cost).toMatchObject({ billableImages: 2, completionConfirmed: true });
  });

  it("fal 자체 실패는 끝났는지 모른다 — 지금처럼 확인 대기로 둔다", async () => {
    state.generate.mockRejectedValue(new PdpServiceError("AI_PROVIDER_UNAVAILABLE", "업체 장애", "fal 503"));
    await single(request(body()));

    const [, success, units, , cost] = 정산();
    expect([success, units]).toEqual([false, 0]);
    expect(cost.completionConfirmed).not.toBe(true);
  });

  it("알 수 없는 오류(시간 초과 등)도 지금처럼 둔다", async () => {
    state.generate.mockRejectedValue(new Error("fal request timed out"));
    await single(request(body()));

    expect(정산()[4].completionConfirmed).not.toBe(true);
  });
});
