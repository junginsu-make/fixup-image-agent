/**
 * 목록을 **동시에 `limit` 개까지만** 돌리고, 결과는 넣은 순서대로 돌려준다.
 *
 * 하나가 실패하면 그 실패로 끝나고 새 일은 더 시작하지 않는다 — 차례로 돌 때
 * 실패한 뒤의 일을 부르지 않던 것과 같게(이미 돌고 있는 일은 끝까지 간다).
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Map<number, R>();
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const at = next;
      next += 1;
      try {
        results.set(at, await run(items[at]!));
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return items.map((_, at) => results.get(at)!);
}
