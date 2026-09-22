import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEVELOPED_ON, DEVELOPER_NAME, developerLines } from "../developer";
import { BUSINESS } from "../legal/business-info";

/**
 * 푸터의 만든 사람 · 만든 날 (운영자 요청 2026-09-14).
 *
 * jsdom 이 없어 화면을 그려 볼 수 없다. 값을 직접 시험하고, 그것이 화면에
 * 걸렸는지는 파일을 글자로 읽어 확인한다.
 */

const WEB = process.cwd();
const footer = readFileSync(path.join(WEB, "app/_landing/cta-footer.tsx"), "utf8");

describe("값", () => {
  it("빈 값이 없다", () => {
    expect(DEVELOPER_NAME.trim().length).toBeGreaterThan(0);
    expect(DEVELOPED_ON.trim().length).toBeGreaterThan(0);
  });

  it("두 줄이 나온다", () => {
    for (const locale of ["ko", "en"] as const) {
      expect(developerLines(locale)).toHaveLength(2);
    }
  });

  /** 이름과 날짜는 번역 대상이 아니다. 이름표만 언어를 따른다. */
  it("두 언어에서 값이 같고 이름표만 다르다", () => {
    const ko = developerLines("ko");
    const en = developerLines("en");
    expect(ko.map((line) => line.value)).toEqual(en.map((line) => line.value));
    for (const [index, line] of ko.entries()) {
      expect(line.label).not.toBe(en[index]!.label);
    }
  });

  it("빈 이름표가 없다", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const line of developerLines(locale)) {
        expect(line.label.trim().length).toBeGreaterThan(0);
        expect(line.value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("법정 표시와 섞이지 않는다", () => {
  /**
   * 사업자 정보는 전자상거래법이 요구하는 **법정 표시**라 한 글자도 바꾸면
   * 안 된다. 이 줄은 그런 성격이 아니다. 한 덩어리로 묶으면 나중에 이쪽을
   * 고치다가 저쪽을 건드린다.
   */
  it("사업자 정보에 개발자 칸이 없다", () => {
    expect(Object.keys(BUSINESS)).not.toContain("developer");
    expect(Object.values(BUSINESS)).not.toContain(DEVELOPER_NAME);
  });
});

describe("화면에 실제로 걸려 있다", () => {
  it("푸터가 두 줄을 그린다", () => {
    expect(footer).toContain("developerLines(locale)");
  });

  /** 운영자가 빼기로 한 두 가지가 정말 빠졌는지. */
  it("「소재 수집부터 완성 이미지까지」가 빠졌다", () => {
    expect(footer).not.toContain("footerRight");
  });

  it("「FormWith란」 링크가 빠졌다", () => {
    expect(footer).not.toContain("navAbout");
    expect(footer).not.toContain('href="/about"');
  });

  /** 아래 사업자 정보와 섞이면 둘 다 읽기 어려워진다. */
  it("사업자 정보와 다른 줄에 있다", () => {
    const credit = footer.indexOf("developerLines(locale)");
    const business = footer.indexOf("<BusinessInfo");
    expect(credit).toBeGreaterThan(0);
    expect(business).toBeGreaterThan(credit);
  });
});
