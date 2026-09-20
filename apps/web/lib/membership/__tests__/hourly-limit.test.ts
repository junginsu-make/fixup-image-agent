import { describe, expect, it } from "vitest";
import { HOURLY_LIMITS, hourlyLimitFor } from "../hourly-limit";

/**
 * **레퍼런스를 정리하다가 상세페이지를 못 만들게 되면 안 된다**(C-7).
 *
 * 레퍼런스를 올리면 그림을 읽어 서술을 만든다(글 모델 한 번). 그 길에는 예약도
 * 횟수 제한도 없었다 — 같은 그림을 천 번 올려도 막는 것이 없다.
 *
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 **재사용**하고 레퍼런스 분석·전사
 * 에도 **명시된 LLM 작업 한도**를 적용한다.」
 *
 * 세는 방식은 같이 쓰되 **칸은 나눈다.** 상세페이지 분석은 시간당 열 번인데,
 * 레퍼런스는 한자리에서 스무 장을 올리는 일이 정상이다. 같은 칸을 쓰면 정리
 * 한 번에 그날 분석이 막힌다.
 */

describe("작업마다 제 한도를 본다", () => {
  it("**상세페이지 분석은 전과 같다**", () => {
    expect(hourlyLimitFor("pdp_analyze", {})).toBe(10);
  });

  /**
   * 60 은 지어낸 수가 아니다. 이 저장소가 이미 쓰는 `MAX_USER_REFERENCES`(40)
   * 가 **글 모델이 한 번에 보는 레퍼런스 수**다. 목록을 통째로 새로 채우는
   * 일이 한 시간 안에 한 번은 되어야 하므로 그보다 넉넉히 잡는다.
   */
  it("**레퍼런스 분석은 더 넉넉하다** — 한자리에서 여러 장을 올린다", () => {
    expect(hourlyLimitFor("reference_analyze", {})).toBe(60);
    expect(hourlyLimitFor("reference_analyze", {})).toBeGreaterThan(hourlyLimitFor("pdp_analyze", {}));
  });

  it("**한도가 없는 작업은 기본값으로 둔다** — 예약은 다른 규칙으로 막는다", () => {
    expect(hourlyLimitFor("pdp_image", {})).toBe(10);
  });
});

describe("설정으로 바꿀 수 있다", () => {
  it("**환경변수가 이긴다**", () => {
    expect(hourlyLimitFor("pdp_analyze", { ANALYZE_HOURLY_LIMIT: "25" })).toBe(25);
    expect(hourlyLimitFor("reference_analyze", { REFERENCE_ANALYZE_HOURLY_LIMIT: "5" })).toBe(5);
  });

  it("**서로의 값을 안 읽는다** — 한 칸을 고치면 다른 칸이 따라 움직이면 안 된다", () => {
    expect(hourlyLimitFor("pdp_analyze", { REFERENCE_ANALYZE_HOURLY_LIMIT: "999" })).toBe(10);
    expect(hourlyLimitFor("reference_analyze", { ANALYZE_HOURLY_LIMIT: "1" })).toBe(60);
  });

  /**
   * **오타가 한도를 0 으로 만들면 안 된다.** SQL 도 같은 범위로 조인다 —
   * 여기서 먼저 조여서 두 곳이 같은 답을 내게 한다.
   */
  it.each([
    ["빈 글자", "", 10],
    ["숫자가 아니다", "열번", 10],
    ["0", "0", 1],
    ["음수", "-5", 1],
    ["소수", "7.9", 7],
    ["너무 큰 수", "99999", 1000],
  ])("%s → %s", (_label, raw, expected) => {
    expect(hourlyLimitFor("pdp_analyze", { ANALYZE_HOURLY_LIMIT: raw })).toBe(expected);
  });
});

describe("표가 한 벌이다", () => {
  it("**시간당 한도를 두는 작업은 SQL 이 세는 작업과 같다**", () => {
    // 여기 있는데 SQL 이 안 세면 한도가 없는 것이고, 반대면 앱이 엉뚱한 수를 넣는다.
    expect(Object.keys(HOURLY_LIMITS).sort()).toEqual(["pdp_analyze", "reference_analyze"]);
  });
});
