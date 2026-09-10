import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS, BUSINESS_ORDER, businessLines } from "../business-info";

/**
 * 푸터의 사업자 정보가 **증명서와 어긋나지 않는지** 본다.
 *
 * 이 값들은 디자인이 아니라 법정 표시다(전자상거래법 제10조). 한 글자만 달라도
 * 허위 표시가 되는데, 화면을 눈으로 보면 숫자 한 자리 바뀐 것은 안 보인다.
 * 그래서 증명서에서 옮긴 값을 여기 못 박아 두고 대조한다.
 *
 * 값을 진짜로 바꿔야 할 때(예: 통신판매업 신고번호를 받았을 때)는 이 시험도
 * 같이 고친다 — 고치는 손이 한 번 더 멈추게 하는 것이 이 시험의 목적이다.
 */

/** 국세청 사업자등록증명 (발급번호 4324-174-0754-293, 2026-07-22 발급). */
const CERTIFICATE = {
  companyName: "주식회사 픽스업",
  ceo: "정해민",
  registrationNumber: "856-88-03150",
  address: "경기도 김포시 고촌읍 고송로 8, 4층",
} as const;

const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

describe("사업자 정보", () => {
  it("증명서에 적힌 네 항목이 그대로다", () => {
    for (const [field, value] of Object.entries(CERTIFICATE)) {
      expect(BUSINESS[field as keyof typeof CERTIFICATE]).toBe(value);
    }
  });

  it("연락처는 실제로 연결되는 번호 꼴이다", () => {
    // 임시 번호라도 「[전화번호]」 같은 자리표시가 화면에 나가면 안 된다.
    expect(BUSINESS.contact).toMatch(/^0\d{1,2}-\d{3,4}-\d{4}$/);
  });

  it("통신판매업 칸은 없는 번호를 지어내지 않는다", () => {
    // 신고번호를 받으면 「제 0000-경기김포-0000 호」 형태로 바뀐다.
    const value = BUSINESS.mailOrderNumber;
    expect(value.length).toBeGreaterThan(0);
    if (value !== "신고 준비중") {
      expect(value).toMatch(/제\s?\d{4}-.+-\d+\s?호/);
    }
  });

  it("법이 요구하는 여섯 항목을 모두 건다", () => {
    expect([...BUSINESS_ORDER]).toEqual([
      "companyName",
      "ceo",
      "registrationNumber",
      "mailOrderNumber",
      "address",
      "contact",
    ]);
  });
});

describe("푸터 줄", () => {
  /**
   * 상호·번호·주소는 **번역 대상이 아니다.** 등록된 이름이 하나뿐이라서다.
   * 이름표만 언어를 따른다.
   */
  it("두 언어에서 값이 같고 이름표만 다르다", () => {
    const ko = businessLines("ko");
    const en = businessLines("en");

    expect(ko.map((line) => line.value)).toEqual(en.map((line) => line.value));
    for (const [index, line] of ko.entries()) {
      expect(line.label).not.toBe(en[index].label);
    }
  });

  it("빈 이름표나 빈 값이 없다", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const line of businessLines(locale)) {
        expect(line.label.trim().length).toBeGreaterThan(0);
        expect(line.value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("푸터에 실제로 걸려 있다", () => {
  const footer = read("app/_landing/cta-footer.tsx");
  const css = read("app/_landing/landing.css");

  /**
   * 값과 화면이 따로 놀 수 있다 — 파일만 만들고 안 걸면 시험은 통과하는데
   * 화면에는 아무것도 안 나온다. 걸었는지를 따로 본다.
   */
  it("푸터가 사업자 정보를 그린다", () => {
    expect(footer).toContain("BusinessInfo");
    expect(footer).toContain("locale={locale}");
  });

  it("두 공개 화면 모두 언어를 넘겨 준다", () => {
    for (const page of ["app/page.tsx", "app/about/page.tsx"]) {
      expect(read(page)).toContain("<LandingFooter t={t} locale={locale} />");
    }
  });

  it("그릴 자리의 모양이 있다", () => {
    expect(css).toContain(".mcs-footer-business");
  });
});
