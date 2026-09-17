import { pickableViews, type PickableView } from "./character-pick";

/**
 * 상세페이지·리디자인에서 **지금 캐릭터의 어느 장면이 쓰이는가.**
 *
 * 카드뉴스·포스터는 그림을 목록에 직접 붙인다 — 붙은 것이 눈에 보인다. 여기는
 * 다르다. 화면은 캐릭터 **이름표만** 넘기고, 그림은 서버가 생성 시점에 꺼낸다.
 * 그래서 화면이 말해 주지 않으면 사용자는 어느 장이 가는지 알 길이 없다 —
 * 넉 장을 만들어 두고도 정면만 가는 줄 몰랐다(2026-09-15 사용자 보고).
 *
 * **빈 배열이 「자동」이다.** 「안 골랐다」와 「섹션에 맡긴다」는 같은 뜻이다.
 * 따로 깃발을 두면 둘이 어긋나는 상태(`auto: true` 인데 각도가 차 있는)가 생기고,
 * 그때 무엇이 맞는지 아무도 모른다.
 *
 * **화면 밖에서 정한다.** 모달 안에 두면 「지금 자동인가」를 값으로 못 잰다.
 */

/** 고른 것이 없으면 자동이다 — 섹션 설명에 맞춰 서버가 한 장을 고른다. */
export function isAutoChoice(picked: string[]): boolean {
  return picked.length === 0;
}

/**
 * 고른 각도의 그림들. 자동이면 **고를 수 있는 전부**가 후보로 보인다.
 *
 * 자동일 때 아무것도 안 보여 주면 「캐릭터를 골랐는데 화면이 비었다」가 된다.
 * 어느 장이 갈지는 섹션이 정하므로, 있는 것을 다 보여 주는 편이 정직하다.
 *
 * 「다각도 한 장」은 여기서도 빠진다 — 6컷 격자라 정체성 참조로 못 쓴다
 * (`character-pick.ts` 의 `isAngle`).
 */
export function chosenViews<T extends PickableView>(picked: string[], views: T[]): T[] {
  const usable = pickableViews(views);
  if (isAutoChoice(picked)) return usable;

  // 고른 차례를 지킨다. 차례가 바뀌면 같은 선택에 다른 그림이 나온다.
  return picked
    .map((angle) => usable.find((view) => view.angle === angle))
    .filter((view): view is T => Boolean(view));
}

/**
 * 지금 무엇이 쓰이는지 한 줄.
 *
 * 「2장」이 아니라 **각도 이름**으로 말한다. 장수만 적으면 어느 장인지 다시 열어
 * 봐야 한다.
 */
export function describeCharacterChoice(
  picked: string[],
  views: PickableView[],
  angleLabel: (angle: string) => string,
): string {
  if (isAutoChoice(picked)) return "각도 자동. 섹션에 맞는 장면을 골라 씁니다";
  return chosenViews(picked, views)
    .map((view) => angleLabel(view.angle))
    .join(" · ");
}

/**
 * 모달이 준 것을 화면이 들 상태로.
 *
 * 「자동으로 맡기기」는 모달에서 정면이 켜져 있어도 자동이어야 한다 — 누른 단추가
 * 뜻을 정한다. 반대로 하나도 안 고르고 「고른 것만」이 눌리면 자동으로 떨어진다.
 * 빈 각도로 두면 캐릭터가 통째로 사라지는데, 캐릭터를 고른 사람은 쓰겠다는 뜻이었다.
 */
export function pickedFrom(result: { auto: boolean; angles: string[] }): string[] {
  return result.auto ? [] : result.angles;
}
