/**
 * **물음 · 머리말 문장**(2026-10-07 2차 설계 §3-4).
 *
 * AI 가 판단과 같은 호출로 쓴 글(`reply`)을 먼저 쓴다. 비었거나 모양이 안 맞으면 여기 고정
 * 문장으로 대신한다. 다시 묻지 않는다(값이 두 번 나간다).
 */

/** 한 장인가 여러 장인가(2단계 §4). 화면의 옛 문장 그대로다. */
export const KIND_QUESTION = "이미지 한 장으로 만들까요, 여러 장짜리 카드뉴스로 만들까요?";

/** 모양(비율 · 그림체). 묻되 막지 않는다. 「이대로 만들기」가 늘 열려 있다(2026-09-21). */
export const RATIO_QUESTION = "어떤 모양으로 만들까요? 안 고르셔도 됩니다. 그때는 정사각형에, 적어 주신 말에 맞춰 만듭니다.";

/** 어느 이미지를 고칠지(2차 D2). AI 가 물음으로 쓴 글이 먼저다. */
export const TARGET_QUESTION = "어느 이미지를 고칠까요? 아래에서 고르시거나 「이미지 2」처럼 말씀해 주세요.";

/** 사진 물음. 다른 판단(사진 역할) 뒤에 정해져 AI 가 같은 호출로 못 쓴다. 고정이다(2차 §4). */
export function photoQuestion(reason: "unclear" | "people"): string {
  return reason === "people"
    ? "인물을 그대로 지킬 사진은 한 장만 됩니다. 두 사람의 얼굴이 섞이기 때문이에요. 한 장만 「인물 그대로」로 골라 주세요."
    : "사진을 어떻게 쓸지 알려 주세요.";
}

const 물음표 = /[?？]/;

/**
 * 물음 줄 문장. AI 가 **물음으로** 쓴 글일 때만 그것, 아니면 고정 문장. 「?」가 **어디든** 있으면 물음이다
 * (2차 최종 리뷰 3). 프롬프트가 「묻고, 안 골라도 정사각형이라고 덧붙이라」고 시켜 물음 뒤에 설명이 온다.
 */
export function askText(reply: string | undefined, fallback: string): string {
  const text = reply?.trim() ?? "";
  return text && 물음표.test(text) ? text : fallback;
}

/**
 * **판단 모델이 지금 실행하는 갈래로 쓴 reply 만**(2차 최종 리뷰 b). 코드가 갈래를 바꿔 읽으면(고른 갈래가
 * 이김 · 갈래 물음 뒤 either→image 등) 그 reply 는 다른 일로 쓴 글이라 `undefined`. 고정 문장이 나간다.
 * 라우트는 `aiText(decision, wants)` 로 부른다(`wants` 가 실행하는 갈래다).
 */
export function aiText(decision: { wants: string; reply: string }, executed: string): string | undefined {
  return decision.wants === executed ? decision.reply : undefined;
}

/** 일하는 턴의 머리말 — AI 말이 비었거나 다른 갈래로 쓴 글이면 대신 쓴다(2차 D4 · 최종 리뷰 b). */
export const SAY_IMAGE = "말씀하신 내용으로 이미지 한 장을 만들겠습니다. 다 되면 이 자리에 보여 드릴게요.";
export const SAY_CARDNEWS = "카드뉴스 원고를 쓰겠습니다. 1~2분쯤 걸립니다.";
export const SAY_REVISE = "말씀하신 대로 카드뉴스 원고를 다시 쓰겠습니다. 1~2분쯤 걸립니다.";

export function sayEditText(n?: number): string {
  return n ? `이미지 ${n}번을 말씀대로 고치겠습니다.` : "방금 이미지를 말씀대로 고치겠습니다.";
}

/**
 * 머리말 · 안내 · 끝 문장. AI 가 쓴 글이 **비지 않았으면** 그것, 아니면 코드 문장(2차 최종 리뷰 3). 프롬프트가
 * 「다음에 할 수 있는 것도 덧붙이라」고 시켜 끝에 물음이 올 수 있다 — 그래도 받는다. 다른 갈래로 쓴 글은
 * 부르는 쪽이 `aiText(decision, wants)` 로 먼저 거른다(최종 리뷰 b).
 */
export function sayText(reply: string | undefined, fallback: string): string {
  return reply?.trim() || fallback;
}
