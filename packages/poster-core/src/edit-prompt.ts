import { designerPersona, userInstructionHead, userInstructionTail } from "@fixup/shared";
import type { PosterPromptImage } from "./prompt";
import type { PosterSlots } from "./schemas";

/**
 * 「이 장만 고치기」의 프롬프트.
 *
 * ── 왜 따로 조립하나 ─────────────────────────────────────────────
 *
 * 전에는 처음 만들기의 조립(`buildPosterPrompt`)을 그대로 탔다. 고칠 그림을
 * 레퍼런스로 붙이고 지시를 `slots.action` 끝에 이어 붙였다. 그러자 세 가지가
 * 한꺼번에 어긋났다(2026-09-29 사용자 보고 — 「고칠 때 적은 말이 안 먹힌다」).
 *
 *   ① 지시가 `Action:` 한 줄 안에 묻혔다. 사람이 친 말을 양끝에 두는 배치가
 *      없었다. 긴 프롬프트에서 중간 문장은 힘을 잃는다(2026-09-04 실측).
 *   ② 우선순위 줄이 `the REFERENCE image > the scene description` 이었다.
 *      REFERENCE 가 곧 고칠 그림이라, 「배경을 밤으로」가 낮인 원본에 졌다.
 *   ③ 고칠 그림을 `POSTER REFERENCE` 로 부르며 「느낌만 따라 하고 사람·제품은
 *      복사하지 마라」를 보냈다. 고치라는 것이 아니라 비슷한 새 그림을 그리라는
 *      말이다.
 *
 * 그리고 원래 장면 설명(「햇살이 드는 창가」)이 그대로 남아 「밤으로」와 한
 * 프롬프트에 같이 갔다. 구체적인 문장 여럿은 우선순위 한 줄로 못 이긴다 —
 * 이 저장소가 두 번 확인했다(`prompt.ts` 의 2026-09-08 · 2026-09-17).
 *
 * ── 그래서 이렇게 한다 ──────────────────────────────────────────
 *
 * - 사람이 적은 말이 맨 앞과 맨 뒤, 우선순위 첫 자리다. 카드뉴스의 「이 장만
 *   고치기」가 이미 이렇게 한다(`lib/sns/queued-flow.ts` 의 `note`).
 * - 고칠 그림은 언제나 `Image 1` 이고, **고칠 대상**으로 부른다.
 * - 원래 장면·결·첨부 지시는 **다시 보내지 않는다.** 고칠 그림에 이미 그려져
 *   있고, 다시 보내면 지시와 부딪힌다.
 * - 대신 원래 작업이 정한 것 중 **그림만 봐서는 못 지키는 것**은 넘긴다 —
 *   글자를 넣을지(철자까지), 지킬 제품·인물의 원본 사진, 금지 목록.
 * - 원본 사진은 **알아보게 하는 데만** 쓴다. 고칠 그림이 일부러 바꾼 것(머리색·
 *   옷·색·그림 느낌)은 고칠 그림을 따른다 — 사진이 이기면 앞서 고친 것이 다음
 *   고치기에서 되돌아간다(2026-09-29 독립 리뷰).
 */

export interface PosterEditPromptInput {
  /** 사람이 「이 장만 고치기」에 적은 말. 가장 세다. */
  instruction: string;
  /**
   * 원래 작업의 **지킬 대상**. `Image 2` 부터 붙는다 — 고칠 그림이 `Image 1` 이다.
   *
   * 따라 만들 그림(`style_reference`)은 여기 오기 전에 걸러진다(`generate.ts`).
   */
  images: PosterPromptImage[];
  slots: PosterSlots;
  size?: { width: number; height: number };
  invented?: string[];
  referenceHasText?: boolean;
}

/** 고칠 그림의 번호. 프롬프트와 `image_urls` 가 이 약속을 같이 지킨다. */
const EDIT_SOURCE_NUMBER = 1;

function editSourceLines(): string[] {
  return [
    `Image ${EDIT_SOURCE_NUMBER} is the IMAGE TO EDIT — the poster the user picked. It is the base of the`
    + " result, not a style reference.",
    `Keep everything in Image ${EDIT_SOURCE_NUMBER} exactly as it is — composition and framing, every person,`
    + " product and object, all text, colours, lighting and rendering style — and change only what the"
    + " USER INSTRUCTION asks for.",
    // 모델이 거의 같은 그림을 돌려주는 일이 있다. 「그대로 둬라」만 있으면 그쪽으로 기운다.
    "Make the requested change fully and visibly. A result that looks the same as"
    + ` Image ${EDIT_SOURCE_NUMBER} has failed.`,
    // 「빛까지 그대로」만 있으면 「배경을 밤으로」에 사람만 낮 조명인 합성처럼 나온다.
    "Where the change affects its surroundings, adjust lighting, shadows and reflections only as much as"
    + " the change needs so the result looks natural.",
    "Do not redraw it from scratch, re-compose it, or 'improve' anything the instruction did not mention.",
  ];
}

/**
 * 원래 작업의 지킬 대상 — 원본 사진을 다시 붙이되 **알아보게 하는 데만** 쓴다.
 *
 * 고칠 그림에도 제품·인물이 있지만 **이미 한 번 그려진 것**이다. 고칠 때마다 그것만
 * 보고 다시 그리면 얼굴·로고가 조금씩 무너진다(2026-09-04 「약간 변형되어」 보고).
 *
 * **처음 만들기의 지키는 말(`preserveDirective`)은 쓰지 않는다.** 그 말은 「머리색·
 * 색까지 사진과 같게」라서, 1차에 「머리를 금발로」 고친 것을 2차 「배경을 밤으로」
 * 에서 갈색 사진이 되돌린다(2026-09-29 독립 리뷰). 그래서 얼굴 구조·제품 모양·
 * 로고·라벨처럼 **알아보는 데 필요한 것만** 사진에서 가져오고, 나머지는 고칠
 * 그림을 따른다. 그림 느낌만 바꾼 사람도 같다 — 그 느낌은 고칠 그림에 있다.
 *
 * 고칠 그림에 없는 사람을 데려오지 않는다. 처음 만들기는 지킬 인물이 둘이면 첫
 * 사람만 그린다 — 두 번째 사진이 「Image 1 에 있는 사람」으로 불리면 끼어든다.
 */
function identityReferenceLines(images: PosterPromptImage[]): string[] {
  const lines = images.flatMap((image, index) => {
    if (image.kind !== "preserved") return [];
    const number = EDIT_SOURCE_NUMBER + 1 + index;
    return image.subject === "person"
      ? [`Image ${number} is the original photo of a person who may appear in Image ${EDIT_SOURCE_NUMBER}.`
        + " Use it only to keep that person recognisable — facial structure, eye shape, nose, mouth, jawline"
        + " and skin tone."]
      : [`Image ${number} is the original photo of a product that may appear in Image ${EDIT_SOURCE_NUMBER}.`
        + " Use it only to keep that product recognisable — silhouette, proportions, logo, label text and"
        + " branding."];
  });
  if (!lines.length) return [];
  return [
    ...lines,
    `These original photos are identity references only. Anything Image ${EDIT_SOURCE_NUMBER} already changed`
    + " on purpose — hair colour, clothing, colours, rendering style, pose, position or size — stays as it is"
    + ` in Image ${EDIT_SOURCE_NUMBER}.`,
    `Do not add a person or product from these photos that is not already in Image ${EDIT_SOURCE_NUMBER},`
    + " and do not blend faces.",
  ];
}

/**
 * 충돌할 때 무엇이 이기나.
 *
 * 공용 `priorityLine` 은 `REFERENCE`·`scene` 을 늘 끼워 넣는다. 고치기에는 둘 다
 * 없다 — 그 줄을 쓰면 ②가 되살아난다. 그래서 여기서 적는다.
 *
 * **원본 사진이 고칠 그림 뒤다.** 앞이면 앞서 고친 것이 되돌아간다(위 머리말).
 */
function editPriorityLine(hasIdentityReferences: boolean): string {
  const ranks = [
    "the USER INSTRUCTION",
    `Image ${EDIT_SOURCE_NUMBER} (the image being edited)`,
    hasIdentityReferences ? "the original photos (identity details only)" : "",
  ].filter(Boolean);
  return `Priority when instructions conflict: ${ranks.join(" > ")}.`;
}

/**
 * 그림에 넣기로 한 글자 칸 — 처음 만들 때(`prompt.ts` 의 `copyLines`)와 **같은 판단**.
 *
 * 글자 칸이 전부 AI 가 지어낸 것이고 붙인 그림에도 글자가 없으면, 처음 만들 때
 * 「글자를 넣지 말라」가 갔다. 고치기가 이 판단을 안 거쳐서 그런 그림을 고치면
 * 지어낸 헤드라인이 새로 박혔다(2026-09-29 재현).
 *
 * **`copyLines` 를 고쳐서 나눠 쓰지 않고 여기 따로 둔다.** 처음 만들기는 잘 돌고
 * 있고, 고치기 때문에 그 코드를 건드리지 않는다(2026-09-29 사용자 지시). 두 판단이
 * 갈리지 않는 것은 `edit-prompt.test.ts` 가 처음 만들기 프롬프트와 나란히 놓고 잰다.
 */
function authoredCopyEntries(
  slots: PosterSlots,
  invented: string[] = [],
  referenceHasText = false,
): Array<[string, string]> {
  const 사람이적은칸 = (["headline", "subline"] as const)
    .filter((field) => slots[field].trim().length > 0 && !invented.includes(field));
  const 곁텍스트도적었나 = slots.sideTexts.length > 0 && !invented.includes("sideTexts");
  const 글자를원한다 = 사람이적은칸.length > 0 || 곁텍스트도적었나 || referenceHasText;
  if (!글자를원한다) return [];
  const all: Array<[string, string]> = [
    ["HEADLINE", slots.headline],
    ["SUBLINE", slots.subline],
    ...slots.sideTexts.map((value, index): [string, string] => [`SIDE ${index + 1}`, value]),
  ];
  return all.filter(([, value]) => value.trim().length > 0);
}

/**
 * 글자는 **고칠 그림에 있는 그대로** 둔다. 지시가 바꾸라고 하면 바꾼다.
 *
 * 처음 만들기의 「글자를 넣지 말라」 일곱 줄은 보내지 않는다. 그 말이 가면 「헤드라인을
 * 넣어 주세요」라는 지시가 여섯 문장에 진다. 대신 「시키지 않은 글자는 넣지 말라」
 * 한 줄로 같은 것을 막는다.
 *
 * 적어 둔 글자는 **철자 그대로** 한 번 더 적는다. 고치기도 그림 전체를 다시
 * 그리므로 한글이 뭉개질 수 있다. 무엇을 넣을지는 처음 만들 때와 같은 판단을
 * 쓴다(`authoredCopyEntries`) — 그래야 AI 가 지어낸 헤드라인이 새로 안 박힌다.
 */
function editCopyLines(slots: PosterSlots, invented: string[] = [], referenceHasText = false): string[] {
  const entries = authoredCopyEntries(slots, invented, referenceHasText);
  return [
    `Keep every piece of text in Image ${EDIT_SOURCE_NUMBER} exactly as it is — same wording, spelling,`
    + " spacing and placement — unless the USER INSTRUCTION changes it.",
    "Do not add any text the USER INSTRUCTION did not ask for.",
    ...(entries.length
      ? [
        "Where this authored copy appears, it must read exactly like this (unless the USER INSTRUCTION changes it):",
        ...entries.map(([label, value]) => `  ${label}: ${value}`),
        // 「고칠 그림 그대로」와 「적어 둔 철자대로」가 갈리면 어느 쪽인지 밝힌다 —
        // 고칠 그림에서 한글이 뭉개졌다면 그것을 지키면 안 된다(2026-09-29 리뷰).
        `If Image ${EDIT_SOURCE_NUMBER} shows this copy with different spelling, use the spelling above.`,
      ]
      : []),
  ];
}

export function buildPosterEditPrompt(input: PosterEditPromptInput): string {
  const forbidden = input.slots.forbidden.trim();
  const identity = identityReferenceLines(input.images);
  const head = userInstructionHead(input.instruction);
  const tail = userInstructionTail(input.instruction);
  return [
    // 사람이 친 말이 맨 앞이다. 아래를 다 읽기 전에 무엇이 가장 센지 안다.
    head,
    "",
    designerPersona(),
    "",
    ...editSourceLines(),
    ...identity,
    editPriorityLine(identity.length > 0),
    "",
    ...editCopyLines(input.slots, input.invented, input.referenceHasText),
    "",
    ...(forbidden ? [`Do not include: ${forbidden}.`] : []),
    // 맨 뒤에서 한 번 더 못 박는다.
    tail,
    input.size
      ? `Output size ${input.size.width}x${input.size.height}. No outer border, no page frame, no UI chrome.`
      : "No outer border, no page frame, no UI chrome.",
  ].filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim();
}
