import { describe, expect, it } from "vitest";
import { buildImageJson, buildImageSystemPrompt } from "./pdp.image-prompt";
import type { SectionBlueprint } from "./types";

function makeSection(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "차별점 신선도",
    goal: "신선함을 각인",
    headline: "미리 짜두지 않습니다",
    headline_en: "We do not press in advance",
    subheadline: "당신의 주문이 들어온 순간, 비로소 착유가 시작됩니다.",
    subheadline_en: "Pressing begins the moment your order arrives",
    bullets: ["주문 후 착유"],
    bullets_en: ["pressed to order"],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "사진 중앙에 카피 카드",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "황금빛 들기름이 나물 위로 떨어지는 클로즈업",
    prompt_en: "Extreme close-up of golden perilla oil falling into fresh greens",
    negative_prompt: "",
    style_guide: "따뜻한 자연광",
    reference_usage: "",
    ...overrides,
  };
}

const opts = { style: "lifestyle", withModel: false, outputMode: "full-image" } as const;

describe("JSON 구조 프롬프트", () => {
  it("유효한 JSON 을 만든다", () => {
    expect(() => JSON.parse(buildImageJson(makeSection(), opts))).not.toThrow();
  });

  it("헤드라인과 서브를 그대로 싣고 정확히 렌더하라고 표시한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(j.typography.headline).toBe("미리 짜두지 않습니다");
    expect(j.typography.subheadline).toContain("착유가 시작됩니다");
    expect(j.typography.render_exactly).toBe(true);
  });

  // 평문 프롬프트에서는 강조가 엉뚱한 곳에 붙었다. 단어를 지정하면 정확히 따른다(실측).
  it("강조할 단어를 지정하면 그대로 싣는다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), { ...opts, emphasisWords: ["짜두지"] }));
    expect(j.typography.emphasis.words).toEqual(["짜두지"]);
  });

  it("강조 단어가 없으면 헤드라인에서 고르라고만 지시한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(j.typography.emphasis.words).toEqual([]);
    expect(JSON.stringify(j.typography.emphasis)).toMatch(/headline/i);
  });

  it("서브헤드라인은 강조하지 말라고 명시한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(JSON.stringify(j.typography.do_not_emphasise)).toMatch(/subheadline/i);
  });

  it("섹션의 장면과 레이아웃을 싣는다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(j.scene.subject).toContain("perilla oil");
    expect(j.layout).toContain("카피 카드");
  });

  it("버튼과 지어낸 수치를 금지한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    const forbidden = JSON.stringify(j.forbidden);
    expect(forbidden).toMatch(/button/i);
    expect(forbidden).toMatch(/invented numbers/i);
  });

  it("editable 모드는 이미지에 글자를 넣지 않는다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), { ...opts, outputMode: "editable" }));
    expect(JSON.stringify(j)).toMatch(/no text|without text/i);
    expect(j.typography?.headline).toBeUndefined();
  });
});

describe("인물 규칙 — 필수가 아니다", () => {
  // 기존 규칙이 "사람을 넣어라"로 읽혀 제품 클로즈업에도 인물이 들어갔다.
  it("인물은 선택이며 장면이 요구할 때만 넣는다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(JSON.stringify(j.scene.people)).toMatch(/optional|only when/i);
  });

  it("인물이 등장하면 한국인이어야 한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), opts));
    expect(JSON.stringify(j.scene.people)).toMatch(/Korean/);
  });

  it("인물을 배제하라고 지정하면 명시적으로 없다고 싣는다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), { ...opts, peopleMode: "none" }));
    expect(JSON.stringify(j.scene.people)).toMatch(/none/i);
  });

  it("모델 이미지를 쓸 때만 인물을 요구한다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), { ...opts, withModel: true }));
    expect(JSON.stringify(j.scene.people)).toMatch(/required|must feature/i);
  });
});

describe("아트 디렉션 시스템 프롬프트", () => {
  it("실사 사진을 요구하고 CG·스톡을 금지한다", () => {
    const s = buildImageSystemPrompt(opts);
    expect(s).toMatch(/real photograph/i);
    expect(s).toMatch(/render|stock/i);
  });

  it("템플릿 같은 안전한 구도를 피하라고 지시한다", () => {
    expect(buildImageSystemPrompt(opts)).toMatch(/template/i);
  });

  it("인물을 강제하지 않는다", () => {
    const s = buildImageSystemPrompt(opts);
    expect(s).toMatch(/optional/i);
  });
});

/**
 * AI 가 쓴 카피가 이미지에 닿아야 한다.
 *
 * 블루프린트는 불릿을 **3개** 만드는데(pdp.service.ts 의 분석 지시) 이미지에는 2개만
 * 보내고 있었다 — 세 번째가 조용히 버려졌다. 신뢰문구는 아예 전달되지 않았다.
 * 실측 10장에서 확인했다(2026-07-30).
 */
describe("full-image 모드가 카피를 온전히 넘긴다", () => {
  const opts = { style: "studio" as const, withModel: false, outputMode: "full-image" as const };

  it("불릿 3개를 다 넘긴다", () => {
    const section = makeSection({
      bullets: ["가볍게 스며듭니다", "향료를 넣지 않았습니다", "아침·저녁 모두 씁니다"],
    });
    const brief = JSON.parse(buildImageJson(section, opts));
    expect(brief.typography.point_cards).toEqual([
      "가볍게 스며듭니다",
      "향료를 넣지 않았습니다",
      "아침·저녁 모두 씁니다",
    ]);
  });

  it("규격을 어긴 응답은 넷에서 끊는다", () => {
    // 열 개를 그대로 넘기면 한 장에 다 그리려다 글자가 뭉개진다.
    const section = makeSection({ bullets: Array.from({ length: 10 }, (_, i) => `항목 ${i + 1}`) });
    const brief = JSON.parse(buildImageJson(section, opts));
    expect(brief.typography.point_cards).toHaveLength(4);
  });

  it("빈 불릿은 세지 않는다", () => {
    const section = makeSection({ bullets: ["첫째", "", "둘째"] });
    const brief = JSON.parse(buildImageJson(section, opts));
    expect(brief.typography.point_cards).toEqual(["첫째", "둘째"]);
  });

  it("신뢰문구를 넘기고, 조용한 한 줄로 다루라고 말한다", () => {
    const section = makeSection({ trust_or_objection_line: "민감한 피부도 부담 없이 씁니다" });
    const brief = JSON.parse(buildImageJson(section, opts));
    expect(brief.typography.reassurance_line.text).toBe("민감한 피부도 부담 없이 씁니다");
    // 제목·불릿과 같은 무게로 두면 셋이 주인 자리를 다투다 제목이 잘린다.
    expect(brief.typography.reassurance_line.treatment).toContain("never a heading");
  });

  it("신뢰문구가 없으면 그 항목을 넣지 않는다", () => {
    const brief = JSON.parse(buildImageJson(makeSection(), opts));
    expect(brief.typography.reassurance_line).toBeUndefined();
  });

  it("CTA 는 싣지 않는다", () => {
    // 사용자 결정(2026-07-30): 이미지에 그리면 눌리지 않는 그림 버튼이 되고,
    // 섹션마다 반복되면 페이지가 버튼 나열이 된다.
    const section = makeSection({ CTA: "지금 확인하기" });
    const raw = buildImageJson(section, opts);
    expect(raw).not.toContain("지금 확인하기");
  });

  it("텍스트편집 모드에서는 어떤 카피도 싣지 않는다", () => {
    const section = makeSection({
      bullets: ["가볍게 스며듭니다"],
      trust_or_objection_line: "민감한 피부도 부담 없이 씁니다",
    });
    const brief = JSON.parse(buildImageJson(section, { ...opts, outputMode: "editable" }));
    expect(brief.typography).toBeUndefined();
    expect(brief.text_in_image).toContain("no text at all");
  });
});


/**
 * 화면에서 고른 인물 조건이 **그림 프롬프트까지 가야 한다.**
 *
 * 2026-09-09 확인: 성별·나이대·국가·가이드 우선 모드 넷을 화면에서 고를 수
 * 있는데 엔진이 하나도 안 읽고 있었다. 그 값들을 쓰는 함수(`buildImagePrompt`)는
 * 시험 말고 부르는 곳이 없었다.
 *
 * 게다가 국가는 무시되는 정도가 아니라 **반대로** 갔다 — 프롬프트가
 * 「한국인」과 `location: "Korea"` 를 못 박고 있었다.
 */
describe("인물 조건이 그림까지 간다", () => {
  const base = { style: "studio", withModel: false, outputMode: "editable" } as const;

  it("안 고르면 지금까지처럼 한국이다", () => {
    const j = JSON.parse(buildImageJson(makeSection(), { ...base }));
    expect(j.scene.location).toBe("Korea");
    expect(JSON.stringify(j.scene.people)).toMatch(/Korean/);
  });

  it("국가를 고르면 그 나라로 간다", () => {
    const j = JSON.parse(
      buildImageJson(makeSection(), { ...base, modelCountry: "france" }),
    );
    expect(j.scene.location).toBe("France");
    expect(JSON.stringify(j.scene.people)).toMatch(/French/);
    expect(JSON.stringify(j.scene.people)).not.toMatch(/Korean/);
  });

  it("성별과 나이대가 묘사로 실린다", () => {
    const people = JSON.parse(
      buildImageJson(makeSection(), {
        ...base,
        modelGender: "male",
        modelAgeRange: "40s",
      }),
    ).scene.people as string;
    expect(people).toMatch(/man/);
    expect(people).toMatch(/40s/);
  });

  it("여성·10대도 그대로 간다", () => {
    const people = JSON.parse(
      buildImageJson(makeSection(), { ...base, modelGender: "female", modelAgeRange: "teen" }),
    ).scene.people as string;
    expect(people).toMatch(/woman/);
    expect(people).toMatch(/teen/);
  });

  /**
   * 사진이나 캐릭터를 붙였으면 **그쪽이 누구인지를 정한다.**
   * 설정으로 덮으면 얼굴은 그 사람인데 나이·국적 설명이 부딪힌다.
   */
  it("인물 참조가 붙으면 설정이 사람을 덮지 않는다", () => {
    const people = JSON.parse(
      buildImageJson(makeSection(), {
        ...base,
        withModel: true,
        modelGender: "male",
        modelCountry: "france",
      }),
    ).scene.people as string;
    expect(people).toMatch(/required|must/i);
    expect(people).not.toMatch(/French man/);
  });

  it("시스템 프롬프트에도 같은 나라가 실린다", () => {
    const prompt = buildImageSystemPrompt({ ...base, modelCountry: "japan" });
    expect(prompt).toMatch(/Japanese/);
    expect(prompt).not.toMatch(/they must be Korean/);
  });
});

describe("가이드 우선 모드", () => {
  const base = { style: "studio", withModel: false, outputMode: "editable" } as const;
  const section = () => ({ ...makeSection(), layout_notes: "왼쪽 정렬", style_guide: "짙은 올리브" });

  it("기본은 가이드 우선 — 구성안의 배치와 스타일을 따른다", () => {
    const j = JSON.parse(buildImageJson(section(), { ...base }));
    expect(j.layout).toBe("왼쪽 정렬");
    expect(j.design_system).toBe("짙은 올리브");
    expect(j.guide_priority).toMatch(/guide/i);
  });

  it("스타일 우선이면 촬영 방식이 이긴다고 말한다", () => {
    const j = JSON.parse(buildImageJson(section(), { ...base, guidePriorityMode: "style-first" }));
    expect(j.guide_priority).toMatch(/shot type|style/i);
    expect(j.guide_priority).toMatch(/ignore|override|wins/i);
  });
});
