import type { PosterSlots } from "./schemas";

/**
 * 슬롯을 fal 프롬프트로 조립한다.
 *
 * 카드뉴스에서 겪은 것을 처음부터 넣는다:
 *
 * - **앵커가 없다.** 이전 결과를 붙이고 "똑같이 만들라"고 하지 않는다.
 *   그 한 문장 때문에 속지가 전부 표지 모양으로 나온 적이 있다.
 * - **글자 칸마다 자리를 준다.** 자리를 안 주면 모델이 짧은 라벨로 요약해 넣는다.
 * - **없는 것을 지어내지 말라고 한다.** 저작권 표시·인사말이 저절로 생긴 적이 있다.
 * - **배경 글자는 금지가 아니라 자제다.** 간판까지 막으면 그림이 어색해진다.
 */

export type PosterImageKind = "style_reference" | "preserved";

export interface PosterPromptImage {
  kind: PosterImageKind;
  title?: string;
}

export interface PosterPromptInput {
  slots: PosterSlots;
  images: PosterPromptImage[];
  size: { width: number; height: number };
}

const TYPE_INTERACTION_EN: Record<string, string> = {
  "통과": "the type passes through and across the subject",
  "뒤로": "the type sits behind the subject",
  "가림": "the type overlaps and partly covers the subject",
  "감쌈": "the type wraps around the subject",
};

function attachmentLines(images: PosterPromptImage[]): string[] {
  if (!images.length) return [];
  const lines = ["Follow the instruction for each attached image separately. Image numbers match attachment order."];
  images.forEach((image, index) => {
    const number = index + 1;
    if (image.kind === "preserved") {
      lines.push(
        `Image ${number} is a PRESERVED SUBJECT. Keep its identity exactly — shape, proportions, colors, `
        + "materials, labels and logo text. Angle and lighting may change to fit this poster, but it must "
        + "remain recognisably the same object or person.",
      );
      return;
    }
    lines.push(
      `Image ${number} is a POSTER REFERENCE. Reproduce its layout, typography, color system, texture and `
      + "rendering style as closely as possible, and replace only the content with what is described below.",
    );
  });
  if (images.some((image) => image.kind === "preserved")) {
    lines.push(
      "Priority when instructions conflict: PRESERVED SUBJECT takes priority over the POSTER REFERENCE, "
      + "which takes priority over the scene description.",
    );
  }
  return lines;
}

function sceneLines(slots: PosterSlots): string[] {
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    if (value.trim()) lines.push(`  ${label}: ${value.trim()}`);
  };
  push("Poster type", slots.kind);
  push("Scene", slots.scene);
  push("Subject", slots.subject);
  push("Action", slots.action);
  push("Dominant color", slots.dominantColor);
  push("Accent color", slots.accentColor);
  if (slots.typeInteraction) {
    lines.push(`  Type and subject: ${TYPE_INTERACTION_EN[slots.typeInteraction] ?? slots.typeInteraction}`
      + ` (${slots.typeInteraction})`);
  }
  return lines.length ? ["Scene:", ...lines] : [];
}

function copyLines(slots: PosterSlots): string[] {
  const all: Array<[string, string]> = [
    ["HEADLINE", slots.headline],
    ["SUBLINE", slots.subline],
    ...slots.sideTexts.map((value, index): [string, string] => [`SIDE ${index + 1}`, value]),
  ];
  const entries = all.filter(([, value]) => value.trim().length > 0);

  if (!entries.length) return [];

  return [
    "Render this text exactly as written, with correct spelling and spacing:",
    ...entries.map(([label, value]) => `  ${label}: ${value}`),
    "Give every field above an explicit visible placement in the poster.",
    "If a field is long, use more lines or a smaller font so the full text fits.",
    "Do not omit, summarize, paraphrase, or shorten any of it, and do not replace it with a shorter label.",
    "",
    "The fields above are the only authored poster copy.",
    "Do not invent additional headlines, taglines, slogans, greetings, CTAs, footer messages,",
    "copyright notices, trademark claims, dates, or brand names.",
    "Incidental environmental text on signs, signboards, or props is allowed when visually natural;",
    "keep it sparse and subordinate, and never use it as authored copy or a factual claim.",
  ];
}

export function buildPosterPrompt(input: PosterPromptInput): string {
  const forbidden = input.slots.forbidden.trim();
  return [
    ...attachmentLines(input.images),
    "",
    ...sceneLines(input.slots),
    "",
    ...copyLines(input.slots),
    "",
    ...(forbidden ? [`Do not include: ${forbidden}.`] : []),
    `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`,
  ].filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim();
}
