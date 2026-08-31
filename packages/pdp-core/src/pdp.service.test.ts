import { describe, expect, it } from "vitest";
import { buildAnalyzePrompt, buildImagePrompt } from "./pdp.service";
import type { SectionBlueprint } from "./types";

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "히어로",
    goal: "히어로로 설득",
    headline: "건조함 없이 머무는 깊은 보습",
    headline_en: "Lasting deep hydration",
    subheadline: "매일 만나는 식물성 오일",
    subheadline_en: "Daily botanical oil",
    bullets: ["자연 유래 성분", "민감 피부 진정", "끈적임 없는 흡수"],
    bullets_en: ["natural", "soothing", "non-sticky"],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "핵심 효능 전달",
    prompt_ko: "제품 클로즈업",
    prompt_en: "product close-up",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    ...overrides,
  };
}

describe("buildAnalyzePrompt outputMode 분기", () => {
  it("full-image: 통이미지 완성형 + 타이포 통일 지시를 포함한다", () => {
    const p = buildAnalyzePrompt("추가정보", "프리미엄", null, "full-image");
    expect(p).toContain("통이미지(full-image)");
    expect(p).toContain("완성형 디자인");
    expect(p).toContain("Pretendard");
    // full-image에서는 이미지에 텍스트를 넣는 것이 목표이므로 editable의 no-text 규칙이 없어야 한다
    expect(p).not.toContain("이미지 내에 텍스트, 로고, 워터마크, 글자를 넣지 말 것");
  });

  it("editable(기본): 텍스트편집 + 이미지에 글자 금지 규칙을 포함한다", () => {
    const p = buildAnalyzePrompt("추가정보", "프리미엄", null, "editable");
    expect(p).toContain("텍스트편집(editable)");
    expect(p).toContain("이미지 내에 텍스트, 로고, 워터마크, 글자를 넣지 말 것");
  });

  it("outputMode 미지정 시 editable로 동작(현행 보존)", () => {
    const p = buildAnalyzePrompt();
    expect(p).toContain("텍스트편집(editable)");
  });
});

describe("buildAnalyzePrompt 카피 품질 규칙(v3.0 이식)", () => {
  it("판매 스레드 서사 + 카피 작성 원칙(역할명·추상문구 금지)을 포함한다", () => {
    const p = buildAnalyzePrompt("정보", "톤", null, "editable");
    expect(p).toContain("판매 스레드");
    expect(p).toContain("판매 영화처럼 이어질 것");
    expect(p).toContain("카피 작성 원칙(강제)");
    expect(p).toContain("역할명을 그대로 쓰지 말 것");
    expect(p).toContain("금지 추상 문구");
    expect(p).toContain("후기 근거를 라벨로 쓰지 말 것");
  });

  // 예전에는 editable 모드만 CTA 를 쓰라고 했다. 그런데 편집기에 얹는 길이 없어
  // "화면에 있는데 페이지에 못 넣는 문구"가 됐다. 두 모드 모두 만들지 않는다
  // (사용자 결정 2026-07-30).
  it("두 모드 모두 CTA를 빈 문자열로 두고 버튼 문구를 금지한다", () => {
    for (const mode of ["full-image", "editable"] as const) {
      const prompt = buildAnalyzePrompt("정보", "톤", null, mode);
      expect(prompt, mode).toContain("모든 섹션 CTA와 CTA_en은 빈 문자열");
      expect(prompt, mode).not.toContain("CTA는 실제 행동을 유도하는");
      expect(prompt, mode).not.toContain("CTA는 최소 2회 이상 배치");
    }
  });
});

describe("아트 디렉션 공통 규칙(모드 무관)", () => {
  const section = makeSection();
  const base = { style: "studio", withModel: false, guidePriorityMode: "guide-first" } as const;

  // buildModelDescriptor 는 withModel=true 일 때만 호출된다. 텍스트 진입은 기본이 false라
  // 국적 지시가 아예 안 나갔고, 그래서 서양인으로 보이는 인물이 생성됐다.
  it("모델을 쓰지 않아도 등장 인물은 한국인으로 지정한다", () => {
    const p = buildImagePrompt(section, undefined, base);
    expect(p).toMatch(/Korean people|must be Korean/i);
  });

  it("실사 사진을 요구하고 CG·스톡 느낌을 금지한다", () => {
    const p = buildImagePrompt(section, undefined, base);
    expect(p).toMatch(/real photograph/i);
    expect(p).toMatch(/stock/i);
    expect(p).toMatch(/CGI|render/i);
  });

  it("템플릿 같은 안전한 구도를 피하라고 지시한다", () => {
    const p = buildImagePrompt(section, undefined, base);
    expect(p).toMatch(/template/i);
  });

  it("full-image 모드에서도 같은 규칙이 적용된다", () => {
    const p = buildImagePrompt(section, undefined, { ...base, outputMode: "full-image" });
    expect(p).toMatch(/must be Korean/i);
    expect(p).toMatch(/real photograph/i);
  });
});

describe("buildImagePrompt outputMode 분기", () => {
  const section = makeSection();

  it("full-image: 온이미지 카피 주입 + 텍스트 렌더 지시, no-text 금지문 없음", () => {
    const p = buildImagePrompt(section, undefined, {
      style: "studio",
      withModel: false,
      guidePriorityMode: "guide-first",
      outputMode: "full-image",
    });
    expect(p).toContain("legible Korean typography");
    expect(p).toContain(`On-image headline: ${section.headline}.`);
    expect(p).toContain(`On-image subheadline: ${section.subheadline}.`);
    // 포인트 카드는 최대 2개만
    expect(p).toContain(section.bullets[0]);
    expect(p).toContain(section.bullets[1]);
    expect(p).not.toContain(section.bullets[2]);
    expect(p).not.toContain("Do NOT include any text");
  });

  it("editable(기본): no-text 금지문 포함, 온이미지 카피 주입 없음", () => {
    const p = buildImagePrompt(section, undefined, {
      style: "studio",
      withModel: false,
      guidePriorityMode: "guide-first",
      outputMode: "editable",
    });
    expect(p).toContain("Do NOT include any text");
    expect(p).not.toContain("On-image headline:");
  });

  it("outputMode 미지정 시 no-text(현행 보존)", () => {
    const p = buildImagePrompt(section, undefined, {
      style: "studio",
      withModel: false,
      guidePriorityMode: "guide-first",
    });
    expect(p).toContain("Do NOT include any text");
  });
});

/**
 * 기획 프롬프트와 이미지 프롬프트가 같은 개수를 말해야 한다.
 *
 * 예전에는 스키마가 "bullets: 한국어 3개"를 요구하면서 같은 프롬프트가 "포인트 최대
 * 2개"라고 말했다. 그래서 셋째 불릿이 애매하게 만들어지고, 이미지 쪽에서도 두 개만
 * 보냈다(slice(0, 2)). 두 지시가 어긋나면 LLM 은 어느 쪽이든 고른다.
 */
describe("불릿 개수 지시가 어긋나지 않는다", () => {
  it("통이미지 모드가 포인트 카드 3개를 말한다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain("포인트 카드 3개");
  });

  it("최대 2개라고 말하지 않는다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).not.toContain("최대 2개");
  });

  it("신뢰문구도 이미지에 담긴다고 말한다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain("신뢰문구");
  });

  it("개수를 줄이지 말고 문구를 줄이라고 말한다", () => {
    // 공간이 부족하면 카드를 빼는 쪽으로 도망가면 안 된다 — 그러면 카피가 사라진다.
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain("문구를 짧게 줄일 것");
  });

  it("CTA 를 빈 문자열로 두라고 말한다", () => {
    for (const mode of ["full-image", "editable"] as const) {
      const prompt = buildAnalyzePrompt(undefined, undefined, null, mode);
      expect(prompt, mode).toContain("CTA 필드는 모든 섹션에서 빈 문자열로 둘 것");
    }
  });

  it("CTA 를 여러 번 배치하라고 말하지 않는다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable");
    expect(prompt).not.toContain("CTA는 최소 2회");
  });
});

