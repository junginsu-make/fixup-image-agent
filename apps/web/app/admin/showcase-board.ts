import type { ShowcaseAdminView } from "../api/showcase/core";

/**
 * 첫 화면 갤러리 판의 규칙 — 값만 다루는 부분.
 *
 * 끌어 옮기는 동작은 화면에서 일어나지만 **어디로 가는가는 계산**이다. 이
 * 저장소에는 jsdom 이 없어 끌어 보는 시험은 못 쓰므로, 그 계산만 떼어 둔다.
 */

/**
 * `from` 번째를 `to` 자리로 옮긴 새 목록.
 *
 * **원본을 건드리지 않는다.** `splice` 로 제자리에서 옮기면 되돌리기가
 * 어려워지고, 요청이 실패했을 때 되돌릴 원본이 없다.
 *
 * 범위를 벗어난 값은 그대로 돌려준다 — 끌다가 판 밖에서 놓으면 그렇게 된다.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...items];
  if (from < 0 || from >= items.length) return [...items];
  if (to < 0 || to >= items.length) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** 서버에 보낼 차례. 화면이 들고 있는 순서 그대로다. */
export function orderOf(items: readonly ShowcaseAdminView[]): string[] {
  return items.map((item) => item.id);
}

/**
 * 차례가 실제로 바뀌었나.
 *
 * 끌었다가 제자리에 놓는 일이 잦다. 안 바뀌었으면 서버를 부르지 않는다.
 */
export function orderChanged(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((id, index) => id !== after[index]);
}

/**
 * 키보드로 옮길 자리.
 *
 * **끌기만 두면 키보드로는 못 옮긴다.** 마우스를 못 쓰는 사람에게 이 화면은
 * 읽기 전용이 된다. 칸에 초점을 두고 방향키를 누르면 같은 일이 일어난다.
 *
 * 끝에 닿으면 그대로 둔다 — 반대쪽으로 감기면 어디로 갔는지 알 수 없다.
 */
export function keyboardTarget(index: number, key: string, total: number): number {
  const delta = key === "ArrowLeft" || key === "ArrowUp"
    ? -1
    : key === "ArrowRight" || key === "ArrowDown"
      ? 1
      : 0;
  if (!delta) return index;
  return Math.min(total - 1, Math.max(0, index + delta));
}
