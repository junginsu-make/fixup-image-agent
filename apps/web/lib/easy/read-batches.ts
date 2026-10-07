/**
 * **한꺼번에 읽는 수를 묶는다**(2026-10-07 2차 최종 수정 10, 보안 리뷰).
 *
 * 포스터 · 카드뉴스 작업 저장소에는 여러 id 를 한 번에 읽는 길이 없어 하나씩 읽는다. 결과물이 많은 대화에서
 * 한 턴에 수십 개를 동시에 부르지 않게 `size` 개씩 차례로 부른다. 결과는 `items` 차례다.
 */
export const READ_BATCH = 10;

export async function readInBatches<T, R>(
  items: readonly T[],
  size: number,
  read: (item: T) => Promise<R>,
): Promise<R[]> {
  const 묶음들 = Array.from({ length: Math.ceil(items.length / size) }, (_, at) => items.slice(at * size, (at + 1) * size));
  return 묶음들.reduce<Promise<R[]>>(
    async (앞, 묶음) => [...(await 앞), ...(await Promise.all(묶음.map(read)))],
    Promise.resolve([]),
  );
}
