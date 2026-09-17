import { describe, expect, it } from "vitest";
import { canvasSize, fillHeight } from "../fit-screen";

/**
 * **한 화면에서 스크롤 없이 다 보인다**(2026-09-17 사용자 요청).
 *
 * 작업 영역 높이를 「화면 높이 − 144px」로 어림잡았는데, 위에 실제로 있는 것
 * (계정 줄·제목·순서 안내·여백)은 약 170px 이었다. 그 차이만큼 아래로 밀려나
 * 레퍼런스의 「칸 읽어내기」 버튼이 반만 보였다. 카드 칸은 560×620 고정이라
 * 작은 화면에서 줄지 않고 스크롤을 만들었다.
 */

describe("작업 영역 높이 — 실제로 남은 만큼", () => {
  it("화면 높이에서 위에 놓인 것과 아래 여백을 뺀다", () => {
    expect(fillHeight({ viewport: 1026, top: 170, bottomGap: 24 })).toBe(832);
  });

  it("위가 더 두꺼워지면(필터 띠) 그만큼 줄어든다 — 어림값이면 넘친다", () => {
    expect(fillHeight({ viewport: 1026, top: 236, bottomGap: 24 })).toBe(766);
  });

  it("너무 작은 창에서도 바닥 아래로는 안 줄인다 — 그때는 열 안에서 스크롤한다", () => {
    expect(fillHeight({ viewport: 500, top: 170, bottomGap: 24, min: 420 })).toBe(420);
  });
});

describe("카드 칸 크기 — 남은 자리에 맞춘다", () => {
  const FEED = { width: 1080, height: 1350 }; // 4:5

  it("자리가 넉넉하면 전과 같다 — 큰 화면은 달라지지 않는다", () => {
    expect(canvasSize(FEED, { width: 2000, height: 2000 })).toEqual({ width: 496, height: 620 });
  });

  it("**세로가 모자라면 비율을 지키며 줄어든다** — 스크롤이 안 생긴다", () => {
    const size = canvasSize(FEED, { width: 2000, height: 400 });
    expect(size.height).toBe(400);
    expect(size.width).toBe(320);
  });

  it("가로가 모자라도 비율을 지킨다", () => {
    const size = canvasSize({ width: 1920, height: 1080 }, { width: 300, height: 2000 });
    expect(size).toEqual({ width: 300, height: 169 });
  });

  it("아주 좁아도 손으로 칸을 잡을 수 있는 크기는 남긴다", () => {
    const size = canvasSize(FEED, { width: 2000, height: 40 });
    expect(size.height).toBeGreaterThanOrEqual(200);
  });

  it("자리를 아직 못 쟀으면 전과 같은 크기로 그린다 — 첫 그림이 손톱만 하면 안 된다", () => {
    expect(canvasSize(FEED)).toEqual({ width: 496, height: 620 });
  });
});
