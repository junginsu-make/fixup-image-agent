import {
  attachmentPlacementRule,
  designerPersona,
  imageLookDirective,
  preserveDirective,
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

export function buildAttachmentBlock(images: Attachment[], tuning: PromptTuning = {}): string {
  const lines: string[] = [];
  if (images.length > 0) lines.push(ATTACHMENT_DECLARATION);
  lines.push(
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  );
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
      // 지키는 말은 공용 어휘가 정한다. 도구마다 다르게 적으면 어느 도구에서는
      // 지켜지고 어느 도구에서는 조금씩 바뀐다 — 2026-09-04 사용자 보고.
      const person = image.subject === "person";
      lines.push(
        `Image ${number} is a ${person ? "PRESERVED PERSON" : "PRESERVED SUBJECT"}. ` +
        preserveDirective(person ? "preserve-person" : "preserve-object"),
      );
    }
  });
  // 우선순위 문장은 다섯 도구가 같은 것을 쓴다(@fixup/shared). 여기서 따로
  // 쓰면 도구마다 순서가 갈리고, 같은 지시에 다른 그림이 나온다.
  //
  // 사용자가 직접 친 말이 맨 위다. 전에는 그 자리가 아예 없어서, 「배경을
  // 밤으로」라고 적어도 낮인 레퍼런스가 이겼다.
  const priority = priorityLine({
    hasUserInstruction: Boolean(tuning.userInstruction?.trim()),
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
}): string {
  const texts = [
    ["HEADLINE", input.copy.headline],
    ["BODY", input.copy.body],
    ["ACCENT", input.copy.accent],
    ["FOOTNOTE", input.copy.footnote],
  ].filter(([, value]) => Boolean(value?.trim()));
  const look = lookBlock(input.look);

  return [
    buildAttachmentBlock(input.images, { look: input.look, userInstruction: input.userInstruction }),
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
export function composePrompt(frame: string, llmBody: string, tuning: PromptTuning = {}): string {
  const instruction = tuning.userInstruction ?? "";
  return [
    userInstructionHead(instruction),
    // 누가 그리는가는 사용자가 친 말 다음이다. 다섯 도구가 같은 사람을 세운다.
    designerPersona(),
    llmBody.trim(),
    frame,
    userInstructionTail(instruction),
  ].filter(Boolean).join("\n\n");
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
      userInstructionHead(input.userInstruction ?? ""),
      "Write the visual scene prompt for one card-news image.",
      "Inspect the attached reference images directly. Use them as the visual source; do not replace them with a textual reconstruction.",
      buildAttachmentBlock(references, { look: input.look, userInstruction: input.userInstruction }),
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
  } catch {
    return { body: "", warnings };
  }
}
