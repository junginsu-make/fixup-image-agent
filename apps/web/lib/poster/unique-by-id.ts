/**
 * 같은 id 는 처음 것 하나만 남긴다. 차례는 그대로 두고, 받은 배열은 바꾸지 않는다.
 *
 * 포스터 기획이 `referenceIds` 와 `preservedIds` 를 합쳐 읽는데, 같은 그림이 두 목록에
 * 다 있으면 비전 모델을 두 번 불렀다(설계 2026-09-30 §2).
 */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
