import {
  attachmentPlacementRule, designerPersona, imageLookDirective, preserveDirective,
  priorityLine, userInstructionHead, userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
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
 * - **사람이 직접 친 말은 양끝에 둔다.** 2026-09-04 실측에서 프롬프트 뒤에 긴
 *   문단을 붙였더니 앞쪽 구도 지시가 밀려 무시됐다. 긴 프롬프트에서 중간
 *   문장은 힘을 잃는다.
 */

export type PosterImageKind = "style_reference" | "preserved";

export interface PosterPromptImage {
  kind: PosterImageKind;
  /**
   * 지킬 것이 사람인가 물건인가. 안 적으면 물건으로 다룬다 — 옛 자료에는
   * 이 값이 없고, 사람으로 보면 없는 얼굴을 지키려 든다.
   */
  subject?: "person" | "object";
  title?: string;
}

export interface PosterPromptInput {
  slots: PosterSlots;
  images: PosterPromptImage[];
  /**
   * 픽셀을 아는 모델만 준다.
   *
   * 비율을 열거형으로 받는 모델은 픽셀이 없다. 예전에는 그때도 이 칸이
   * 필수라 0 을 채워 넣었고, "Output size 0x0" 이 그대로 모델에게 갔다.
   * 없으면 안 적는 것이 맞다 — 비율은 API 쪽 aspect_ratio 로 이미 간다.
   */
  size?: { width: number; height: number };
  /**
   * 사용자가 화면에서 직접 친 추가 지시.
   *
   * 슬롯(scene·subject·action)은 기획이 채운 초안이고 이건 사람이 친 말이다.
   * 그래서 우선순위가 가장 높고, 프롬프트의 **맨 앞과 맨 뒤 두 곳**에 들어간다.
   */
  userInstruction?: string;
  /**
   * 그림의 결. 기본은 `auto`.
   *
   * `auto` 여야 지금 쓰던 사람이 안 깨진다 — 첨부 레퍼런스의 결을 따라가는
   * 지금 동작이 그대로 유지된다. 명시적으로 골랐을 때만 지시가 들어간다.
   */
  look?: ImageLook;
}

const TYPE_INTERACTION_EN: Record<string, string> = {
  "통과": "the type passes through and across the subject",
  "뒤로": "the type sits behind the subject",
  "가림": "the type overlaps and partly covers the subject",
  "감쌈": "the type wraps around the subject",
};

function attachmentLines(images: PosterPromptImage[], hasUserInstruction: boolean): string[] {
  if (!images.length) return [];
  const lines = [
    // 첨부를 「대충 이런 느낌」으로 흘려보내지 말라고 먼저 못 박는다. 안 적으면
    // 모델이 붙인 그림 대신 자기가 아는 비슷한 것을 그려 넣는다.
    "Study every attached image closely before drawing. They are the source of truth for what they "
    + "define — reproduce what you actually see in them. Do not approximate them from memory, and "
    + "never substitute a generic stand-in.",
    "Follow the instruction for each attached image separately. Image numbers match attachment order.",
  ];
  images.forEach((image, index) => {
    const number = index + 1;
    if (image.kind === "preserved") {
      // 지키는 말은 공용 어휘가 정한다. 도구마다 다르게 적으면 어느 도구에서는
      // 지켜지고 어느 도구에서는 조금씩 바뀐다 — 2026-09-04 사용자 보고.
      const role = image.subject === "person" ? "preserve-person" : "preserve-object";
      const label = image.subject === "person" ? "PRESERVED PERSON" : "PRESERVED SUBJECT";
      lines.push(`Image ${number} is a ${label}. ${preserveDirective(role)}`);
      return;
    }
    // 2026-07-30 실측 정책(pdp.reference-policy.ts)을 그대로 옮긴 문구다.
    // "as closely as possible" 만 쓰면 레퍼런스의 아이콘·제품이 그대로 나온다.
    // 가져올 것과 가져오지 않을 것을 나눠 말해야 한다.
    lines.push(
      `Image ${number} is a POSTER REFERENCE. Imitate its design language only:`,
      "  · layout and composition, typography (weight, width, character), text treatment, texture "
      + "and rendering style (photographic / illustrated / 3D)",
      "  · how each colour is used — which colours fill surfaces and bands, which are only type, "
      + "which are accents. Reproduce that usage, not just the colours themselves.",
      "Do NOT copy anything else from it — not its product, not its people, not its icons or "
      + "illustrations, not its text content. Draw new icons and imagery in the same style so they "
      + "match what is described below.",
    );
  });
  // 순서는 공용 어휘(@fixup/shared)가 정한다. 다섯 도구가 갈리면 안 된다.
  //
  // 전에는 여기에 「PRESERVED > REFERENCE > scene」 이 박혀 있었고 사용자가 친
  // 말은 아예 없었다. 배경을 밤으로 해 달라고 적어도 낮인 레퍼런스가 이겼다.
  const priority = priorityLine({
    hasUserInstruction,
    hasPreserved: images.some((image) => image.kind === "preserved"),
  });
  if (priority) lines.push(priority);
  lines.push(attachmentPlacementRule(images.some((image) => image.kind === "preserved")));
  // 얼굴이 둘이면 모델이 절충해 제3의 인물을 만든다(2026-07-30 실측,
  // pdp-core/src/pdp.reference-policy.ts). 막을 수 없으면 못이라도 박는다.
  if (images.filter((image) => image.kind === "preserved" && image.subject === "person").length > 1) {
    lines.push(
      "Multiple preserved people are attached. Show only one person in the poster — pick the first "
      + "preserved person and do not blend the faces into a new individual.",
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
  const instruction = input.userInstruction ?? "";
  const head = userInstructionHead(instruction);
  const tail = userInstructionTail(instruction);
  // 지킬 인물이 붙어 있으면 실사 지시도 사람 몸으로 말해야 한다. 중립 문단만
  // 가면 모공·솜털 이야기가 빠져 피부가 밀랍처럼 나온다 — 정작 얼굴을 지키려고
  // 사람을 붙인 작업에서 그렇게 되면 안 된다.
  const hasPerson = input.images.some(
    (image) => image.kind === "preserved" && image.subject === "person",
  );
  const look = imageLookDirective(input.look ?? "auto", hasPerson ? "person" : "generic");
  return [
    // 사람이 친 말이 맨 앞이다. 아래를 다 읽기 전에 무엇이 가장 센지 안다.
    ...(head ? [head, ""] : []),
    // 그 다음이 누가 그리는가다. 무엇을 할지가 먼저고, 어떻게 할지가 그 뒤다 —
    // 역할을 앞에 세우면 사람이 친 말이 한 칸 밀린다.
    designerPersona(),
    "",
    ...attachmentLines(input.images, Boolean(head)),
    "",
    ...sceneLines(input.slots),
    ...(look ? [look] : []),
    "",
    ...copyLines(input.slots),
    "",
    ...(forbidden ? [`Do not include: ${forbidden}.`] : []),
    // 맨 뒤에서 한 번 더 못 박는다. 긴 프롬프트에서 중간은 힘을 잃는다.
    ...(tail ? [tail] : []),
    input.size
      ? `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`
      : "No outer border, no page frame, no UI chrome.",
  ].filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim();
}
