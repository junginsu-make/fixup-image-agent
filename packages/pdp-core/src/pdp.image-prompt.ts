import type { PdpImageStyle, PdpOutputMode, SectionBlueprint } from "./types";

/**
 * 이미지 생성 프롬프트를 JSON 구조로 만든다.
 *
 * 평문 프롬프트와 비교 측정한 결과가 근거다. 평문에서는 강조가 엉뚱한 곳에 붙고
 * "인물 없음" 지시가 무시됐는데, JSON 으로 주면 지정한 대로 따랐다.
 * 아트 디렉션을 system_prompt 로 분리하면 시간도 40% 줄었다(49초 → 29초).
 *
 * 자세한 측정값은 docs/superpowers/specs/2026-07-27-fal-image-provider-design.md 참조.
 */

export type PeopleMode = "auto" | "none";

export interface ImagePromptOptions {
  style: PdpImageStyle;
  withModel: boolean;
  outputMode: PdpOutputMode;
  /** 강조할 단어. 비우면 모델이 헤드라인에서 고른다. */
  emphasisWords?: string[];
  /** 인물을 아예 배제할지. 기본은 장면이 요구할 때만 넣는 auto. */
  peopleMode?: PeopleMode;
  desiredTone?: string;
}

/**
 * 한 섹션 이미지에 그릴 불릿의 상한.
 *
 * 블루프린트는 3개를 만든다. 넷째는 규격을 어긴 응답을 위한 여유다 — 열 개를 그대로
 * 넘기면 한 장에 다 담으려다 글자가 뭉개진다.
 */
const MAX_POINT_CARDS = 4;

const STYLE_SETTING: Record<PdpImageStyle, string> = {
  studio: "a controlled studio set with crisp lighting and an intentional backdrop",
  lifestyle: "an authentic lived-in space with natural light and believable texture",
  outdoor: "a real outdoor location with a clear sense of place and air",
};

/**
 * 인물 규칙. 이전 규칙("프레임에 보이는 사람은 한국인이어야 한다")이
 * "사람을 넣어라"로 읽혀 제품 클로즈업에도 인물이 들어갔다.
 * 이 서비스의 핵심은 입력 텍스트를 정확히 읽어 페이지를 설계하는 것이지
 * 인물을 넣는 것이 아니다.
 */
function peopleRule(options: ImagePromptOptions) {
  if (options.peopleMode === "none") {
    return "none — this is a product or texture shot. Do not add a person.";
  }
  if (options.withModel) {
    return "required — the supplied reference person must appear, and must read as Korean.";
  }
  return "optional — include a person only when the scene genuinely calls for one; a product close-up or styled table is often stronger. When someone does appear they must be Korean, and the setting must read as Korea.";
}

export function buildImageSystemPrompt(options: ImagePromptOptions) {
  return [
    "You are an art director for Korean e-commerce detail page sections.",
    "Read the brief carefully and render exactly what it asks for — nothing more.",
    "People are optional. Only include a person when the scene genuinely calls for one; when one appears they must be Korean.",
    "Realism: produce a real photograph shot by a professional — natural skin and material texture, physical light. Never a 3D render, an illustration, or a generic stock photo.",
    "Composition: compose deliberately. Choose the crop, angle and eye level this message deserves instead of defaulting to a safe centred template. Vary it between sections.",
    "Typography: render the given Korean copy exactly, large and legible at phone size. Emphasise only the words listed, in the accent colour.",
    "Never draw buttons, arrows or other clickable controls — these are static images.",
    options.desiredTone ? `Overall tone: ${options.desiredTone}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildImageJson(section: SectionBlueprint, options: ImagePromptOptions) {
  const brief: Record<string, unknown> = {
    task: "korean_ecommerce_detail_page_section",
    format: { orientation: "vertical", target: "mobile", static_image: true },
    scene: {
      subject: section.prompt_en || section.prompt_ko || section.headline,
      setting: STYLE_SETTING[options.style],
      location: "Korea",
      people: peopleRule(options),
    },
    layout: section.layout_notes || "compose it the way this message deserves",
    realism: {
      must: ["real photograph", "natural material texture", "physical light"],
      must_not: ["3D render", "illustration", "stock photo look", "waxy over-smoothed skin"],
    },
    forbidden: [
      "buttons",
      "arrows",
      "clickable controls",
      "invented numbers",
      "invented brand names",
      "watermarks",
    ],
  };

  if (section.style_guide) {
    brief.design_system = section.style_guide;
  }
  if (section.negative_prompt) {
    brief.avoid = section.negative_prompt;
  }

  if (options.outputMode === "full-image") {
    // 블루프린트는 불릿을 **3개** 만든다(pdp.service.ts 의 분석 지시). 예전에는 2개만
    // 보내서 세 번째가 조용히 버려졌다 — 근거 없이 들어간 제한이었다. 셋 다 보낸다.
    //
    // 상한은 남겨 둔다. LLM 이 규격을 어겨 열 개를 만들면 한 장에 다 그리려다 글자가
    // 뭉개진다. 넷까지만 받는다 — 셋이 정상이고 하나는 여유다.
    const bullets = (section.bullets ?? []).filter(Boolean).slice(0, MAX_POINT_CARDS);
    brief.typography = {
      headline: section.headline,
      subheadline: section.subheadline,
      point_cards: bullets,
      emphasis:
        options.emphasisWords?.length
          ? { words: options.emphasisWords, treatment: "accent colour, heavier weight" }
          : { words: [], rule: "pick one or two key words from the headline", treatment: "accent colour, heavier weight" },
      do_not_emphasise: ["any word in the subheadline"],
      hierarchy: "headline 2.5-3x the subheadline",
      render_exactly: true,
      readability: "must stay readable when scaled down to a 390px phone; no clipped or ellipsised Korean",
    };

    // 신뢰문구는 망설임을 덮는 한 줄이다("민감한 피부도 부담 없이"). 이것 없이 장점만
    // 나열하면 페이지가 광고로만 읽힌다. 그런데 아예 전달되지 않고 있었다.
    //
    // 제목·불릿과 같은 무게로 두면 안 된다. 크게 그리면 셋이 서로 주인 자리를 다투고,
    // 그러다 제목이 잘린다. 역할과 위치를 함께 지정한다.
    if (section.trust_or_objection_line) {
      (brief.typography as Record<string, unknown>).reassurance_line = {
        text: section.trust_or_objection_line,
        role: "quietly answers the hesitation a buyer has at this point",
        treatment: "one small line, below the point cards, subdued colour — never a heading",
      };
    }

    // CTA("지금 확인하기")는 싣지 않는다. 사용자 결정(2026-07-30):
    // 이미지에 그려 넣으면 눌리지 않는 그림 버튼이 되고, 섹션마다 반복되면 페이지가
    // 버튼 나열이 된다. 실제 구매 버튼은 쇼핑몰이 붙인다.
  } else {
    // 텍스트편집 모드: 글자 없는 사진만 만들고 카피는 편집기에서 얹는다.
    brief.text_in_image = "no text at all — no letters, numbers, logos or watermarks anywhere in the image";
  }

  return JSON.stringify(brief, null, 2);
}
