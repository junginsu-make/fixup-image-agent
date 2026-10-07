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

/**
 * **검수가 왜 버렸는지 서버 기록에 남는다**(2026-10-07). 전에는 오류 봉투 안에만 있어
 * nano-banana 일반판이 3/3 불합격한 까닭을 알 수 없었다. 결함 종류 · 자리 · 심각도만
 * 남긴다 — 검수 설명에는 사용자 카피가 섞일 수 있고, 주소도 넣지 않는다.
 */
const 기록 = () => warn.mock.calls.map((call: unknown[]) => call.join(" ")).filter((line: string) => line.includes("품질검수 불합격"));

describe("검수 불합격 까닭 기록", () => {
  it("한 장: 결함 종류를 한 줄로 남기고, 화면 응답은 그대로다", async () => {
    state.generate.mockRejectedValue(qaRejected());
    const response = await single(request(body()));

    expect(기록()).toHaveLength(1);
    expect(기록()[0]).toContain("s1");
    expect(기록()[0]).toContain("forbidden_brand/critical");
    expect(기록()[0]).toContain("text_typo@headline/minor");
    expect(기록()[0]).not.toContain(사용자글);
    expect(기록()[0]).not.toContain("http");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, code: "PDP_IMAGE_QA_REJECTED", message: "생성 결과가 품질 기준에 미달했습니다." });
  });

  it("일괄: 버린 섹션마다 남긴다", async () => {
    state.generate.mockResolvedValueOnce({ imageBase64: "OK", mimeType: "image/png", generatedImages: 1 }).mockRejectedValueOnce(qaRejected());
    const response = await batch(request({ ...body(), sections: [section, { ...section, section_id: "s2" }] }));

    expect(기록()).toHaveLength(1);
    expect(기록()[0]).toContain("s2");
    expect(기록()[0]).toContain("forbidden_brand/critical");
    expect(기록()[0]).not.toContain(사용자글);
    expect((await response.json()).results[1]).toMatchObject({ ok: false, code: "PDP_IMAGE_QA_REJECTED" });
  });

  it("검수 불합격이 아니면 남기지 않는다", async () => {
    state.generate.mockRejectedValue(new PdpServiceError("AI_PROVIDER_UNAVAILABLE", "업체 장애", "fal 503"));
    await single(request(body()));

    expect(기록()).toHaveLength(0);
  });

  it("상세가 깨졌거나 낯선 값이 와도 던지지 않고 글을 싣지 않는다", async () => {
    state.generate.mockRejectedValue(new PdpServiceError("PDP_IMAGE_QA_REJECTED", "미달", "not json", 1));
    const broken = await single(request(body()));
    expect(broken.status).toBe(422);

    state.generate.mockRejectedValue(
      new PdpServiceError("PDP_IMAGE_QA_REJECTED", "미달", JSON.stringify([{ type: `${사용자글} https://x.example`, severity: "critical" }]), 1),
    );
    await single(request(body()));

    expect(기록()).toHaveLength(2);
    expect(기록().join("\n")).not.toContain(사용자글);
    expect(기록().join("\n")).not.toContain("http");
  });
});
