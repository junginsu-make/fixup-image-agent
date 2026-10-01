import type { EasyMessage } from "./turn";

/** 지운 작업의 줄에 대신 보일 말. */
export const DELETED_WORK = "이 작업은 지워졌습니다. 라이브러리나 카드뉴스 목록에서 지운 것입니다.";

/**
 * **지운 작업의 줄을 안내 줄로**(미뤄 둔 것 2).
 *
 * 그림 줄은 작업 id 만 갖고 있다(설계 §4-1). 작업을 지우면 그 줄은 그림도 원고도 못 찾아
 * 「만드는 중」으로 영영 돌았고, 결과 칸도 계속 만드는 중이었다. 다시 열 때 포스터에도
 * 카드뉴스에도 없는 작업의 줄은 「저쪽이 한 말」 한 줄로 바꾼다. 표는 그대로 둔다.
 */
export function markDeletedWork(messages: readonly EasyMessage[], known: ReadonlySet<string>): EasyMessage[] {
  return messages.map((message) =>
    message.role === "image" && message.workId && !known.has(message.workId)
      ? { id: message.id, role: "assistant", body: DELETED_WORK }
      : message);
}
