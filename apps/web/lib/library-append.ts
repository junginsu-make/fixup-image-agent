/**
 * 같은 작업(`sourceId`)에 장을 **어디에** 붙일지 정한다.
 *
 * 화면이 「이 묶음은 몇 번째 장부터다」(`startPosition`)를 알려 주면, 서버는
 * 이미 있는 장수와 대조해 같은 장을 두 번 붙이지 않는다. 화면의 기억은 초안을
 * 다시 열거나 연결이 끊기면 사라지므로, 기준은 서버에 있어야 한다.
 *
 * 자리를 안 알려 주면 지금까지처럼 뒤에 붙인다 — 리디자인이 섹션을 한 장씩
 * 그렇게 보낸다.
 */
export type AppendDecision =
  | { kind: "create" }
  | { kind: "append"; startPosition: number }
  | { kind: "already"; imageCount: number }
  | { kind: "conflict"; imageCount: number };

export function appendDecision(input: {
  /** 같은 작업이 이미 있으면 그 장수, 없으면 `null`. */
  existingCount: number | null;
  startPosition?: number;
  count: number;
}): AppendDecision {
  const { existingCount, startPosition, count } = input;

  if (startPosition === undefined) {
    return existingCount === null ? { kind: "create" } : { kind: "append", startPosition: existingCount };
  }

  const have = existingCount ?? 0;
  if (existingCount !== null && have >= startPosition + count) return { kind: "already", imageCount: have };
  if (have !== startPosition) return { kind: "conflict", imageCount: have };
  return existingCount === null ? { kind: "create" } : { kind: "append", startPosition };
}
