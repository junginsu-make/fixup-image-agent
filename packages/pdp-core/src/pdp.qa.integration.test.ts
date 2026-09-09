import { describe, expect, it } from "vitest";
import { PdpService, PdpServiceError, toPdpErrorResponse } from "./pdp.service";
import type { SectionBlueprint } from "./types";

// generateSectionImageInternal 은 private 이지만, 루프/게이트 로직 전부가 여기 있으므로
// 가짜 client 를 주입해 격리 통합 테스트한다(네트워크 없음).

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S6",
    section_name: "성분",
    goal: "성분 신뢰",
    headline: "저자극 100% 식물성 오일",
    headline_en: "Gentle 100% botanical oil",
    subheadline: "민감 피부도 순하게",
    subheadline_en: "Kind to sensitive skin",
    bullets: ["무향 처방", "12시간 지속 보습"],
    bullets_en: ["fragrance-free", "12h hydration"],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S6",
    purpose: "성분 전달",
    prompt_ko: "성분 클로즈업",
    prompt_en: "ingredient close-up",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    ...overrides,
  };
}

type QaScript = Array<Record<string, unknown> | "throw">;

function makeFakeClient(qaScript: QaScript) {
  // 이미지 생성은 fal 로 옮겨가서 client 를 거치지 않는다.
  // client 는 QA 호출만 담당하고, 이미지는 generateImage 주입으로 대신한다.
  const counts = { image: 0, qa: 0 };
  const answer = async () => {
    const entry = qaScript[counts.qa] ?? { defects: [] };
    counts.qa += 1;
    if (entry === "throw") throw new Error("QA model unavailable");
    return { text: JSON.stringify(entry) };
  };
  // QA 게이트는 `llm` 을 직접 쓰고, 나머지 호출은 옛 모양 어댑터를 거친다.
  const client = { llm: { generate: answer }, models: { generateContent: answer } };
  const generateImage = async () => {
    counts.image += 1;
    return { base64: `IMG${counts.image}`, mimeType: "image/jpeg" };
  };
  return { client, generateImage, counts };
}

function runInternal(qaScript: QaScript, sectionOverrides: Partial<SectionBlueprint> = {}, outputMode = "full-image") {
  const service = new PdpService();
  const { client, generateImage, counts } = makeFakeClient(qaScript);
  const promise = (service as any).generateSectionImageInternal({
    originalImageBase64: "iVBORw0KGgo=",
    section: makeSection(sectionOverrides),
    aspectRatio: "3:4",
    desiredTone: "프리미엄",
    options: { style: "studio", withModel: false, outputMode },
    client,
    generateImage,
  });
  return { promise, counts };
}

const brandBlocking = { defects: [{ type: "forbidden_brand", severity: "critical", evidence: "Haneerum 로고", correctionHint: "Remove the invented brand." }] };
const clean = { defects: [] };
const minorTypo = { defects: [{ type: "text_typo", severity: "minor", location: "bullet", evidence: "무향→무햑", correctionHint: "Fix spelling." }] };

describe("generateSectionImageInternal QA gate (full-image)", () => {
  it("blocking → 재생성 → clean 이면 통과(attempts=2, 경고 없음)", async () => {
    const { promise, counts } = runInternal([brandBlocking, clean]);
    const result = await promise;
    expect(counts.image).toBe(2); // 초기 + 재생성 1
    expect(result.qa.passed).toBe(true);
    expect(result.qa.attempts).toBe(2);
    expect(result.qa.blocking).toHaveLength(0);
    expect(result.qa.warnings).toHaveLength(0);
    expect(result.base64).toBe("IMG2");
  });

  it("blocking 이 예산 내내 지속되면 blocking 을 안고 반환(호출자가 throw)", async () => {
    const { promise, counts } = runInternal([brandBlocking, brandBlocking]);
    const result = await promise;
    expect(counts.image).toBe(2); // QA_MAX_ATTEMPTS=2 상한
    expect(result.qa.passed).toBe(false);
    expect(result.qa.blocking.length).toBeGreaterThan(0);
    expect(result.qa.blocking[0].type).toBe("forbidden_brand");
    expect(result.qa.attempts).toBe(2);
  });

  it("경미(minor)만 있으면 재생성 없이 통과 + 경고 부착(attempts=1)", async () => {
    const { promise, counts } = runInternal([minorTypo]);
    const result = await promise;
    expect(counts.image).toBe(1); // minor 는 blocking 아님 → 재시도 안 함
    expect(result.qa.passed).toBe(true);
    expect(result.qa.warnings).toHaveLength(1);
    expect(result.qa.blocking).toHaveLength(0);
    expect(result.qa.attempts).toBe(1);
  });

  it("QA 호출이 실패하면 fail-open(이미지 반환, 결함 0)", async () => {
    const { promise, counts } = runInternal(["throw"]);
    const result = await promise;
    expect(counts.image).toBe(1);
    expect(result.qa.passed).toBe(true);
    expect(result.qa.blocking).toHaveLength(0);
    expect(result.qa.warnings).toHaveLength(0);
  });

  it("이전 blocking 후 마지막 attempt 가 fail-open 이어도 통과로 위장하지 않는다", async () => {
    // attempt0: 실제 blocking → 재시도. attempt1: QA 인프라 실패(fail-open).
    const { promise, counts } = runInternal([brandBlocking, "throw"]);
    const result = await promise;
    expect(counts.image).toBe(2);
    expect(result.qa.passed).toBe(false); // known-bad 를 clean 으로 덮지 않음
    expect(result.qa.blocking.length).toBeGreaterThan(0);
    expect(result.qa.blocking[0].type).toBe("forbidden_brand");
  });
});

// 비용 계산의 근거. 재시도가 일어나면 fal 은 그만큼 청구하는데, 결과물은
// 한 장이라 호출자는 한 장으로 센다. 실제로 몇 장을 만들었는지 알려야 한다.
describe("실제 생성 장수(비용 계산용)", () => {
  it("재생성이 일어나면 만든 장수를 그대로 알린다", async () => {
    const { promise, counts } = runInternal([brandBlocking, clean]);
    const result = await promise;
    expect(counts.image).toBe(2);
    expect(result.generatedImages).toBe(2);
  });

  it("재생성이 없으면 1장", async () => {
    const { promise } = runInternal([minorTypo]);
    const result = await promise;
    expect(result.generatedImages).toBe(1);
  });

  it("끝내 blocking 이면 버려지지만 만든 장수는 남는다", async () => {
    const { promise } = runInternal([brandBlocking, brandBlocking]);
    const result = await promise;
    expect(result.generatedImages).toBe(2);
  });

  it("QA 거절로 던지는 오류가 만든 장수를 싣는다", async () => {
    const service = new PdpService();
    (service as any).getClient = () => ({});
    (service as any).generateSectionImageInternal = async () => ({
      base64: "IMG2",
      mimeType: "image/jpeg",
      generatedImages: 2,
      qa: { passed: false, blocking: [{ type: "forbidden_brand" }], warnings: [], attempts: 2 },
    });

    await expect(
      service.generateSectionImage({
        originalImageBase64: "iVBORw0KGgo=",
        section: makeSection(),
        aspectRatio: "3:4",
      }),
    ).rejects.toMatchObject({ code: "PDP_IMAGE_QA_REJECTED", billableImages: 2 });
  });

  it("오류 봉투가 만든 장수를 실어 라우트까지 전달한다", () => {
    const envelope = toPdpErrorResponse(
      new PdpServiceError("PDP_IMAGE_QA_REJECTED", "품질 미달", "detail", 2),
    );
    expect(envelope.billableImages).toBe(2);
  });
});

describe("generateSectionImageInternal QA gate (editable = 미적용)", () => {
  it("editable 모드에서는 QA 를 돌리지 않고 첫 이미지를 즉시 반환", async () => {
    const { promise, counts } = runInternal([brandBlocking], {}, "editable");
    const result = await promise;
    expect(counts.image).toBe(1);
    expect(counts.qa).toBe(0); // QA 미실행
    expect(result.qa).toBeUndefined();
    expect(result.base64).toBe("IMG1");
  });
});
