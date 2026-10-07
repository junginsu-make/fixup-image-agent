import { answerableAskId } from "./ask-chain";
import { plainTyped, readPick, withPick } from "./row-marks";
import type { EasyMessage } from "./turn";

/**
 * **보낸 턴이 실패했을 때 화면에 남길 줄**(2차 Task 5 리뷰).
 *
 * 서버가 받은 뒤(그림 줄을 남기고 `projectId` 를 준 뒤 — 값이 잡혔다) 받기만 실패하면 그림 자리를
 * **남긴다**. 서버 꼬리가 [물음, 답, 그림 줄] 이니 화면도 같아야 한다. 빼면 화면 꼬리가 [물음, 단추 답]
 * 이 되어 물음 단추가 다시 뜨고(`answerableAskId`), 다시 누르면 새 말로 가서 값이 또 나갈 수 있다.
 *
 * 받기 전의 실패(요청 오류 · 거절)는 지금처럼 뺀다 — 서버가 실패 줄을 남겨 그 물음에 다시 답할 수 있다.
 */
export function keptAfterFailure(messages: readonly EasyMessage[], rowId: string, accepted: boolean): EasyMessage[] {
  return accepted ? [...messages] : messages.filter((one) => one.id !== rowId);
}

/** 남긴 그림 자리에 못 받은 까닭을 적는다(다시 열 때의 `useEasyResume` 실패 표시와 같다). */
export function lostAfterFailure(
  lost: Readonly<Record<string, string>>,
  rowId: string,
  accepted: boolean,
  reason: string,
): Record<string, string> {
  return accepted ? { ...lost, [rowId]: reason } : { ...lost };
}

/**
 * **서버가 말 답으로 읽고 실패했으면 화면 줄에도 그 표시를 단다**(후속 Task 9). 서버는 물음의 답으로 읽은 말을
 * `typed` 표시로 남긴 뒤 실패하면 응답에 `typedAnswer` 를 싣는다. 새로고침 뒤에는 [물음, 말 답, (머리말), 실패] 로
 * 물음 단추가 다시 뜨는데, 화면 줄은 표시 없는 말이라 그 자리에서는 안 떴다. 서버가 남긴 글과 같게 바꾼다
 * (`closedAnswerRows` 의 반대). 이미 고른 값 표시가 있는 단추 답 줄은 그대로 둔다.
 */
export function typedAfterFailure(messages: readonly EasyMessage[], rowId: string, prompt: string): EasyMessage[] {
  return messages.map((one) => (one.id === rowId && !readPick(one)
    ? { ...one, body: withPick(plainTyped(prompt), { typed: true }) }
    : one));
}

/**
 * **사용자 줄을 남기기 전에 실패했으면, 앞이 답할 물음일 때만 화면 줄도 뺀다**(후속 Task 9 고침 1 · 2). 서버에는 그 줄이 없어
 * (`userUnsaved`) 새로고침하면 앞 꼬리 그대로 물음 단추가 다시 뜬다. 친 말은 입력창에 되돌아가 있다. 앞이 물음이 아니면 예전처럼
 * 남긴다(물음 밖 화면 동작은 그대로). 고른 값 표시가 있는 단추 답 줄도 그대로다.
 */
export function unsavedAfterFailure(messages: readonly EasyMessage[], rowId: string): EasyMessage[] {
  const 줄 = messages.find((one) => one.id === rowId);
  if (!줄 || readPick(줄) !== undefined) return [...messages];
  const 뺀것 = messages.filter((one) => one.id !== rowId);
  return answerableAskId(뺀것) === undefined ? [...messages] : 뺀것;
}
