/**
 * 캐릭터에서 **어느 장을 붙일지.**
 *
 * 캐릭터 하나는 정면·측면·뒷모습이 한 벌이다. 지금까지는 정면 한 장만 붙었고,
 * 다른 각도가 필요하면 라이브러리 낱장에서 이름으로 찾아야 했다 — 각도를 쓰려고
 * 만들어 둔 것을 쓸 수 없었다(2026-09-15 사용자 보고).
 *
 * 반대로 무조건 다 붙이는 것도 안 된다. 붙이는 장에 따라 결과가 달라지므로
 * 고르는 것은 사람이 한다.
 *
 * **화면 밖에서 정한다.** 모달 안에 두면 「정면이 기본으로 켜지는가」·「하나도
 * 안 고르면 어떻게 되는가」를 값으로 못 잰다.
 */

import { CHARACTER_SHEET } from "@fixup/pdp-core";

export interface PickableView {
  angle: string;
  url: string | null;
}

/**
 * **「다각도 한 장」은 각도가 아니다.**
 *
 * 여섯 각도를 3×2 격자로 담은 한 장이다. 정체성 참조로 보내면 그 격자가
 * 결과물에 그대로 따라 나온다 — `pdp.character.ts` 의 `CHARACTER_SHEET` 머리말이
 * 같은 이유로 이것을 `CHARACTER_ANGLES` 에서 뺐다.
 *
 * 그런데 저장은 되므로 `/api/characters` 의 `views` 에는 섞여 온다. 각도를
 * 고르는 자리가 여기 하나뿐이니 여기서 건다.
 */
function isAngle(view: PickableView): boolean {
  return view.angle !== CHARACTER_SHEET.id;
}

/** 대표로 세울 장. 정면이 있으면 정면, 없으면 그림이 있는 첫 장. */
export function frontView<T extends PickableView>(views: T[]): T | undefined {
  const shown = views.filter((view) => view.url && isAngle(view));
  return shown.find((view) => view.angle === "front") ?? shown[0];
}

/** 그림이 실제로 있는 장만. 아직 안 만든 각도는 고를 수 없다. */
export function pickableViews<T extends PickableView>(views: T[]): T[] {
  return views.filter((view) => view.url && isAngle(view));
}

/**
 * 처음 열었을 때 켜져 있는 장 — **정면 하나.**
 *
 * 한 번도 안 펼치고 넘어가도 지금까지와 같게 동작해야 한다. 전부 켜 두면
 * 모르고 넉 장을 보내게 되고, 다 꺼 두면 아무것도 안 붙는다.
 */
export function defaultPicked(views: PickableView[]): string[] {
  const front = frontView(views);
  return front ? [front.angle] : [];
}

/**
 * 눌러서 켜고 끈다. 차례는 **원래 차례**를 지킨다 — 누른 차례가 아니다.
 *
 * 차례가 사람마다 다르면 같은 선택에 다른 그림이 나온다. 캐릭터의 각도와
 * 묶음 세트의 장이 같은 규칙을 쓰므로 여기 한 자리에 둔다.
 */
export function toggleInOrder(picked: string[], id: string, allIds: string[]): string[] {
  const next = new Set(picked);
  if (next.has(id)) next.delete(id);
  else next.add(id);

  return allIds.filter((candidate) => next.has(candidate));
}

/** 각도 켜고 끄기. 고를 수 있는 각도 차례를 지킨다. */
export function toggleAngle(picked: string[], angle: string, views: PickableView[]): string[] {
  return toggleInOrder(picked, angle, pickableViews(views).map((view) => view.angle));
}

/**
 * 붙일 수 있는 상태인가.
 *
 * 하나도 안 고르면 붙일 것이 없다. 버튼을 눌러 놓고 아무 일도 안 일어나는 것이
 * 가장 나쁘므로, 버튼을 막고 왜 막혔는지 그 자리에 적는다.
 */
export function canAttach(picked: string[]): boolean {
  return picked.length > 0;
}

/**
 * 고른 장에 대한 한 줄.
 *
 * 「4장 중 2장」처럼 **분모를 함께** 적는다. 고른 수만 적으면 이 캐릭터에 장이
 * 더 있다는 것을 모른 채 넘어간다.
 */
export function pickSummary(picked: string[], views: PickableView[]): string {
  const total = pickableViews(views).length;
  if (!picked.length) return `${total}장 중 고른 것 없음`;
  return `${total}장 중 ${picked.length}장`;
}
