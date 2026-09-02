import type { Attachment, GroupedAttachments, StyleRole } from "./attachments";
import type { CardCopy, CopyLanguage } from "./copy";
import type { CardPlan } from "./planning";

const LANGUAGE_LABEL: Record<CopyLanguage, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
};

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

export function buildAttachmentBlock(images: Attachment[]): string {
  const lines = [
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  ];
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
      lines.push(
        `Image ${number} is a PRESERVED SUBJECT. Keep its identity exactly — shape, proportions, colors, ` +
        "materials, labels and logo text. The camera angle and lighting may change to fit this card, " +
        `but it must remain recognisably the same ${image.subject === "person" ? "person" : "object"}.`,
      );
    }
  });
  lines.push(
    "Priority when instructions conflict: PRESERVED SUBJECT takes priority over the CARD-NEWS REFERENCE, " +
    "which takes priority over the scene description.",
  );
  return lines.join("\n");
}

export function buildFrame(input: {
  copy: CardCopy;
  images: Attachment[];
  size: { width: number; height: number };
  language: CopyLanguage;
}): string {
  const texts = [
    ["HEADLINE", input.copy.headline],
    ["BODY", input.copy.body],
    ["ACCENT", input.copy.accent],
    ["FOOTNOTE", input.copy.footnote],
  ].filter(([, value]) => Boolean(value?.trim()));

  return [
    buildAttachmentBlock(input.images),
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

export function composePrompt(frame: string, llmBody: string): string {
  return llmBody.trim() ? `${llmBody.trim()}\n\n${frame}` : frame;
}

export interface ImagePromptInput {
  role: StyleRole;
  copy: CardCopy;
  plan: CardPlan;
  grouped: GroupedAttachments;
  size: { width: number; height: number };
  language: CopyLanguage;
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
  return {
    prompt: [
      "Write the visual scene prompt for one card-news image.",
      "Inspect the attached reference images directly. Use them as the visual source; do not replace them with a textual reconstruction.",
      buildAttachmentBlock(references),
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
    ].join("\n\n"),
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
