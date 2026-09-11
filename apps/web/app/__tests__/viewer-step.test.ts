import { describe, expect, it } from "vitest";
import { stepIndex } from "../_components/viewer-step";

/**
 * 큰 보기에서 **한 번 누르면 한 칸만** 넘어가는가.
 *
 * 2026-09-11 운영에서 두 장짜리 캐릭터가 「1 / 2」인데도 화살표를 눌러도
 * 안 넘어갔다. 원인은 자리 계산이 아니라 **부른 자리**였다 —
 * `setRequest` 갱신자 안에서 `setIndex` 를 불렀는데, 갱신자는 순수해야 하고
 * React 는 개발 모드에서 그것을 두 번 부른다. 그래서 한 번 눌러도 두 칸이
 * 넘어갔고, 두 장뿐이면 제자리로 돌아와 아무 일도 안 일어난 것으로 보였다.
 *
 * 계산을 떼어 내 값으로 잰다. 부른 자리는 `image-viewer.tsx` 가 지킨다.
 */
describe("큰 보기 자리 옮기기", () => {
  it("두 장이면 한 번에 한 칸씩 오간다", () => {
    // 두 칸씩 넘어가던 변이라면 이 둘이 전부 0 으로 돌아온다.
    expect(stepIndex(0, 1, 2)).toBe(1);
    expect(stepIndex(1, 1, 2)).toBe(0);
    expect(stepIndex(0, -1, 2)).toBe(1);
  });

  it("일곱 장까지도 한 칸씩이다", () => {
    // 각도 여섯 + 다각도 한 장.
    const walked = [0, 1, 2, 3, 4, 5, 6].map((at) => stepIndex(at, 1, 7));
    expect(walked).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("맨 앞에서 뒤로 가면 맨 뒤로 돈다", () => {
    expect(stepIndex(0, -1, 7)).toBe(6);
  });

  it("한 장뿐이거나 없으면 제자리다", () => {
    // 화살표가 아예 안 나오지만, 자판은 창이 열려 있으면 들어온다.
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(stepIndex(3, -1, 0)).toBe(3);
  });
});
