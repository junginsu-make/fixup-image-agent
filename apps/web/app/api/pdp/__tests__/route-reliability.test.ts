import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), finalize: vi.fn(), settle: vi.fn(),
  generate: vi.fn(), plan: vi.fn(), loadCharacter: vi.fn(), keyVisual: vi.fn(),
  failSection: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: state.auth,
  reserveAiUsage: state.reserve, finalizeAiUsage: state.finalize, settleAiUsage: state.settle }));
vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<typeof import("@fixup/pdp-core")>("@fixup/pdp-core");
  return { ...actual, generateSectionImage: state.generate, planFromText: state.plan,
    generateKeyVisual: state.keyVisual,
    buildSectionImageOptions: (...args: Parameters<typeof actual.buildSectionImageOptions>) => {
      if (args[1].section.section_id === state.failSection) throw new Error("option assembly failed");
      return actual.buildSectionImageOptions(...args);
    } };
});
vi.mock("../../../../lib/pdp/providers", () => ({ createPdpProviders: () => ({ llm: { executions: [], generate: vi.fn() } }) }));
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: state.loadCharacter }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/style-reference", () => ({ suggestStyleReference: async () => ({ reference: null }) }));
const { POST: batch } = await import("../images/batch/route");
const { POST: single } = await import("../images/route");
const { POST: plan } = await import("../plan-from-text/route");
const { POST: keyVisual } = await import("../key-visual/route");
const section = { section_id: "s1", headline: "제품", bullets: [], prompt_en: "a product", layout_notes: "" };
const body = () => ({ originalImageBase64: "AAAA", aspectRatio: "3:4", sections: [section], section });
const request = (data: unknown) => new Request("http://local/api/pdp", { method: "POST", body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks();
  state.failSection = "";
  state.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  state.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
  state.finalize.mockRejectedValue(new Error("settlement unavailable"));
  state.settle.mockResolvedValue(undefined);
  state.generate.mockResolvedValue({ imageBase64: "RESULT", mimeType: "image/png", generatedImages: 1 });
  state.plan.mockResolvedValue({ brief: { offeringName: "제품" }, blueprint: { sections: [section] } });
  state.keyVisual.mockResolvedValue({ imageBase64: "KV", mimeType: "image/png" });
});

describe("T-INPUT: 예약 전 검증", () => {
  it.each([
    ["숫자 참조", { ...body(), page: { styleReference: { imageBase64: 123, mimeType: "image/png" } } }],
    ["null 본문", null],
    ["잘못된 국가", { ...body(), optionsBySection: { s1: { modelCountry: "mars" } } }],
    ["빈 장면", { ...body(), sections: [{ ...section, prompt_en: "" }] }],
    ["배치 상한 초과", { ...body(), sections: Array.from({ length: 100 }, () => section) }],
  ])("%s는 예약 없이 400", async (_label, data) => {
    const response = await batch(request(data));
    expect(response.status).toBe(400); expect(state.reserve).not.toHaveBeenCalled();
  });
  it("단건 섹션 누락도 예약 없이 400", async () => {
    const response = await single(request({ originalImageBase64: "AAAA", aspectRatio: "3:4" }));
    expect(response.status).toBe(400); expect(state.reserve).not.toHaveBeenCalled();
  });
  it("비인증 요청은 본문을 읽지 않는다", async () => {
    state.auth.mockResolvedValue({ ok: false, response: Response.json({ code: "unauthenticated" }, { status: 401 }) });
    const req = request(body()); const json = vi.spyOn(req, "json");
    expect((await batch(req)).status).toBe(401);
    expect(req.bodyUsed).toBe(false); expect(json).not.toHaveBeenCalled(); expect(state.reserve).not.toHaveBeenCalled();
  });
});
describe("T-SETTLE: 원인과 결과 보존", () => {
  it("부분 성공 뒤 공급자 한도면 결과를 보존하면서 후속 배치를 멈춘다", async () => {
    const { PdpServiceError } = await import("@fixup/pdp-core");
    state.generate.mockResolvedValueOnce({ imageBase64: "RESULT", mimeType: "image/png", generatedImages: 1 })
      .mockRejectedValueOnce(new PdpServiceError("AI_QUOTA_EXCEEDED", "한도", "quota"));
    const response = await batch(request({ ...body(), sections: [section, { ...section, section_id: "s2" }] }));
    const data = await response.json();
    expect(data).toMatchObject({ ok: true, succeeded: 1, status: "partial", stopBatch: true });
    expect(data.results[0].imageBase64).toBe("RESULT");
  });
  it("뒤 섹션 옵션 조립 실패 전에 앞 섹션을 유료 제출하지 않는다", async () => {
    state.failSection = "s2";
    const response = await batch(request({ ...body(), sections: [section, { ...section, section_id: "s2" }] }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(state.generate).not.toHaveBeenCalled();
    expect(state.settle).toHaveBeenCalledTimes(1);
  });
  it("배치 참조 로드 실패도 예약을 한 번 정리한다", async () => {
    state.loadCharacter.mockRejectedValue(new Error("reference unavailable"));
    const response = await batch(request({ ...body(), characterId: "c1" }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(state.settle).toHaveBeenCalledTimes(1);
    expect(state.settle.mock.calls[0].slice(1, 3)).toEqual([false, 0]);
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("기획 성공 뒤 정산 실패가 구성안을 버리지 않는다", async () => {
    const response = await plan(request({ text: "제품 설명", aspectRatio: "3:4" }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.brief.offeringName).toBe("제품");
    expect(state.settle).toHaveBeenCalledTimes(1); expect(state.finalize).not.toHaveBeenCalled();
  });
  it("이미지 실패와 정산 실패가 겹쳐도 원래 원인을 유지한다", async () => {
    const { PdpServiceError } = await import("@fixup/pdp-core");
    state.generate.mockRejectedValue(new PdpServiceError("INVALID_REQUEST", "원래 실패", "bad input"));
    const response = await single(request(body()));
    expect(response.status).toBe(400); expect((await response.json()).message).toBe("원래 실패");
    expect(state.settle).toHaveBeenCalledTimes(1);
  });
});

/**
 * **같은 그림 한 장은 어느 버튼으로 들어와도 같은 값이다.**
 *
 * 2026-09-17 리뷰(C-3·E-6-1): 대표 이미지만 모델과 무관하게 1장을 예약·확정했다.
 * `gpt-image-2.5-flare` 섹션 한 장은 5장인데 대표 한 장은 1장이었다 — 같은
 * 모델로 같은 크기를 만들면서.
 */
describe("T-COST: 대표 이미지", () => {
  it("모델 단가로 예약하고 같은 값으로 차감한다", async () => {
    const response = await keyVisual(
      request({
        brief: { offeringName: "제품" },
        blueprint: { sections: [section] },
        imageModel: "gpt-image-2.5-flare",
      }),
    );

    expect(response.status).toBe(200);
    const 예약한장 = state.reserve.mock.calls[0]![2] as number;
    const 차감한장 = state.settle.mock.calls[0]![2] as number;
    expect(예약한장).toBeGreaterThan(1);
    expect(차감한장).toBe(예약한장);
  });

  it("싼 모델은 그만큼만 받는다", async () => {
    await keyVisual(
      request({ brief: { offeringName: "제품" }, blueprint: { sections: [section] }, imageModel: "nano-banana" }),
    );

    expect(state.reserve.mock.calls[0]![2]).toBe(1);
  });
});

/**
 * **어느 버튼으로 들어와도 같은 모델이 그린다.**
 *
 * 2026-09-17 리뷰(D-9): 단건은 `options.imageModel` 도 봤고 배치는 `page` 만 봤다.
 * 값을 매기는 쪽과 그리는 쪽이 갈리면 「한 장만 다시 만들었더니 결이 달라졌다」가 된다.
 */
describe("T-COST: 단건과 배치의 모델 선택", () => {
  it("페이지가 정한 모델을 두 라우트가 똑같이 쓴다", async () => {
    await single(request({ ...body(), page: { imageModel: "nano-banana" } }));
    const 단건 = state.reserve.mock.calls[0]![2] as number;

    vi.clearAllMocks();
    state.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
    state.settle.mockResolvedValue(undefined);
    state.generate.mockResolvedValue({ imageBase64: "R", mimeType: "image/png", generatedImages: 1 });

    await batch(request({ ...body(), page: { imageModel: "nano-banana" } }));

    expect(state.reserve.mock.calls[0]![2]).toBe(단건);
    expect(단건).toBe(1);
  });

  it("섹션 옵션에만 모델이 있으면 두 라우트가 같은 값을 쓴다", async () => {
    const 모델 = "nano-banana";
    await single(request({ ...body(), options: { imageModel: 모델 } }));
    const 단건예약 = state.reserve.mock.calls[0]![2] as number;

    vi.clearAllMocks();
    state.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
    state.settle.mockResolvedValue(undefined);
    state.generate.mockResolvedValue({ imageBase64: "R", mimeType: "image/png", generatedImages: 1 });

    await batch(request({ ...body(), optionsBySection: { s1: { imageModel: 모델 } } }));
    const 배치예약 = state.reserve.mock.calls[0]![2] as number;

    expect(배치예약).toBe(단건예약);
  });
});
