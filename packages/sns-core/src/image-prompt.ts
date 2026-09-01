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
      lines.push(
        `Image ${number} is the ${image.role ?? "matching"} CARD-NEWS REFERENCE for this card. ` +
        "Reproduce its layout, typography, color system, texture, and rendering style " +
        "(photographic / illustrated / 3D) as closely as possible, and replace only the content " +
        "with the text and scene described below.",
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
