import { describe, expect, it } from "vitest";
import { POSTER_RATIOS } from "../ratios";
import { RATIO_USES } from "../ratio-uses";

/**
 * **어떤 용도에 어떤 비율을 쓰나.**
 *
 * 유튜브 썸네일을 찾는 사람이 목록에서 헤맸다(2026-09-16 사용자 보고).
 * 1280×720 = 정확히 16:9 라 이미 만들 수 있는데, 버튼에 「가로 배너 16:9」라고만
 * 적혀 있어 그게 그거인 줄 모른다.
 *
 * **새 비율 항목을 만들지 않는다.** 같은 픽셀을 다른 이름으로 두면 목록에 같은
 * 것이 둘 생기고, 사용자는 뭐가 다른지 묻게 된다. 대신 **길잡이 한 줄**을 단다.
 */

describe("용도 길잡이", () => {
  /** 가리키는 비율이 목록에 없으면 눌러도 없는 버튼을 찾게 된다. */
  it("가리키는 비율이 모두 실제로 있다", () => {
    const ids = new Set(POSTER_RATIOS.map((ratio) => ratio.id));

    for (const use of RATIO_USES) {
      expect(ids.has(use.ratioId), `${use.label} → ${use.ratioId}`).toBe(true);
    }
  });

  /** 이것이 이 표를 만든 이유다. */
  it("유튜브 썸네일이 16:9 를 가리킨다", () => {
    const youtube = RATIO_USES.find((use) => use.label.includes("유튜브"));

    expect(youtube?.ratioId).toBe("16:9");
  });

  it("자주 쓰는 곳을 덮는다", () => {
    const labels = RATIO_USES.map((use) => use.label).join(" ");

    // 인쇄물은 없다 — 버튼이 이미 「A4 인쇄용」이라 길잡이가 보탤 것이 없고,
    // 그 id(a4-print)를 화면에 그대로 보이면 내부 이름이 샌다.
    for (const word of ["유튜브", "인스타그램", "릴스"]) {
      expect(labels).toContain(word);
    }
  });

  /** 너무 길면 아무도 안 읽는다. 길잡이지 목록이 아니다. */
  it("다섯 줄을 안 넘는다", () => {
    expect(RATIO_USES.length).toBeLessThanOrEqual(5);
  });

  /** 같은 비율을 두 줄이 가리키면 어느 것을 눌러야 할지 헷갈린다. */
  it("한 비율을 두 번 가리키지 않는다", () => {
    const ids = RATIO_USES.map((use) => use.ratioId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * **화면에 그대로 뜨는 값이다.** `a4-print` 같은 내부 이름이 섞이면 사용자가
   * 못 알아본다 — 2026-09-16 화면 실측에서 「인쇄물 → a4-print」가 그대로 보였다.
   * 비율처럼 읽히는 것만 둔다.
   */
  it("내부 이름이 새지 않는다", () => {
    for (const use of RATIO_USES) {
      expect(use.ratioId, use.label).toMatch(/^\d+:\d+$/);
    }
  });
});
