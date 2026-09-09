/**
 * 결과판의 판단들.
 *
 * 화면 파일은 시험이 못 읽는다(jsdom 없음). 판단만 떼어 값으로 잠근다.
 */

/** 그림이 아직 없는 칸에 무엇을 보여 줄까. */
export interface CardPlaceholder {
  label: string;
  /** 돌아가는 표시를 붙일까. **기다리는 중에는 안 붙인다** — 다 돌면 8칸이 동시에 돌아 눈이 어지럽다. */
  spinning: boolean;
}

/**
 * **「이미지가 없습니다」는 사실이지만 쓸모가 없다.**
 *
 * 사용자 요청(2026-09-09): 만드는 중이라는 것을 카드 한가운데서 알아볼 수
 * 있어야 한다. 지금은 오른쪽 위 작은 배지뿐이라, 카드가 큰 화면에서는 그
 * 배지가 눈에 안 들어온다.
 */
export function cardPlaceholder(status: string): CardPlaceholder {
  if (status === "generating") return { label: "만드는 중입니다", spinning: true };
  if (status === "pending") return { label: "차례를 기다리는 중입니다", spinning: false };
  if (status === "failed") return { label: "만들지 못했습니다", spinning: false };
  return { label: "이미지가 없습니다.", spinning: false };
}

/** 낱장을 다시 만들 때 사람이 적는 지시의 길이 상한. */
export const CARD_NOTE_MAX = 500;

/**
 * 다시 만들 때 함께 보낼 지시를 다듬는다.
 *
 * **빈 값은 없는 것으로 본다.** 공백만 적고 누르면 지시 없이 같은 것을 또
 * 만들게 되는데, 그것은 사용자가 기대한 일이 아니다.
 */
export function trimCardNote(raw: string | undefined | null): string | undefined {
  const note = (raw ?? "").trim();
  if (!note) return undefined;
  return note.slice(0, CARD_NOTE_MAX);
}
