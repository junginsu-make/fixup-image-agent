/**
 * 큰 보기에서 다음·이전 자리를 센다.
 *
 * 계산 자체는 한 줄이다. **떼어 낸 이유는 부른 자리 때문이다.**
 * 2026-09-11 운영에서 두 장짜리 캐릭터가 「1 / 2」로 열리는데 화살표를 눌러도
 * 안 넘어갔다. `move` 가 `setRequest` 갱신자 **안에서** `setIndex` 를 불렀는데,
 * 갱신자는 순수해야 하고 React 는 개발 모드에서 그것을 두 번 부른다. 그래서
 * 한 번 눌러도 두 칸이 넘어갔고, 두 장뿐이면 제자리라 아무 일도 안 일어난
 * 것처럼 보였다.
 *
 * 여기 두면 값으로 잴 수 있다 — 두 칸씩 넘어가는 변이가 시험에 걸린다.
 */
export function stepIndex(at: number, step: number, total: number): number {
  // 한 장뿐이거나 없으면 갈 곳이 없다. 나머지 연산을 그대로 두면 0 으로 나눈다.
  if (total < 2) return at;
  return (at + step + total) % total;
}
