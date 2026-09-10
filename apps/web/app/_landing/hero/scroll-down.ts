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
