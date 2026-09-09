import { describe, expect, it } from "vitest";
import {
  buildBriefPrompt,
  buildKeyVisualPrompt,
  buildTextBlueprintPrompt,
  generateKeyVisual,
  mergeArtDirection,
  normalizeBrief,
  normalizeTextBlueprint,
  planFromText,
  type TextPlanDeps,
} from "./pdp.text-plan";
import { PdpServiceError } from "./pdp.service";
import type { LandingPageBlueprint, ProductBrief } from "./types";

function makeBrief(overrides: Partial<ProductBrief> = {}): ProductBrief {
  return {
    offeringName: "저녁 요가 클래스",
    offeringKind: "course",
    oneLiner: "퇴근 후 30분 홈 요가",
    audience: "앉아서 일하는 직장인",
    problem: "시간이 없어 운동을 못 한다",
    outcome: "주 3회 30분으로 몸이 가벼워진다",
    differentiators: ["장비 불필요", "30분 구성"],
    objections: ["시간이 없다"],
    pricePositioning: "월 3만원대 중가",
    tone: "차분함",
    assumptions: ["가격대는 입력에 없어 추정했습니다"],
    sourceText: "요가 강의",
    ...overrides,
  };
}

function rawSection(overrides: Record<string, unknown> = {}) {
  return {
    section_id: "S1",
    section_name: "히어로",
    goal: "대상 특정",
    headline: "퇴근 후 30분",
    subheadline: "집에서 장비 없이",
    bullets: ["매트 하나면 충분"],
    CTA: "체험 신청",
    prompt_en: "warm living room at dusk, yoga mat",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<TextPlanDeps> = {}): TextPlanDeps {
  return {
    generateJson: async () => ({}),
    generateImage: async () => ({ base64: "AAAA", mimeType: "image/jpeg" }),
    ...overrides,
  };
}

/** planFromText는 브리프 → 시나리오 순서로 generateJson을 두 번 부른다. */
function makeTwoStepDeps(brief: unknown, blueprint: unknown): TextPlanDeps {
  let call = 0;
  return makeDeps({
    generateJson: async () => {
      call += 1;
      return call === 1 ? brief : blueprint;
    },
  });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(PdpServiceError);
  await promise.catch((error: unknown) => {
    expect((error as PdpServiceError).code).toBe(code);
  });
}

describe("판독 불가 입력만 거부한다", () => {
  const deps = makeTwoStepDeps(
    { offeringName: "요가", offeringKind: "course" },
    { sections: [rawSection()] },
  );

  it("빈 문자열은 TEXT_INPUT_INSUFFICIENT", async () => {
    await expectCode(
      planFromText({ text: "", aspectRatio: "9:16" }, undefined, deps),
      "TEXT_INPUT_INSUFFICIENT",
    );
  });

  it("공백만 있어도 TEXT_INPUT_INSUFFICIENT", async () => {
    await expectCode(
      planFromText({ text: "   \n\t ", aspectRatio: "9:16" }, undefined, deps),
      "TEXT_INPUT_INSUFFICIENT",
    );
  });

  it("offeringName을 특정하지 못하면 TEXT_INPUT_INSUFFICIENT", async () => {
    const blind = makeTwoStepDeps({ offeringName: "", offeringKind: "other" }, { sections: [rawSection()] });
    await expectCode(
      planFromText({ text: "asdf", aspectRatio: "9:16" }, undefined, blind),
      "TEXT_INPUT_INSUFFICIENT",
    );
  });

  it("얇지만 판독 가능한 입력은 통과시킨다 (되묻지 않는다)", async () => {
    const result = await planFromText({ text: "요가 강의", aspectRatio: "9:16" }, undefined, deps);
    expect(result.brief.offeringName).toBe("요가");
    expect(result.blueprint.sections).toHaveLength(1);
  });
});

describe("브리프 정규화", () => {
  it("사용자 원문을 sourceText에 보존한다", () => {
    const brief = normalizeBrief({ offeringName: "요가" }, "원문 텍스트");
    expect(brief.sourceText).toBe("원문 텍스트");
  });

  it("배열 필드가 없어도 빈 배열로 채운다", () => {
    const brief = normalizeBrief({ offeringName: "요가" }, "원문");
    expect(brief.differentiators).toEqual([]);
    expect(brief.objections).toEqual([]);
    expect(brief.assumptions).toEqual([]);
  });

  it("모르는 offeringKind는 other로 떨어뜨린다", () => {
    expect(normalizeBrief({ offeringName: "x", offeringKind: "spaceship" }, "원문").offeringKind).toBe("other");
    expect(normalizeBrief({ offeringName: "x", offeringKind: "coaching" }, "원문").offeringKind).toBe("coaching");
  });

  it("assumptions를 보존한다 — 지어낸 부분을 사용자에게 보여줘야 한다", () => {
    const brief = normalizeBrief({ offeringName: "x", assumptions: ["가격 추정", "대상 추정"] }, "원문");
    expect(brief.assumptions).toEqual(["가격 추정", "대상 추정"]);
  });
});

describe("시나리오 정규화", () => {
  it("LandingPageBlueprint의 모든 섹션 필수 필드를 채운다", () => {
    const blueprint = normalizeTextBlueprint({ sections: [{ headline: "제목만 있다" }] });
    const section = blueprint.sections[0];

    const required: Array<keyof typeof section> = [
      "section_id", "section_name", "goal",
      "headline", "headline_en", "subheadline", "subheadline_en",
      "bullets", "bullets_en", "trust_or_objection_line", "trust_or_objection_line_en",
      "CTA", "CTA_en", "layout_notes", "compliance_notes",
      "image_id", "purpose", "prompt_ko", "prompt_en",
      "negative_prompt", "style_guide", "reference_usage",
    ];
    for (const key of required) {
      expect(section[key]).toBeDefined();
    }
  });

  it("영어본이 비면 한국어본으로 대체한다", () => {
    const blueprint = normalizeTextBlueprint({ sections: [rawSection({ headline: "한국어 제목", headline_en: "" })] });
    expect(blueprint.sections[0].headline_en).toBe("한국어 제목");
  });

  it("blueprintList가 없으면 섹션 이름으로 만든다", () => {
    const blueprint = normalizeTextBlueprint({ sections: [rawSection({ section_name: "히어로" })] });
    expect(blueprint.blueprintList).toEqual(["히어로"]);
  });

  it("섹션이 하나도 없으면 INVALID_REQUEST", () => {
    expect(() => normalizeTextBlueprint({ sections: [] })).toThrow(PdpServiceError);
    try {
      normalizeTextBlueprint({ sections: [] });
    } catch (error) {
      expect((error as PdpServiceError).code).toBe("INVALID_REQUEST");
    }
  });

  // generateSectionImage 는 prompt_en 이 비면 INVALID_REQUEST 로 거부한다
  // (pdp.service.ts:340). 시나리오 단계에서 비워 보내면 뒤에서 막다른 길이 된다.
  it("prompt_en이 비면 대체값으로 채워 절대 비우지 않는다", () => {
    const fromKo = normalizeTextBlueprint({ sections: [{ headline: "제목", prompt_ko: "저녁 거실 장면" }] });
    expect(fromKo.sections[0].prompt_en).toBe("저녁 거실 장면");

    const fromHeadline = normalizeTextBlueprint({ sections: [{ headline: "퇴근 후 30분" }] });
    expect(fromHeadline.sections[0].prompt_en).not.toBe("");
  });

  it("섹션 id가 없으면 순번으로 채운다", () => {
    const blueprint = normalizeTextBlueprint({ sections: [{ headline: "a" }, { headline: "b" }] });
    expect(blueprint.sections.map((section) => section.section_id)).toEqual(["S1", "S2"]);
  });
});

describe("디자인 시스템 공유", () => {
  // 섹션 이미지는 각각 독립 생성되고 앵커 이미지에는 글자가 없다.
  // 폰트·인물을 맞추려면 시나리오 단계에서 한 번 정해 전 섹션에 실어 보내야 한다.
  const raw = {
    designSystem: {
      headlineFont: "굵은 기하학적 산세리프",
      bodyFont: "본문용 산세리프",
      palette: ["크림 배경", "짙은 갈색 본문", "주황 강조"],
      cast: "30대 초반 한국인 여성, 단발, 베이지 셔츠",
    },
    sections: [rawSection({ section_id: "S1" }), rawSection({ section_id: "S2" })],
  };

  it("모든 섹션의 style_guide에 같은 디자인 시스템을 싣는다", () => {
    const blueprint = normalizeTextBlueprint(raw);
    const guides = blueprint.sections.map((s) => s.style_guide);
    expect(guides[0]).toContain("굵은 기하학적 산세리프");
    expect(guides[0]).toContain("30대 초반 한국인 여성");
    // 두 섹션이 완전히 같은 지시를 받아야 결과가 일관된다.
    expect(guides[1]).toBe(guides[0]);
  });

  it("섹션 고유의 style_guide가 있어도 공용 시스템을 함께 싣는다", () => {
    const blueprint = normalizeTextBlueprint({
      ...raw,
      sections: [rawSection({ style_guide: "따뜻한 자연광" })],
    });
    expect(blueprint.sections[0].style_guide).toContain("따뜻한 자연광");
    expect(blueprint.sections[0].style_guide).toContain("주황 강조");
  });

  it("디자인 시스템이 없으면 기존 style_guide를 그대로 둔다", () => {
    const blueprint = normalizeTextBlueprint({ sections: [rawSection({ style_guide: "원래 값" })] });
    expect(blueprint.sections[0].style_guide).toBe("원래 값");
  });

  it("시나리오 프롬프트가 디자인 시스템을 한 번만 정하라고 지시한다", () => {
    const prompt = buildTextBlueprintPrompt(makeBrief());
    expect(prompt).toContain("designSystem");
    expect(prompt).toMatch(/designSystem[\s\S]*한 번만|전체 섹션이 공유/);
  });
});

describe("이미지 방향 병합", () => {
  // 실제 이미지 생성에 쓰이는 값은 prompt_en 이다. 사용자가 한국어 방향을 고쳤는데
  // 무시되면 막다른 길이 되므로, 바뀐 경우에만 추가 지시로 덧붙인다.
  const original = normalizeTextBlueprint({
    sections: [rawSection({ section_id: "S1", prompt_ko: "저녁 거실", prompt_en: "living room at dusk" })],
  });

  it("이미지 방향을 안 고쳤으면 prompt_en을 그대로 둔다", () => {
    const merged = mergeArtDirection(original, original);
    expect(merged.sections[0].prompt_en).toBe("living room at dusk");
  });

  it("고쳤으면 원본 prompt_en을 유지한 채 지시를 덧붙인다", () => {
    const edited = {
      ...original,
      sections: [{ ...original.sections[0], prompt_ko: "아침 사무실" }],
    };
    const merged = mergeArtDirection(original, edited);

    expect(merged.sections[0].prompt_en).toContain("living room at dusk");
    expect(merged.sections[0].prompt_en).toContain("아침 사무실");
    expect(merged.sections[0].prompt_ko).toBe("아침 사무실");
  });

  it("여러 번 고쳐도 지시가 중첩되지 않는다", () => {
    const once = mergeArtDirection(original, {
      ...original,
      sections: [{ ...original.sections[0], prompt_ko: "아침 사무실" }],
    });
    const twice = mergeArtDirection(original, {
      ...once,
      sections: [{ ...once.sections[0], prompt_ko: "밤 스튜디오" }],
    });

    expect(twice.sections[0].prompt_en).toContain("밤 스튜디오");
    expect(twice.sections[0].prompt_en).not.toContain("아침 사무실");
  });

  it("사용자가 추가한 새 섹션은 한국어 방향을 prompt_en으로 쓴다", () => {
    const edited = {
      ...original,
      sections: [
        ...original.sections,
        { ...original.sections[0], section_id: "S9", prompt_ko: "새 장면", prompt_en: "" },
      ],
    };
    const merged = mergeArtDirection(original, edited);
    expect(merged.sections[1].prompt_en).toBe("새 장면");
  });

  it("순서를 바꿔도 section_id로 짝지어 비교한다", () => {
    const twoSections = normalizeTextBlueprint({
      sections: [
        rawSection({ section_id: "S1", prompt_ko: "가", prompt_en: "a" }),
        rawSection({ section_id: "S2", prompt_ko: "나", prompt_en: "b" }),
      ],
    });
    const reordered = { ...twoSections, sections: [twoSections.sections[1], twoSections.sections[0]] };
    const merged = mergeArtDirection(twoSections, reordered);

    expect(merged.sections[0].prompt_en).toBe("b");
    expect(merged.sections[1].prompt_en).toBe("a");
  });

  it("원본을 변형하지 않는다", () => {
    const before = original.sections[0].prompt_en;
    mergeArtDirection(original, {
      ...original,
      sections: [{ ...original.sections[0], prompt_ko: "다른 장면" }],
    });
    expect(original.sections[0].prompt_en).toBe(before);
  });
});

describe("브리프 프롬프트", () => {
  it("지어낸 부분을 assumptions에 적도록 지시한다", () => {
    const prompt = buildBriefPrompt("요가 강의");
    expect(prompt).toContain("assumptions");
  });

  it("판독 불가 시 offeringName을 빈 문자열로 두라고 지시한다", () => {
    expect(buildBriefPrompt("asdf")).toContain("offeringName");
  });

  it("사용자 원문을 포함한다", () => {
    expect(buildBriefPrompt("퇴근 후 요가")).toContain("퇴근 후 요가");
  });
});

describe("시나리오 프롬프트", () => {
  const brief = makeBrief();

  it("무형 상품임을 전제하고 브리프 내용을 싣는다", () => {
    const prompt = buildTextBlueprintPrompt(brief);
    expect(prompt).toContain(brief.offeringName);
    expect(prompt).toContain(brief.audience);
    expect(prompt).toContain(brief.problem);
  });

  it("full-image와 editable을 분기한다", () => {
    expect(buildTextBlueprintPrompt(brief, undefined, "full-image")).toContain("full-image");
    expect(buildTextBlueprintPrompt(brief, undefined, "editable")).toContain("editable");
  });

  it("outputMode 미지정 시 editable로 동작한다", () => {
    expect(buildTextBlueprintPrompt(brief)).toContain("editable");
  });

  // 화면이 한국어인데 모델이 section_name 을 Intro/Feature_Design 처럼 영어로 뱉었다.
  // 갤러리 카드 라벨로 그대로 노출되므로 언어를 지정한다.
  it("section_name 을 한국어로 쓰라고 지시한다", () => {
    expect(buildTextBlueprintPrompt(brief)).toContain("section_name");
    expect(buildTextBlueprintPrompt(brief)).toMatch(/section_name[^\n]*한국어/);
  });
});

describe("대표 이미지 프롬프트", () => {
  const brief = makeBrief();
  const blueprint: LandingPageBlueprint = normalizeTextBlueprint({ sections: [rawSection()] });

  it("텍스트·로고·워터마크를 금지한다 — 스타일 앵커이기 때문", () => {
    const prompt = buildKeyVisualPrompt(brief, blueprint);
    expect(prompt).toContain("Do NOT include any text");
  });

  // 1번 섹션은 거의 항상 "문제 제기"라 어둡고 부정적이다. 그 장면을 앵커로 삼으면
  // 페이지 전체가 그 우울한 색·조명을 물려받는다.
  it("문제 섹션의 장면을 그대로 앵커로 삼지 않는다", () => {
    const gloomy = normalizeTextBlueprint({
      sections: [rawSection({ prompt_en: "a very dark gloomy room at midnight, despair" })],
    });
    const prompt = buildKeyVisualPrompt(brief, gloomy);
    expect(prompt).not.toContain("a very dark gloomy room at midnight");
  });

  it("문제가 아니라 기대 결과와 톤을 기반으로 만든다", () => {
    const prompt = buildKeyVisualPrompt(brief, blueprint);
    expect(prompt).toContain(brief.outcome);
    expect(prompt).not.toContain(brief.problem);
  });

  it("밝고 프리미엄한 무드를 요구한다", () => {
    expect(buildKeyVisualPrompt(brief, blueprint)).toMatch(/bright/i);
  });
});

describe("대표 이미지 생성", () => {
  const input = {
    brief: makeBrief(),
    blueprint: normalizeTextBlueprint({ sections: [rawSection()] }),
    aspectRatio: "9:16" as const,
  };

  it("이미지를 돌려주면 그대로 전달한다", async () => {
    const result = await generateKeyVisual(input, makeDeps());
    expect(result.imageBase64).toBe("AAAA");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("이미지가 비면 PDP_IMAGE_GENERATION_FAILED", async () => {
    const empty = makeDeps({ generateImage: async () => null });
    await expectCode(generateKeyVisual(input, empty), "PDP_IMAGE_GENERATION_FAILED");
  });

  // 라우트는 요청 본문을 그대로 넘긴다. 경계 검증은 코어가 맡는다.
  it("브리프나 섹션이 없으면 INVALID_REQUEST", async () => {
    await expectCode(
      generateKeyVisual({ ...input, brief: undefined as never }, makeDeps()),
      "INVALID_REQUEST",
    );
    await expectCode(
      generateKeyVisual(
        { ...input, blueprint: { ...input.blueprint, sections: [] } },
        makeDeps(),
      ),
      "INVALID_REQUEST",
    );
  });

  it("요청한 화면비를 그대로 넘긴다", async () => {
    let seen = "";
    const spy = makeDeps({
      generateImage: async (_prompt, aspectRatio) => {
        seen = aspectRatio;
        return { base64: "AAAA", mimeType: "image/jpeg" };
      },
    });
    await generateKeyVisual({ ...input, aspectRatio: "1:1" }, spy);
    expect(seen).toBe("1:1");
  });
});

/**
 * CTA 는 두 모드 모두에서 만들지 않는다(사용자 결정 2026-07-30).
 *
 * 이미지에 그리면 눌리지 않는 그림 버튼이 되고, 편집기에 얹는 길도 없다.
 * 예전에는 텍스트편집 모드만 CTA 를 쓰라고 지시했다 — 그래서 화면에 보이는데
 * 페이지에 넣을 수 없는 문구가 됐다.
 */
describe("CTA 는 만들지 않는다", () => {
  for (const mode of ["full-image", "editable"] as const) {
    it(`${mode} 모드에서 빈 문자열로 두라고 말한다`, () => {
      const prompt = buildTextBlueprintPrompt(makeBrief(), undefined, mode);
      expect(prompt).toContain("CTA 와 CTA_en 은 빈 문자열로 둔다");
    });

    it(`${mode} 모드에서 CTA 를 쓰라고 말하지 않는다`, () => {
      const prompt = buildTextBlueprintPrompt(makeBrief(), undefined, mode);
      expect(prompt).not.toContain("실제 행동을 유도하는");
    });
  }
});


/**
 * 대표 이미지가 **사용자가 고른 모델**로 만들어져야 한다.
 *
 * 2026-09-09 리팩터에서 이 인자가 사라졌다. 라우트는 고른 모델로 청구하는데
 * 그림은 기본 모델로 나왔다 — 비싼 모델을 고른 사람이 비싼 값을 내고 싼
 * 그림을 받았다. 타입도 시험도 못 잡았다. 안 읽는 것은 오류가 아니다.
 */
describe("대표 이미지의 모델", () => {
  const input = {
    brief: { offeringName: "요가 클래스" },
    blueprint: { sections: [{ section_id: "s1", headline: "제목" }] },
    aspectRatio: "9:16" as const,
  };

  function depsCapturing(seen: Array<string | undefined>) {
    return {
      generateJson: async () => ({}),
      generateImage: async (_prompt: string, _ratio: unknown, model?: string) => {
        seen.push(model);
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    };
  }

  it("고른 모델이 그대로 간다", async () => {
    const seen: Array<string | undefined> = [];
    await generateKeyVisual({ ...input, imageModel: "gpt-image-2" } as never, depsCapturing(seen) as never);
    expect(seen).toEqual(["gpt-image-2"]);
  });

  it("안 고르면 기본 모델이다", async () => {
    const seen: Array<string | undefined> = [];
    await generateKeyVisual(input as never, depsCapturing(seen) as never);
    expect(seen).toEqual(["gpt-image-2"]);
  });
});
