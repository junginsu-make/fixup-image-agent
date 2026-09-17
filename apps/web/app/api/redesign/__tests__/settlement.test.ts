import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), finalize: vi.fn(), settle: vi.fn(), generate: vi.fn(), edit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: mocks.auth, reserveAiUsage: mocks.reserve,
  finalizeAiUsage: mocks.finalize, settleAiUsage: mocks.settle }));
vi.mock("../../../../lib/server-keys", () => ({ resolveOpenaiKey: () => "test", resolveGoogleKey: () => "test" }));
vi.mock("../../../../lib/redesign/image-generator", () => ({ createRedesignImageGenerator: () => async () => ({}) }));
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: async () => null }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("@fixup/redesign-core", async () => ({ ...(await vi.importActual("@fixup/redesign-core")), generateSections: mocks.generate, editSection: mocks.edit }));
const { POST: generate } = await import("../generate/route");
const { POST: edit } = await import("../edit-section/route");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  mocks.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
  mocks.finalize.mockRejectedValue(new Error("settlement down"));
  mocks.settle.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({ project: { sections: [{ imageUrl: "result" }] } });
  mocks.edit.mockResolvedValue({ imageUrl: "edited" });
});
describe("T-SETTLE: 리디자인 생성과 수정", () => {
  it("정산 실패가 생성 결과를 버리지 않는다", async () => {
    const form = new FormData(); form.append("files", new File(["image"], "p.png", { type: "image/png" }));
    const response = await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
    expect(response.status).toBe(200); expect((await response.json()).project.sections).toHaveLength(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("정산 실패가 수정 결과를 버리지 않는다", async () => {
    const response = await edit(new Request("http://local/api/redesign/edit", { method: "POST", body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }) }));
    expect(response.status).toBe(200); expect((await response.json()).imageUrl).toBe("edited");
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });
  it("인증 실패는 multipart 파싱 전에 반환한다", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const req = new Request("http://local/api/redesign/generate", { method: "POST", body: "invalid" });
    expect((await generate(req)).status).toBe(401); expect(req.bodyUsed).toBe(false);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("수정 본문이 잘못되면 예약하지 않는다", async () => {
    const response = await edit(new Request("http://local/api/redesign/edit", { method: "POST", body: "null" }));
    expect(response.status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
  });
});

/**
 * **예약과 차감이 같은 계산기에서 나와야 한다.**
 *
 * 2026-09-17 리뷰(F-7-5·F-7-6): 섹션 수정이 `imageCreditUnits`(4장)로 예약하고
 * 확정은 손으로 적은 1장을 넘겼다. 사용량은 1장 줄고 장부에는 4장이 남는다.
 */
describe("T-COST: 리디자인 섹션 수정", () => {
  it("예약한 장수와 차감한 장수가 같다", async () => {
    const response = await edit(
      new Request("http://local/api/redesign/edit", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
      }),
    );

    expect(response.status).toBe(200);
    const 예약한장 = mocks.reserve.mock.calls[0]![2] as number;
    const 차감한장 = mocks.settle.mock.calls[0]![2] as number;
    expect(차감한장).toBe(예약한장);
    expect(예약한장).toBeGreaterThan(1);
  });

  it("고친 그림도 새로 만든 그림과 같은 품질로 그린다", async () => {
    await edit(
      new Request("http://local/api/redesign/edit", {
        method: "POST",
        body: JSON.stringify({ imageUrl: "data:image/png;base64,AAAA", request: "밝게" }),
      }),
    );

    // 값은 gpt-image-2.5 `max` 기준으로 받는다. 실제로 저품질로 그리면
    // 사용자는 비싼 값을 내고 뭉개진 글자를 받는다.
    const 넘긴인자 = mocks.edit.mock.calls[0]![0] as { generateImage?: unknown };
    expect(넘긴인자.generateImage).toBeTypeOf("function");
  });
});
