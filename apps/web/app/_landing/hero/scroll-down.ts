/**
 * 내려가기 버튼이 **어떻게 내려갈지.**
 *
 * 한 줄짜리 판단이지만 화면 안에 두면 값으로 못 잰다. 움직임을 원하지 않는
 * 사람에게 부드러운 스크롤을 쓰면 그 자체가 멀미를 부른다 — 내려가긴 하되
 * 즉시 내려가야 한다.
 */

export type ScrollBehaviorChoice = "smooth" | "auto";

export function scrollBehaviorFor(reduceMotion: boolean): ScrollBehaviorChoice {
  return reduceMotion ? "auto" : "smooth";
}

/**
 * 내려가서 **어디에 멈출까.**
 *
 * `start` 였다. 다음 섹션의 위쪽을 화면 위쪽에 붙이는 값인데, 그 섹션은
 * 위아래로 `clamp(104px, 13vh, 208px)` 씩 여백을 두고 있다. 그래서 손잡이를
 * 누르면 **빈 여백이 화면을 채우고 글은 한참 아래에 걸렸다.**
 *
 * `center` 는 섹션의 가운데를 화면 가운데에 맞춘다. 여백이 위아래로 같으니
 * 그 안의 글이 곧 가운데에 온다. 섹션이 화면보다 길어도 마찬가지다.
 *
 * 상단바가 `position: fixed` 로 얹혀 있는데(`hero.css`), 가운데에 맞추면
 * 글이 그 아래로 들어가지 않는다 — `start` 로 붙일 때만 가려졌다.
 */
export function downScrollBlock(): ScrollLogicalPosition {
  return "center";
}

/** 손잡이가 그대로 넘길 수 있는 한 벌. 부르는 쪽이 값을 조립하지 않게 한다. */
export function downScrollOptions(reduceMotion: boolean): ScrollIntoViewOptions {
  return { behavior: scrollBehaviorFor(reduceMotion), block: downScrollBlock() };
}
