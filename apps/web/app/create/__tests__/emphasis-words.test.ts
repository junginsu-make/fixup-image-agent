import { describe, expect, it } from "vitest";
import { keepWordsPresentIn, splitHeadlineWords } from "../emphasis-words";

/**
 * 강조 낱말은 **제목에 실제로 있는 것**이어야 한다.
 *
 * 없는 낱말을 보내면 모델은 강조할 대상을 못 찾는다. 조용히 무시되거나 엉뚱한
 * 곳이 강조된다. 제목은 사용자가 언제든 고치므로, 고친 뒤 예전 낱말이 남는 일이
 * 흔하다 — 그때 걸러 내는 것이 이 함수의 일이다.
 */
describe("제목 쪼개기", () => {
  it("공백으로 나눈다", () => {
    expect(splitHeadlineWords("하루 한 번, 속부터 촉촉하게")).toEqual([
      "하루",
      "한",
      "번,",
      "속부터",
      "촉촉하게",
    ]);
  });

  it("연속 공백과 앞뒤 공백을 흘린다", () => {
    expect(splitHeadlineWords("  촉촉한   피부  ")).toEqual(["촉촉한", "피부"]);
  });

  it("빈 제목은 빈 배열", () => {
    expect(splitHeadlineWords("")).toEqual([]);
    expect(splitHeadlineWords("   ")).toEqual([]);
  });

  it("조사가 붙은 덩어리를 그대로 둔다", () => {
    // 화면에 보이는 모양이 곧 강조 단위다. 형태소로 쪼개면 모델이 못 찾는다.
    expect(splitHeadlineWords("수분이 머무는 자리")).toContain("수분이");
  });
});

describe("제목에 없는 낱말 걸러내기", () => {
  it("제목에 있는 것만 남긴다", () => {
    expect(keepWordsPresentIn("하루 한 번, 속부터 촉촉하게", ["속부터", "탄력"])).toEqual([
      "속부터",
    ]);
  });

  it("제목을 고치면 예전 낱말이 사라진다", () => {
    const before = ["촉촉하게"];
    expect(keepWordsPresentIn("하루 한 번, 속부터 촉촉하게", before)).toEqual(["촉촉하게"]);
    expect(keepWordsPresentIn("가볍게 스며드는 수분", before)).toEqual([]);
  });

  it("부분 일치는 통과시키지 않는다", () => {
    // "촉촉" 은 "촉촉하게" 의 일부지만 화면에 그 낱말로 존재하지 않는다.
    expect(keepWordsPresentIn("속부터 촉촉하게", ["촉촉"])).toEqual([]);
  });

  it("아무것도 안 골랐으면 빈 배열 그대로", () => {
    // 빈 배열은 "AI 가 알아서 고른다"는 뜻이다. 여기서 무언가를 채우면 안 된다.
    expect(keepWordsPresentIn("속부터 촉촉하게", [])).toEqual([]);
  });

  it("제목이 비면 전부 버린다", () => {
    expect(keepWordsPresentIn("", ["촉촉하게"])).toEqual([]);
  });
});
