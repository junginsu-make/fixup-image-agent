import { designerPersona, imageLookDirective, type ImageLook } from "@fixup/shared";
import type {
  PdpGuidePriorityMode,
  PdpImageStyle,
  PdpModelAgeRange,
  PdpModelCountry,
  PdpModelGender,
  PdpOutputMode,
  SectionBlueprint,
} from "./types";

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
  /**
   * 그림의 결. **상세페이지의 기본은 `photoreal`** 이다.
   *
   * 다른 도구는 `auto`(첨부의 결을 따라감)가 기본이지만, 상세페이지는 처음부터
   * 늘 사진이었다. 기본을 `auto` 로 두면 쓰던 사람의 결과물이 조용히 바뀐다.
   * 그래서 여기서만 기본이 다르다.
   */
  look?: ImageLook;
  /**
   * 사람이 나올 때 **누구인가**. 화면의 인물 설정이 여기로 온다.
   *
   * 인물 사진이나 캐릭터가 붙으면(`withModel`) 그쪽이 누구인지를 정하므로
   * 이 값들은 안 쓴다 — 얼굴은 그 사람인데 나이·국적 설명이 부딪히면 모델이
   * 절충해 제3의 인물이 된다.
   */
  modelGender?: PdpModelGender;
  modelAgeRange?: PdpModelAgeRange;
  modelCountry?: PdpModelCountry;
  /**
   * 구성안의 배치·스타일과 촬영 방식이 부딪힐 때 어느 쪽을 따를지.
   *
   * 화면에 손잡이가 있는데 엔진이 안 보고 있었다(2026-09-09 확인).
   */
  guidePriorityMode?: PdpGuidePriorityMode;
  /**
   * 페이지 전체의 배경 설명. 화면의 「그 밖에 · 채널과 시즌」이 여기로 온다.
   *
   * **지시가 아니라 배경이다.** 사용자가 이 그림에 대해 직접 친 말
   * (`userInstruction`)이 따로 있고 그쪽이 위다. 둘을 같은 무게로 실으면
   * 「여름 시즌」이 「왼쪽에 놓아 줘」와 다툰다.
   */
  pageContext?: string;
}

/** 나라 이름. 안 고르면 지금까지처럼 한국이다. */
const COUNTRY_LABEL: Record<PdpModelCountry, { people: string; place: string }> = {
  korea: { people: "Korean", place: "Korea" },
  japan: { people: "Japanese", place: "Japan" },
  usa: { people: "American", place: "the United States" },
  france: { people: "French", place: "France" },
  germany: { people: "German", place: "Germany" },
  africa: { people: "African", place: "Africa" },
};

const AGE_LABEL: Record<PdpModelAgeRange, string> = {
  teen: "in their late teens",
  "20s": "in their 20s",
  "30s": "in their 30s",
  "40s": "in their 40s",
  "50s_plus": "in their 50s or older",
};

function countryOf(options: ImagePromptOptions) {
  return COUNTRY_LABEL[options.modelCountry ?? "korea"];
}

/** 「40대 한국 남성」 같은 한 마디. 사람이 나올 때만 쓴다. */
export function personDescriptor(options: ImagePromptOptions) {
  const country = countryOf(options).people;
  const gender = options.modelGender === "male" ? "man" : "woman";
  return `a ${country} ${gender} ${AGE_LABEL[options.modelAgeRange ?? "20s"]}`;
}

/** 상세페이지의 기본 결. 이유는 `ImagePromptOptions.look` 주석 참조. */
export const DEFAULT_PDP_LOOK: ImageLook = "photoreal";

/**
 * 이 브리프의 결. 안 고르면 사진이다.
 *
 * 결이 사진이 아닐 때 실사 지시를 같이 보내면 정면충돌한다 — 애니를 골랐는데
 * "3D 렌더도 일러스트도 아닌 진짜 사진이어야 한다"가 함께 나가면 모델이 둘 중
 * 하나를 버린다. 그래서 실사 문구는 `photoreal` 일 때만 싣는다.
 */
function lookOf(options: ImagePromptOptions): ImageLook {
  return options.look ?? DEFAULT_PDP_LOOK;
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
    // 붙인 사진·캐릭터가 누구인지를 정한다. 여기서 나이·국적을 덧대면
    // 얼굴은 그 사람인데 설명이 부딪혀 제3의 인물이 나온다.
    return "required — the supplied reference person must appear exactly as shown.";
  }
  const place = countryOf(options).place;
  return `optional — include a person only when the scene genuinely calls for one; a product close-up or styled table is often stronger. When someone does appear they should read as ${personDescriptor(options)}, and the setting must read as ${place}.`;
}

/**
 * 배경 설명의 상한. 「그 밖에」는 자유 서술 칸이라 문단째로 붙여 넣는다.
 *
 * 판매자 브리프가 같은 이유로 칸마다 500자에서 자른다(`normalizeSellerBrief`).
 * 여기만 무제한이면 배경 설명이 그 뒤의 지시들을 밀어낸다.
 */
const MAX_PAGE_CONTEXT = 500;

function pageContextOf(options: ImagePromptOptions) {
  return options.pageContext?.trim().slice(0, MAX_PAGE_CONTEXT) ?? "";
}

export function buildImageSystemPrompt(options: ImagePromptOptions) {
  const look = lookOf(options);
  return [
    // 누가 그리는가를 맨 앞에 세운다. 다섯 도구가 같은 사람을 세운다 —
    // 도구마다 다른 사람을 세우면 결과의 격이 도구마다 갈린다.
    designerPersona(),
    "You are art-directing Korean e-commerce detail page sections.",
    "Read the brief carefully and render exactly what it asks for — nothing more.",
    // 인물 참조가 붙으면 나이·국적을 덧대지 않는다. 얼굴은 그 사람인데 설명이
    // 부딪히면 모델이 절충해 제3의 인물을 그린다 — `peopleRule` 과 같은 규칙이다.
    options.withModel
      ? "People are optional. When someone appears, it must be the supplied reference person, exactly as shown."
      : `People are optional. Only include a person when the scene genuinely calls for one; when one appears they should read as ${personDescriptor(options)}.`,
    // 실사는 지금까지 쓰던 문구를 그대로 둔다. 다른 결을 골랐을 때만 공용
    // 지시문으로 갈아 끼운다 — `auto` 면 아무 말도 보태지 않는다.
    look === "photoreal"
      ? "Realism: produce a real photograph shot by a professional — natural skin and material texture, physical light. Never a 3D render, an illustration, or a generic stock photo."
      : imageLookDirective(look, options.withModel ? "person" : "generic"),
    "Composition: compose deliberately. Choose the crop, angle and eye level this message deserves instead of defaulting to a safe centred template. Vary it between sections.",
    "Typography: render the given Korean copy exactly, large and legible at phone size. Emphasise only the words listed, in the accent colour.",
    "Never draw buttons, arrows or other clickable controls — these are static images.",
    options.desiredTone ? `Overall tone: ${options.desiredTone}.` : "",
    // 배경 설명은 톤 뒤에 둔다. 앞에 두면 장면 지시처럼 읽힌다.
    pageContextOf(options) ? `Page context (background, not an instruction): ${pageContextOf(options)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildImageJson(section: SectionBlueprint, options: ImagePromptOptions) {
  const look = lookOf(options);
  const brief: Record<string, unknown> = {
    task: "korean_ecommerce_detail_page_section",
    format: { orientation: "vertical", target: "mobile", static_image: true },
    scene: {
      subject: section.prompt_en || section.prompt_ko || section.headline,
      setting: STYLE_SETTING[options.style],
      location: countryOf(options).place,
      people: peopleRule(options),
    },
    layout: section.layout_notes || "compose it the way this message deserves",
    forbidden: [
      "buttons",
      "arrows",
      "clickable controls",
      "invented numbers",
      "invented brand names",
      "watermarks",
    ],
  };

  // 결에 따라 다른 열쇠가 나간다. 실사면 지금까지의 `realism` 을 그대로,
  // 애니·3D·그림이면 그 결의 지시문을, `auto` 면 아무것도 싣지 않는다.
  // 둘을 같이 실으면 "사진이어야 한다"와 "사진이 아니어야 한다"가 부딪힌다.
  if (look === "photoreal") {
    brief.realism = {
      must: ["real photograph", "natural material texture", "physical light"],
      must_not: ["3D render", "illustration", "stock photo look", "waxy over-smoothed skin"],
    };
  } else if (look !== "auto") {
    brief.look = imageLookDirective(look, options.withModel ? "person" : "generic");
  }

  /*
    **기획이 이 섹션에 대해 적어 둔 것.**

    기획에게 섹션마다 「이 이미지가 전달할 메시지」와 「제품을 어떻게 참고할지」를
    적으라고 시켜 놓고 아무도 안 읽고 있었다. 섹션마다 다르게 적히는데 전부
    버려졌다 — 그래서 모든 섹션이 같은 얼굴로 나왔다.

    빈 칸은 안 싣는다. 빈 자리를 남기면 모델이 채워야 할 자리로 읽고 지어낸다.
  */
  const trimmed = (value: string | undefined) => {
    const text = String(value ?? "").trim();
    return text || undefined;
  };
  const sectionMeta = {
    name: trimmed(section.section_name),
    role: trimmed(section.goal),
    message: trimmed(section.purpose),
  };
  if (Object.values(sectionMeta).some(Boolean)) {
    brief.section = Object.fromEntries(
      Object.entries(sectionMeta).filter(([, value]) => value),
    );
  }

  // 기획이 정한 「제품을 어떻게 참고할지」. 형태·라벨·재질을 지키는 기준이다.
  const productReference = trimmed(section.reference_usage);
  if (productReference) brief.product_reference = productReference;

  /*
    규제·표현 주의. **통이미지 모드에서 특히 중요하다** — 글자를 그림에 직접
    그리므로 쓰면 안 되는 표현을 모르면 그대로 그려진다.
  */
  const compliance = trimmed(section.compliance_notes);
  if (compliance) brief.compliance = compliance;

  if (section.style_guide) {
    brief.design_system = section.style_guide;
  }

  /*
    구성안의 배치·스타일과 촬영 방식이 부딪힐 때 어느 쪽을 따를지.
    화면에 손잡이가 있는데 엔진이 안 보고 있었다.
  */
  brief.guide_priority =
    options.guidePriorityMode === "style-first"
      ? "the selected shot type wins — ignore layout and design_system whenever they conflict with it"
      : "the guide wins — follow layout and design_system first, and treat the shot type as a supporting constraint";
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
