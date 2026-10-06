import type { EasyMessage } from "./turn";
import { isFailureRowBody } from "../../lib/easy/failure-row";

/**
 * **「광고 소재」라는 말이 나오면 먼저 묻는다**(2026-10-06 설계 A5, 사용자 결정 두 번).
 *
 * 「광고 소재」는 두 뜻이다 — 광고에 쓸 이미지 한 장을 만들어 달라는 것과, 만든 이미지를
 * 포털 규격별로 여러 장 뽑아 달라는 것. 뒤의 것은 「쉽게」가 아니라 「광고소재」(`/ad`)가
 * 한다. 그래서 낱말이 나오면 **코드가** 묻는다 — 모델에 맡기면 규칙이 매번 지켜지지 않는다.
 *
 * 규격 낱말이 같이 있으면 묻지 않는다(사용자: 「이런 정확한 키워드를 말할 경우에는 굳이
 * 안 물어도 됩니다」). 「광고 소재 말고 ○○」처럼 부정하면 코드는 끼어들지 않는다.
 *
 * **물음 줄 · 안내 줄은 대화에 남는다.** 물음 줄은 글이 `AD_QUESTION` 과 똑같은 도우미 줄,
 * 안내 줄은 글이 `ad-guide:` 로 시작하는 도우미 줄이다. 표에 칸을 더하지 않는다 —
 * `row-image.ts` 의 `edit-request:` 와 같은 방식이다.
 */

/** 묻는 말. 사용자가 정한 문장 그대로다. */
export const AD_QUESTION =
  "광고 이미지를 만들고 싶으세요, 아니면 네이버·구글·카카오 규격별로 이미지를 베리에이션하고 싶으세요?";
/** 물음 줄의 두 단추. 누르면 이 글이 사용자 말로 간다. */
export const AD_CHOICE_IMAGE = "광고 이미지 만들기";
export const AD_CHOICE_SPECS = "규격별로 베리에이션";
/** 「광고소재」 화면. */
export const AD_HREF = "/ad";
/**
 * 판단 모델이 「이번 말은 광고 물음의 답이다」라고 표시하는 값. 이미 꼭 받는 `note` 칸에
 * 적는다(이미지 길은 `note` 를 안 쓴다). 틀에 칸을 더하지 않는다 — 최종 리뷰 2026-10-06.
 */
export const AD_ANSWER_NOTE = "answer";

const 광고낱말 = /광고\s*소재/;
const 규격낱말 = ["규격별", "사이즈별", "리사이징", "리사이즈", "베리에이션", "네이버", "구글", "카카오"];
const 부정 = /광고\s*소재\s*(?:은|는|이|가|을|를|도)?\s*(?:말고|빼고|없이|아니)/;
const 안내머리 = "ad-guide:";

type Row = Pick<EasyMessage, "role" | "body">;

/** 코드가 정한 광고 갈래. `ask` 는 묻기, `specs` 는 규격 안내, `image` 는 광고 이미지 만들기. */
export type EasyAdStep = "ask" | "specs" | "image";

export function isAdQuestion(message: Row): boolean {
  return message.role === "assistant" && message.body === AD_QUESTION;
}

/** 「광고 소재 말고 ○○」처럼 그 낱말을 부정했나. */
export function hasAdNegation(prompt: string): boolean {
  return 부정.test(prompt);
}

/**
 * 광고 물음이 있어야 할 자리. 보통은 마지막 줄이다.
 *
 * **단추로 답했다가 실패한 턴**(사용자 단추 글 줄 + 실패 안내 줄, 설계 B4)이 뒤에 붙었으면 그
 * 둘을 건너뛴다 — 다시 답해도 앞 물음의 답으로 읽고 처음 말도 잇는다. 말로 한 답이 실패한
 * 것은 건너뛰지 않는다(그 말이 답이었는지 코드는 모른다).
 */
function 물음자리(rows: readonly Row[]): number {
  const n = rows.length;
  const 답 = rows[n - 2];
  const 실패 = rows[n - 1];
  const 단추답실패 = n >= 3 && 실패?.role === "assistant" && isFailureRowBody(실패.body)
    && 답?.role === "user" && (답.body === AD_CHOICE_IMAGE || 답.body === AD_CHOICE_SPECS);
  return 단추답실패 ? n - 3 : n - 1;
}

/**
 * 광고 물음 바로 뒤면 **그 물음을 부른 사용자 말**. 물음 앞에 사용자 말이 없으면
 * 빈 글, 물음 뒤가 아니면 `undefined`.
 */
export function adQuestionOrigin(rows: readonly Row[]): string | undefined {
  const at = 물음자리(rows);
  const question = rows[at];
  if (!question || !isAdQuestion(question)) return undefined;
  const before = rows[at - 1];
  return before?.role === "user" ? before.body : "";
}

/** 규격 낱말이 있나. */
function 규격을말했나(prompt: string): boolean {
  return 규격낱말.some((word) => prompt.includes(word));
}

/**
 * 이번 말에서 코드가 정하는 광고 갈래. 정할 것이 없으면 `undefined` — 판단 모델이 가른다.
 *
 * **물음 바로 뒤에는 다시 묻지 않는다**(최종 리뷰 2026-10-06). 단추 글이면 그 갈래, 규격
 * 낱말이 있으면(「사이즈별로요」) 규격 안내, 아니면 판단 모델이 앞의 물음을 보고 가른다
 * (`chat-facts.ts` 의 물음 뒤 안내). 답에 「광고 소재」가 또 들어 있어도(「광고 소재로 쓸
 * 이미지요」) 같은 물음을 또 띄우지 않는다 — 그러면 대화가 거기서 맴돈다.
 */
export function easyAdStep(prompt: string, rows: readonly Row[]): EasyAdStep | undefined {
  if (adQuestionOrigin(rows) !== undefined) {
    if (prompt === AD_CHOICE_IMAGE) return "image";
    if (prompt === AD_CHOICE_SPECS) return "specs";
    return !hasAdNegation(prompt) && 규격을말했나(prompt) ? "specs" : undefined;
  }
  if (!광고낱말.test(prompt) || hasAdNegation(prompt)) return undefined;
  return 규격을말했나(prompt) ? "specs" : "ask";
}

/**
 * 광고 물음에 답해 만드는 이미지의 지시 — **물음 앞의 말 + 답.** 단추만 눌렀으면 물음 앞의
 * 말 그대로다. 「광고 이미지로요」 한마디로 그리면 처음 말의 내용이 사라진다.
 *
 * **답일 때만 잇는다**(`answered`, 최종 리뷰 2026-10-06). 라우트가 정한다 — 「광고 이미지
 * 만들기」 단추를 눌렀거나 판단 모델이 `note` 에 `AD_ANSWER_NOTE` 를 적었을 때다. 물음에
 * 답하지 않고 「그건 됐고 고양이 포스터 만들어줘」라고 했는데 처음 말을 붙이면 엉뚱한 것을 그린다.
 * 답이 아니거나, 물음 뒤가 아니거나, 물음 앞의 말이 없으면 `undefined` — 이번 말 그대로 쓴다.
 */
export function adImageInstruction(rows: readonly Row[], prompt: string, answered: boolean): string | undefined {
  if (!answered) return undefined;
  const origin = adQuestionOrigin(rows);
  if (!origin) return undefined;
  return prompt === AD_CHOICE_IMAGE ? origin : `${origin}\n${prompt}`;
}

/** 안내 줄에 남길 글. 화면이 이 표시를 보고 「광고소재 열기」를 단다. */
export function adGuideBody(text: string): string {
  return `${안내머리}${text}`;
}

export function isAdGuide(message: Row): boolean {
  return message.role === "assistant" && message.body.startsWith(안내머리);
}

/** 보일 글(화면 · 모델 모두). 안내 줄이면 표시를 뗀다. */
export function visibleBody(message: Row): string {
  return isAdGuide(message) ? message.body.slice(안내머리.length) : message.body;
}
