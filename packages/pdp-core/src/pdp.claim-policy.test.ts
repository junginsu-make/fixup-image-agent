import { describe, expect, it } from "vitest";
import { containsFactualMarker, scanBannedClaims } from "./pdp.claim-policy";

describe("금지 분류 스캐너", () => {
  it("수익·성과 보장을 잡는다", () => {
    expect(scanBannedClaims("월 500만 원 보장합니다")[0]?.category).toBe("guarantee");
    expect(scanBannedClaims("3개월이면 퇴사 가능")[0]?.category).toBe("guarantee");
  });

  it("의학적·신체적 효능을 잡는다", () => {
    expect(scanBannedClaims("아토피 개선에 도움")[0]?.category).toBe("medical");
    expect(scanBannedClaims("체지방 감소 효과")[0]?.category).toBe("medical");
    expect(scanBannedClaims("탈모가 완화됩니다")[0]?.category).toBe("medical");
  });

  it("인증·수상·순위를 잡는다", () => {
    expect(scanBannedClaims("국내 1위 강의")[0]?.category).toBe("credential");
    expect(scanBannedClaims("식약처 인증 완료")[0]?.category).toBe("credential");
    expect(scanBannedClaims("특허 출원 기술")[0]?.category).toBe("credential");
  });

  it("표현 변형도 잡는다", () => {
    expect(scanBannedClaims("수익을 보장해 드립니다")).not.toHaveLength(0);
    expect(scanBannedClaims("업계 1등")).not.toHaveLength(0);
  });

  it("영어 이미지 프롬프트의 금지 주장도 잡는다", () => {
    expect(scanBannedClaims("guaranteed income in three months")[0]?.category).toBe("guarantee");
    expect(scanBannedClaims("clinically proven hair loss treatment")[0]?.category).toBe("medical");
    expect(scanBannedClaims("patented, award-winning No. 1 method")[0]?.category).toBe("credential");
  });

  it("한 문장의 모든 분류를 돌려준다", () => {
    const categories = scanBannedClaims("국내 1위 기술로 체지방 감소를 보장합니다").map(
      (hit) => hit.category,
    );
    expect(categories).toEqual(expect.arrayContaining(["guarantee", "medical", "credential"]));
  });

  it("평범한 카피는 통과시킨다", () => {
    expect(scanBannedClaims("영상 만드는 시간을 줄여 줍니다")).toHaveLength(0);
    expect(scanBannedClaims("어떤 순서로 보여줘야 팔릴까요?")).toHaveLength(0);
  });
});

// 오탐은 정상 사용자를 게이트에서 막는다. 놓치는 것보다 이쪽이 더 자주 아프다.
describe("금지 분류 오탐", () => {
  it("정당한 상거래 문구를 막지 않는다", () => {
    expect(scanBannedClaims("30일 환불 보장")).toHaveLength(0);
    expect(scanBannedClaims("품질을 보장합니다")).toHaveLength(0);
  });

  it("숫자+등이 순위가 아닌 말을 막지 않는다", () => {
    expect(scanBannedClaims("3등분된 화면 구성")).toHaveLength(0);
    expect(scanBannedClaims("2등급 자재를 씁니다")).toHaveLength(0);
    expect(scanBannedClaims("화면을 3등분한 레이아웃")).toHaveLength(0);
  });

  it("그래도 진짜 순위 주장은 잡는다", () => {
    expect(scanBannedClaims("국내 1위 강의")).not.toHaveLength(0);
    expect(scanBannedClaims("업계 3등 규모")).not.toHaveLength(0);
    expect(scanBannedClaims("판매량 1위")).not.toHaveLength(0);
  });

  it("그래도 진짜 수익 보장은 잡는다", () => {
    expect(scanBannedClaims("월 500만 원 보장합니다")).not.toHaveLength(0);
    expect(scanBannedClaims("수익을 보장해 드립니다")).not.toHaveLength(0);
  });
});

describe("사실 표지", () => {
  it("숫자·기간·비율·가격을 표지로 본다", () => {
    expect(containsFactualMarker("수강생 3,000명")).toBe(true);
    expect(containsFactualMarker("2주 만에 끝납니다")).toBe(true);
    expect(containsFactualMarker("만족도 98%")).toBe(true);
    expect(containsFactualMarker("29,000원")).toBe(true);
  });

  it("검증 가능한 금지 표현도 표지로 본다", () => {
    expect(containsFactualMarker("업계에서 유일한 특허 기술")).toBe(true);
  });

  // 맨숫자까지 표지로 보면 장면 묘사가 통째로 강등된다.
  // 설계 §3-6 이 든 것도 '숫자·기간·비율·순위·가격'이지 임의의 숫자가 아니다.
  it("단위 없는 맨숫자는 표지가 아니다", () => {
    expect(containsFactualMarker("20대 여성이 노트북 앞에 앉아 있다")).toBe(false);
    expect(containsFactualMarker("화면을 3등분한 레이아웃")).toBe(false);
    expect(containsFactualMarker("S1 섹션")).toBe(false);
  });

  it("수사에는 표지가 없다", () => {
    expect(containsFactualMarker("아직 절반만 하신 겁니다")).toBe(false);
    expect(containsFactualMarker("왜 아무도 못 할까요?")).toBe(false);
  });
});
