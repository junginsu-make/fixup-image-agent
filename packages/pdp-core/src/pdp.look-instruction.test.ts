import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { buildImageJson, buildImageSystemPrompt, type ImagePromptOptions } from "./pdp.image-prompt";
import type { SectionBlueprint } from "./types";

/**
 * 결(look)과 사용자 지시가 프롬프트에 어떻게 실리는지.
 *
 * 두 가지를 지킨다.
 *   1. **상세페이지의 기본은 사진이다.** 결을 안 고르면 지금까지처럼 실사 지시가
 *      나가야 한다 — 기본을 auto 로 두면 쓰던 사람의 결과물이 조용히 바뀐다.
 *   2. **애니를 골랐는데 「사진이어야 한다」가 같이 나가면 안 된다.** 정면충돌이라
 *      모델이 둘 중 하나를 버린다.
 */

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "히어로",
    goal: "대상 특정",
    headline: "하루 한 번, 순한 세안",
    headline_en: "One gentle wash a day",
    subheadline: "민감 피부도 순하게",
    subheadline_en: "Kind to sensitive skin",
    bullets: ["무향 처방"],
    bullets_en: ["fragrance-free"],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "첫인상",
    prompt_ko: "세면대 위 제품",
    prompt_en: "product on a washbasin",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    ...overrides,
  };
}

const baseOptions: ImagePromptOptions = {
  style: "studio",
  withModel: false,
  outputMode: "full-image",
};

describe("결 — 기본은 사진", () => {
  it("결을 안 고르면 실사 지시가 그대로 나간다", () => {
    expect(buildImageSystemPrompt(baseOptions)).toContain("real photograph");
    expect(JSON.parse(buildImageJson(makeSection(), baseOptions)).realism).toBeTruthy();
  });

  it("photoreal 을 명시해도 같다", () => {
    const options = { ...baseOptions, look: "photoreal" as const };
    expect(buildImageSystemPrompt(options)).toContain("real photograph");
    expect(JSON.parse(buildImageJson(makeSection(), options)).realism).toBeTruthy();
  });
});

describe("결 — 사진이 아닐 때 실사 지시를 빼야 한다", () => {
  it("애니를 고르면 「사진이어야 한다」가 안 나간다", () => {
    const options = { ...baseOptions, look: "anime" as const };
    const system = buildImageSystemPrompt(options);
    expect(system).not.toContain("real photograph");
    expect(system).toMatch(/cel-shaded/i);

    const brief = JSON.parse(buildImageJson(makeSection(), options));
    expect(brief.realism).toBeUndefined();
    expect(String(brief.look)).toMatch(/cel-shaded/i);
  });

  it("3D·그림도 같은 규칙을 따른다", () => {
    for (const look of ["3d", "illustration"] as const) {
      const options = { ...baseOptions, look };
      expect(buildImageSystemPrompt(options)).not.toContain("real photograph");
      expect(JSON.parse(buildImageJson(makeSection(), options)).realism).toBeUndefined();
    }
  });

  it("auto 는 아무 결도 보태지 않는다 — 첨부의 결을 따라간다", () => {
    const options = { ...baseOptions, look: "auto" as const };
    const brief = JSON.parse(buildImageJson(makeSection(), options));
    expect(brief.realism).toBeUndefined();
    expect(brief.look).toBeUndefined();
  });
});

/**
 * 프롬프트 조립은 generateSectionImageInternal 안에 있다. private 이지만 그
 * 로직 전부가 거기 있으므로 가짜 client·generateImage 를 주입해 확인한다
 * (pdp.qa.integration.test.ts 와 같은 방식, 네트워크 없음).
 */
async function capturePrompt(options: Record<string, unknown>) {
  const service = new PdpService();
  let captured = "";
  const client = {
    models: {
      generateContent: async () => ({ text: JSON.stringify({ defects: [] }) }),
    },
  };
  await (service as unknown as {
    generateSectionImageInternal: (input: Record<string, unknown>) => Promise<unknown>;
  }).generateSectionImageInternal({
    originalImageBase64: "iVBORw0KGgo=",
    section: makeSection(),
    aspectRatio: "3:4",
    // editable 이면 QA 게이트를 타지 않아 프롬프트만 깔끔히 확인된다.
    options: { style: "studio", withModel: false, outputMode: "editable", ...options },
    client,
    generateImage: async (_model: string, request: { prompt: string }) => {
      captured = request.prompt;
      return { base64: "IMG", mimeType: "image/jpeg" };
    },
  });
  return captured;
}

describe("사용자 지시 — 양끝에 두 번", () => {
  it("맨 앞과 맨 뒤에 들어간다", async () => {
    const prompt = await capturePrompt({ userInstruction: "배경은 밤, 창밖에 네온" });
    expect(prompt.startsWith("USER INSTRUCTION")).toBe(true);
    expect(prompt).toContain("Before drawing, re-read the USER INSTRUCTION");
    // 두 번 나와야 한다. 긴 프롬프트에서 중간 문장은 힘을 잃는다(2026-09-04 실측).
    expect(prompt.split("배경은 밤, 창밖에 네온").length - 1).toBe(2);
  });

  it("비어 있으면 한 줄도 안 들어간다", async () => {
    const prompt = await capturePrompt({});
    expect(prompt).not.toContain("USER INSTRUCTION");
  });

  it("공백만 적었으면 없는 것으로 본다", async () => {
    const prompt = await capturePrompt({ userInstruction: "   \n  " });
    expect(prompt).not.toContain("USER INSTRUCTION");
  });

  it("모르는 결을 보내면 기본값(사진)으로 되돌린다", async () => {
    const prompt = await capturePrompt({ look: "watercolour-ish" });
    expect(prompt).toContain("real photograph");
  });
});
