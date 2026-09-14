import {
  isExecutionControl,
  attachmentPlacementRule,
  designerPersona,
  imageLookDirective,
  preserveDirective,
  restyledPersonDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
import type { Attachment, GroupedAttachments, StyleRole } from "./attachments";
import type { CardCopy, CopyLanguage } from "./copy";
import type { CardPlan } from "./planning";

const LANGUAGE_LABEL: Record<CopyLanguage, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
};

/**
 * 사용자가 화면에서 직접 고른 두 가지. 둘 다 없어도 예전과 똑같이 동작한다.
 *
 * `look` 을 안 넣으면 `auto` 로 읽는다 — 지금까지의 동작(첨부한 레퍼런스의
 * 결을 따라감)이 그대로 유지돼야 쓰던 사람이 안 깨진다.
 */
export interface PromptTuning {
  /** 이미지의 결. `auto` 면 결에 대해 아무 말도 보태지 않는다. */
  look?: ImageLook;
  /** 사용자가 직접 친 지시. 다른 모든 지시보다 세다. */
  userInstruction?: string;
  /**
   * **이 자리**의 첨부를 어떻게 쓸지 사용자가 적은 말 (표지/속지/엔딩).
   *
   * 표지와 속지는 원하는 것이 다르므로 자리마다 따로 받는다. 적혀 있으면 그
   * 자리의 역할 고정 문구를 빼고 이 말만 남긴다(설계 §4-1 A안).
   */
  attachmentIntent?: string;
}

/**
 * 첨부를 「진짜로 보라」고 먼저 못 박는 한 줄.
 *
 * 안 적으면 모델이 첨부를 대충 훑고 기억으로 비슷한 것을 그려낸다 — 로고가
 * 닮은 다른 로고가 되고 제품이 같은 범주의 다른 제품이 된다. 첨부가 하나도
 * 없을 때는 넣지 않는다. 없는 것을 보라고 하면 모델이 지어낸다.
 */
const ATTACHMENT_DECLARATION =
  "Study every attached image closely before drawing. They are the source of truth for what they " +
  "define — reproduce what you actually see in them. Do not approximate them from memory, and " +
  "never substitute a generic stand-in.";

/**
 * 결 지시문 한 덩이. `auto` 면 빈 문자열이라 부르는 쪽이 통째로 뺀다.
 *
 * 「레퍼런스를 이긴다」를 굳이 붙이는 이유가 있다. 첨부 블록이 레퍼런스의
 * `texture and rendering style` 까지 따라 하라고 시킨다. 사용자가 실사
 * 레퍼런스를 올려 두고 「애니」를 고르면 두 지시가 정면으로 부딪히는데, 이
 * 한 마디가 없으면 어느 쪽이 이길지 모델이 매번 다르게 정한다.
 */
function lookBlock(look: ImageLook | undefined): string {
  const directive = imageLookDirective(look ?? "auto");
  if (!directive) return "";
  return "Rendering style for this card — this overrides the rendering style of the" +
    ` CARD-NEWS REFERENCE:\n${directive}`;
}

/** 표지·속지·엔딩은 자기 역할 레퍼런스만 보고, 보존 대상은 모든 역할에 함께 간다. */
export function selectReferencesForRole(
  grouped: GroupedAttachments,
  role: StyleRole,
): Attachment[] {
  return [...grouped.styleByRole[role], ...grouped.keepIdentity];
}

const ROLE_LABEL: Record<StyleRole, string> = {
  cover: "표지",
  body: "속지",
  ending: "엔딩",
};

/** 역할이 맞는 스타일 레퍼런스가 없어도 막지는 않고 화면에 보여줄 경고를 남긴다. */
export function referenceWarningsForRole(
  grouped: GroupedAttachments,
  role: StyleRole,
): string[] {
  if (grouped.styleByRole[role].length > 0) return [];
  const label = ROLE_LABEL[role];
  return [`${label} 레퍼런스가 없습니다. ${label} 카드가 다른 역할과 다른 모양으로 나올 수 있습니다.`];
}

/** 사용자가 고른 역할의 이름. **규칙은 안 붙인다** (설계 §4-1 A안). */
function shortRole(image: Attachment): string {
  if (image.kind === "style_reference") return "reference to imitate";
  if (image.kind !== "keep_identity") return "place as is";
  if (image.subject !== "person") return "subject to keep";
  return image.restyle ? "person to keep, redrawn in another style" : "person to keep";
}

export function buildAttachmentBlock(images: Attachment[], tuning: PromptTuning = {}): string {
  const lines: string[] = [];
  if (images.length > 0) lines.push(ATTACHMENT_DECLARATION);
  lines.push(
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  );
  /**
   * **사용자가 이 자리에 대해 적은 말.**
   *
   * 표지와 속지는 원하는 것이 다르므로 자리마다 따로 받는다(2026-09-08 사용자
   * 결정). 이미지 만들기는 결과가 한 장이라 칸이 하나면 됐지만, 카드뉴스는
   * 자리가 셋이다.
   */
  const intent = tuning.attachmentIntent?.trim() ?? "";

  /**
   * 지시를 적었으면 **부딪히는 고정 문구를 통째로 뺀다** (설계 §4-1 A안).
   *
   * 이미지 만들기에서 실측으로 정한 것이다. 역할 문구가 여섯 문장이고 전부
   * 구체적이라, 우선순위 한 줄로는 사용자가 적은 한 줄을 못 이겼다.
   *
   * **번호와 역할 이름은 남긴다.** 빼면 「①번」이 가리킬 것이 없어진다.
   */
  if (intent && images.length) {
    lines.push(
      "The user wrote what to do with these images. Their words replace the usual rules for each "
      + "role, so those rules are deliberately omitted — except where an instruction is spelled out "
      + "below, which still applies. Read the USER INSTRUCTION and follow it.",
    );
    images.forEach((image, offset) => {
      const number = offset + 1;
      const person = image.kind === "keep_identity" && image.subject === "person";
      // 「사람은 그대로, 그림 느낌만」은 안 지운다 — 부딪히지 않고, 지우면
      // 사람을 하나하나 옮기라는 말이 사라져 작은 것(안경 같은)이 빠진다.
      if (person && image.restyle) {
        lines.push(`Image ${number} is a PRESERVED PERSON, REDRAWN. ${restyledPersonDirective()}`);
        return;
      }
      lines.push(`Image ${number}: the user marked this "${shortRole(image)}".`);
    });
  } else {
  images.forEach((image, offset) => {
    const number = offset + 1;
    if (image.kind === "style_reference") {
      // 2026-07-30 실측 정책(pdp.reference-policy.ts)을 그대로 옮긴 문구다.
      //
      // 전에는 "as closely as possible, replace only the content" 라고만 했다.
      // 그러면 레퍼런스의 아이콘이 '꼴'인지 '내용'인지 모델이 알 수 없어,
      // 있던 아이콘을 그대로 베끼거나 반대로 아이콘 없는 허전한 카드가 나왔다.
      // 가져올 것과 가져오지 않을 것을 나눠 말해야 한다.
      lines.push(
        `Image ${number} is the ${image.role ?? "matching"} CARD-NEWS REFERENCE for this card. ` +
        "Imitate its design language only:",
        "  · layout and composition, typography (weight, width, character), text treatment, " +
        "texture and rendering style (photographic / illustrated / 3D)",
        "  · how each colour is used — which colours fill surfaces and bands, which are only type, " +
        "which are accents. Reproduce that usage, not just the colours themselves.",
        "Do NOT copy anything else from it — not its product, not its people, not its icons or " +
        "illustrations, not its text content. Draw new icons and imagery in the same style so they " +
        "match the text of THIS card.",
      );
    } else if (image.kind === "keep_identity") {
      const person = image.subject === "person";
      // 사람을 그대로 두고 그림 느낌만 바꾸는 경우는 다른 말을 쓴다 (설계 §4-3).
      // `preserveDirective` 는 restyle 을 금지해서, 그 말이 가면 처음부터 막힌다.
      if (person && image.restyle) {
        lines.push(`Image ${number} is a PRESERVED PERSON, REDRAWN. ${restyledPersonDirective()}`);
        return;
      }
      // 지키는 말은 공용 어휘가 정한다. 도구마다 다르게 적으면 어느 도구에서는
      // 지켜지고 어느 도구에서는 조금씩 바뀐다 — 2026-09-04 사용자 보고.
      lines.push(
        `Image ${number} is a ${person ? "PRESERVED PERSON" : "PRESERVED SUBJECT"}. ` +
        preserveDirective(person ? "preserve-person" : "preserve-object"),
      );
    }
  });
  }
  // 우선순위 문장은 다섯 도구가 같은 것을 쓴다(@fixup/shared). 여기서 따로
  // 쓰면 도구마다 순서가 갈리고, 같은 지시에 다른 그림이 나온다.
  //
  // 사용자가 직접 친 말이 맨 위다. 전에는 그 자리가 아예 없어서, 「배경을
  // 밤으로」라고 적어도 낮인 레퍼런스가 이겼다.
  const priority = priorityLine({
    // 첨부 지시도 사람이 친 말이다. 이것만 적었을 때 우선순위 줄이 빠지면
    // 「무엇이 먼저인지」를 아무도 안 말해 준다.
    hasUserInstruction: Boolean(mergedInstruction(tuning)),
    hasPreserved: images.some((image) => image.kind === "keep_identity"),
  });
  if (priority) lines.push(priority);
  if (images.length) {
    lines.push(attachmentPlacementRule(images.some((image) => image.kind === "keep_identity")));
  }
  return lines.join("\n");
}

export function buildFrame(input: {
  copy: CardCopy;
  images: Attachment[];
  size: { width: number; height: number };
  language: CopyLanguage;
  look?: ImageLook;
  userInstruction?: string;
  /** 이 카드 자리에 적은 말. 부르는 쪽이 골라 넘긴다. */
  attachmentIntent?: string;
}): string {
  const texts = [
    ["HEADLINE", input.copy.headline],
    ["BODY", input.copy.body],
    ["ACCENT", input.copy.accent],
    ["FOOTNOTE", input.copy.footnote],
  ].filter(([, value]) => Boolean(value?.trim()));
  const look = lookBlock(input.look);

  return [
    buildAttachmentBlock(input.images, {
      look: input.look,
      userInstruction: input.userInstruction,
      attachmentIntent: input.attachmentIntent,
    }),
    ...(look ? ["", look] : []),
    "",
    `Render this ${LANGUAGE_LABEL[input.language]} text exactly as written, with correct spelling and spacing:`,
    ...texts.map(([label, value]) => `  ${label}: ${value}`),
    "Every non-empty field listed above must appear visibly in the image in full.",
    "If the copy needs more room, use additional lines or reduce the font size so the full text fits.",
    "Do not omit or summarize a field to make it fit.",
    "Do not translate, paraphrase, or shorten the text listed above.",
    "The listed fields are the only authored card copy.",
    "Do not invent additional headlines, body copy, slogans, greetings, CTAs, footer messages, copyright notices, trademark claims, dates, or brand names.",
    "Incidental environmental text on signs, signboards, props, or existing preserved labels is allowed when visually natural; keep it sparse and subordinate, and never use it as authored card copy or a factual claim.",
    "Keep incidental background text sparse. This is a card, not a page full of words.",
    "",
    `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`,
  ].join("\n");
}

/**
 * 이미지 모델에 실제로 나가는 한 덩이를 만든다.
 *
 * 사용자가 친 지시를 **맨 앞과 맨 뒤 양쪽**에 놓는다. 2026-09-04 실측에서
 * 프롬프트 뒤에 긴 문단을 덧붙였더니 앞쪽 구도 지시가 밀려 무시됐다. 긴
 * 프롬프트에서 가운데 문장은 힘을 잃는다 — 가장 중요한 것은 양끝에 둔다.
 */
/**
 * 사람이 친 말 둘을 하나로 합친다.
 *
 * **자리별 첨부 지시(`attachmentIntent`)와 결과물 지시(`userInstruction`)는 서로
 * 다른 말이다.** 우선순위 규칙(`priorityLine`)이 「USER INSTRUCTION」 하나를
 * 가리키므로, 둘을 따로 보내면 어느 쪽이 센지 모호해진다. 라벨을 붙여 합치면
 * 순서만으로 무엇이 먼저인지 말할 수 있다.
 *
 * ── 이것이 없으면 지시를 적는 쪽이 손해다 ───────────────────
 *
 * 지시를 적으면 역할 고정 문구가 사라지는데(4-1 A안), 그 자리를 채울 말이 안
 * 실리면 **보호 문구만 없어지고 대신 들어오는 말이 없다.** 실제로 그 상태로
 * 한 번 나갔다 — 「USER INSTRUCTION 을 읽고 따르라」고 써 놓고 그 블록이
 * 비어 있었다(2026-09-08 리뷰).
 *
 * 이미지 만들기가 이미 같은 모양이다(`poster-core/src/prompt.ts`).
 */
export function mergedInstruction(tuning: PromptTuning): string {
  return [
    tuning.attachmentIntent?.trim() ? `첨부한 그림에 대해: ${tuning.attachmentIntent.trim()}` : "",
    tuning.userInstruction?.trim() ? `결과물에 대해: ${tuning.userInstruction.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export function composePrompt(frame: string, llmBody: string, tuning: PromptTuning = {}): string {
  // 첨부 지시와 결과물 지시를 함께 싣는다. 하나만 실으면 나머지가 사라진다.
  const instruction = mergedInstruction(tuning);
  return [
    userInstructionHead(instruction),
    // 누가 그리는가는 사용자가 친 말 다음이다. 다섯 도구가 같은 사람을 세운다.
    designerPersona(),
    llmBody.trim(),
    frame,
    userInstructionTail(instruction),
  ].filter(Boolean).join("\n\n");
}

/**
 * 자리마다 사용자가 적은 말 (표지/속지/엔딩).
 *
 * **한 칸으로 묶지 않는다.** 표지와 속지는 원하는 것이 다르다
 * (2026-09-08 사용자 결정).
 */
export type AttachmentIntents = Partial<Record<StyleRole, string>>;

/** 이 카드 자리에 해당하는 말만 꺼낸다. 없으면 빈 문자열. */
export function intentForRole(intents: AttachmentIntents | undefined, role: StyleRole): string {
  return intents?.[role]?.trim() ?? "";
}

export interface ImagePromptInput {
  role: StyleRole;
  copy: CardCopy;
  plan: CardPlan;
  grouped: GroupedAttachments;
  size: { width: number; height: number };
  language: CopyLanguage;
  look?: ImageLook;
  userInstruction?: string;
  /** 자리마다 적은 말. 이 카드의 자리에 해당하는 것만 쓴다. */
  attachmentIntents?: AttachmentIntents;
}

export interface ScenePromptRequest {
  prompt: string;
  imageUrls: string[];
}

export interface ImagePromptProvider {
  generate(request: ScenePromptRequest): Promise<unknown>;
}

export interface ImagePromptResult {
  body: string;
  warnings: string[];
}

/**
 * LLM 이 장면·구도·강조를 판단할 자료만 조립한다.
 * 코드가 구체적인 카메라·조명·장면 형용사를 만들지 않는다.
 */
export function buildSceneRequest(input: ImagePromptInput): ScenePromptRequest {
  const references = selectReferencesForRole(input.grouped, input.role);
  // 장면을 쓰는 LLM 도 사용자 지시와 결을 알아야 한다. 모르면 「밤」이라고
  // 적은 사용자에게 낮 장면을 써 주고, 그 장면이 그대로 이미지 모델에 간다.
  return {
    prompt: [
      // 장면을 쓰는 LLM 도 첨부 지시를 알아야 한다. 모르면 「①번 사람을」이라고
      // 적은 사용자에게 그 사람이 없는 장면을 써 준다.
      userInstructionHead(mergedInstruction({
        userInstruction: input.userInstruction,
        attachmentIntent: intentForRole(input.attachmentIntents, input.role),
      })),
      "Write the visual scene prompt for one card-news image.",
      "Inspect the attached reference images directly. Use them as the visual source; do not replace them with a textual reconstruction.",
      buildAttachmentBlock(references, {
        look: input.look,
        userInstruction: input.userInstruction,
        // 이 카드의 자리에 적은 말만 간다 — 표지 지시가 속지에 새면 안 된다.
        attachmentIntent: intentForRole(input.attachmentIntents, input.role),
      }),
      lookBlock(input.look),
      `Card role: ${input.role}`,
      `Planner intent: ${input.plan.intent}`,
      `Planner visual brief: ${input.plan.visualBrief}`,
      `Confirmed copy: ${JSON.stringify(input.copy)}`,
      "Give every non-empty copy field (headline, body, accent, footnote) an explicit visible placement in the scene prompt.",
      "If a field is long, direct the image model to use more lines or a smaller font while keeping the full original text.",
      "Do not omit, summarize, paraphrase, or replace any copy field with shorter labels.",
      "Do not invent greetings, slogans, CTAs, footer copy, copyright notices, trademark claims, dates, or brand names that are absent from the confirmed copy.",
      "Incidental environmental words on signs, signboards, and props are allowed when natural to the scene, but they must not become new card copy or claims.",
      "Decide the scene, composition, visual emphasis, and how to follow the matching reference. Return only the image prompt body.",
      userInstructionTail(input.userInstruction ?? ""),
    ].filter(Boolean).join("\n\n"),
    imageUrls: references.map((image) => image.url),
  };
}

/** LLM 실패가 이미지 생성 전체를 멈추지 않게 빈 본문을 돌려준다. */
export async function writeImagePrompt(
  input: ImagePromptInput,
  provider: ImagePromptProvider,
): Promise<ImagePromptResult> {
  const warnings = referenceWarningsForRole(input.grouped, input.role);
  try {
    const generated = await provider.generate(buildSceneRequest(input));
    return { body: typeof generated === "string" ? generated : "", warnings };
  } catch (error) {
    if (isExecutionControl(error)) throw error;
    return { body: "", warnings };
  }
}
