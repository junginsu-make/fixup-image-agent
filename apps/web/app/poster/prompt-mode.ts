/**
 * **완성된 프롬프트를 들고 왔는가.**
 *
 * 01 에 200줄짜리 JSON 프롬프트를 넣은 사용자가 그것을 통째로 잃었다 — 기획이
 * 슬롯 11칸으로 요약했고, 칸에 자리가 없는 것(조명·피부 질감·금지 목록)은 소리
 * 없이 버려졌다(2026-09-16 사용자 보고).
 *
 * **판별은 하되 결정은 안 한다.** 알아채면 묻기만 하고 고르는 것은 사람이 한다
 * (설계 §3.1). 우리가 대신 정하면 오판했을 때 되돌릴 길이 없다.
 *
 * **오탐보다 미탐이 낫다.** 못 알아채도 아래 「직접 쓴 프롬프트」 칸이 같은 일을
 * 해 준다. 반대로 짧은 메모마다 물으면 성가시기만 하고, 그러면 사용자는 알림을
 * 읽지 않고 닫는 버릇이 든다 — 정작 필요할 때도.
 */

export const PROMPT_MODES = ["verbatim", "assisted"] as const;
export type PromptMode = (typeof PROMPT_MODES)[number];

/**
 * 이 아래로는 안 묻는다.
 *
 * **한글 기준이다.** 글자당 정보가 영어보다 많아, 300자면 영어 600자 남짓에
 * 해당한다. 400 으로 뒀더니 여덟 줄짜리 상세 지시(줄마다 40자)가 안 걸렸다 —
 * 그건 분명 공들여 쓴 것이다.
 *
 * 더 낮추면 평범한 두세 줄 설명에도 알림이 뜬다.
 */
const LONG_ENOUGH = 300;

/** 여러 줄이어야 한다. 한 문단으로 길게 쓴 것은 그냥 설명이다. */
const ENOUGH_LINES = 5;

/** 줄이 이만큼은 돼야 「적어 내려간 것」이다. 짧은 줄 여럿은 메모다. */
const MEANINGFUL_LINE = 20;

/** 코드 울타리를 벗긴다. 붙여 넣을 때 딸려 오는 일이 흔하다. */
function unfenced(text: string): string {
  return text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
}

/**
 * 진짜 JSON 인가. **모양만 보고 판단하지 않는다** — `{배경은 밤}` 은 중괄호로
 * 시작하지만 JSON 이 아니다. 지어낸 판단으로 사람을 성가시게 하지 않는다.
 */
function isJson(text: string): boolean {
  if (!/^[{[]/.test(text)) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

export function looksFinished(text: string): boolean {
  const body = unfenced(text);
  if (!body) return false;
  if (isJson(body)) return true;

  /*
   * JSON 이 아니어도 **길고, 여러 줄이고, 줄마다 내용이 있으면** 공들여 쓴
   * 것이다. 셋을 다 봐야 한다 — 하나만 보면 긴 한 문단이나 단어 나열이 걸린다.
   */
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const meaningful = lines.filter((line) => line.length >= MEANINGFUL_LINE);

  return body.length >= LONG_ENOUGH && meaningful.length >= ENOUGH_LINES;
}
