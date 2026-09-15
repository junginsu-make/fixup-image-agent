import { toggleInOrder } from "./character-pick";

/**
 * 묶음 세트에서 **어느 장을 붙일지.**
 *
 * 세트는 표지·속지·엔딩 **자리까지 함께** 들고 있다. 그래서 통째로 넣는 것이
 * 기본값이다 — 자리를 다시 정하지 않으려고 만들어 둔 것이기 때문이다.
 *
 * 그래도 빼는 길은 열어 둔다. 세트에 든 장 하나가 이번 작업에 안 맞는 일이
 * 있고, 그때 세트를 새로 만들게 하면 만든 뜻이 사라진다.
 *
 * **화면 밖에서 정한다.** 캐릭터와 같은 이유다 — 「처음에 다 켜져 있는가」를
 * 값으로 못 재면 아무도 안 본다.
 */

export interface SetItemLike {
  referenceImageId: string;
  role: "cover" | "body" | "ending";
}

/** 자리 이름. 세트를 펼쳤을 때 이 장이 어디에 들어가는지 알려 준다. */
export const SET_ROLE_LABEL: Record<SetItemLike["role"], string> = {
  cover: "표지",
  body: "속지",
  ending: "엔딩",
};

/**
 * 처음 펼쳤을 때 **전부 켜진다.**
 *
 * 캐릭터와 반대다. 캐릭터는 여러 장을 보내면 얼굴이 절충될 수 있어 정면만
 * 켜지만, 세트는 한 벌로 쓰라고 만들어 둔 것이라 통째로가 기본이다.
 */
export function defaultPickedSet(items: SetItemLike[]): string[] {
  return items.map((item) => item.referenceImageId);
}

export function toggleSetItem(picked: string[], id: string, items: SetItemLike[]): string[] {
  return toggleInOrder(picked, id, items.map((item) => item.referenceImageId));
}

export function canAttachSet(picked: string[]): boolean {
  return picked.length > 0;
}

/** 「4장 중 3장」. 고른 수만 적으면 뺀 장이 있다는 것을 모른 채 넘어간다. */
export function setPickSummary(picked: string[], items: SetItemLike[]): string {
  if (!picked.length) return `${items.length}장 중 고른 것 없음`;
  return `${items.length}장 중 ${picked.length}장`;
}

/**
 * 세트에 든 장을 **자리 차례로** 세운다 — 표지 · 속지 · 엔딩.
 *
 * 저장된 차례를 그대로 쓰면 엔딩이 맨 앞에 서기도 한다. 세트의 뜻이 자리인데
 * 자리가 안 보이는 차례로 늘어놓으면 무엇이 표지인지 눌러 봐야 안다.
 */
const ROLE_ORDER: Record<SetItemLike["role"], number> = { cover: 0, body: 1, ending: 2 };

export function orderedSetItems<T extends SetItemLike>(items: T[]): T[] {
  return [...items].sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role]);
}
