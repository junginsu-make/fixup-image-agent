import { describe, expect, it } from "vitest";
import { coverageNotice, referenceCuts, stripCuts, type CoverageCut } from "../coverage";

/**
 * **얼마나 잘렸는지 아무도 말하지 않았다**(F-7-0).
 *
 * 설계 §14.6: 「**PDF/원본/전사 범위 절단**, 고정 S1~S10 구성 | **절단 범위
 * 확인**·자료별 구성으로 개선 | W7/W8 / T-PLAN, **T-LIMIT**」.
 * 설계 T-LIMIT: 「chunked body 초과, 긴 이미지/PDF, **페이지 절단 고지**,
 * pagination…」.
 *
 * 자르는 자리는 다섯이고 **전부 조용하다**(2026-09-21 확인).
 *
 *   `normalizeFilesForUpload`  올린 자료 중 앞 4개만 참조로 쓴다
 *   `renderPdfToImages`        PDF 는 앞 4쪽만 그림 참조로 만든다
 *   `splitFilesToStrips`       전사는 스트립 40장까지
 *   `splitPdf`                 전사는 PDF 20쪽까지
 *   `transcript.slice`         전사 글은 60,000자까지
 *
 * 20쪽짜리 PDF 를 올린 사람은 **4쪽만 보고 만든 페이지**를 받으면서, 그
 * 사실을 어디서도 못 듣는다. 값은 똑같이 낸다.
 */

const 고지 = (...cuts: CoverageCut[]) => coverageNotice(cuts);

describe("자른 만큼을 말한다", () => {
  it("**안 잘렸으면 아무 말도 안 한다**", () => {
    expect(고지()).toBe("");
    expect(고지({ what: "reference-files", used: 3, total: 3 })).toBe("");
  });

  it("**PDF 쪽수를 잘랐으면 몇 쪽 중 몇 쪽인지 말한다**", () => {
    const 말 = 고지({ what: "pdf-reference-pages", used: 4, total: 20 });

    expect(말).toContain("20");
    expect(말).toContain("4");
  });

  it("**올린 자료를 잘랐으면 그것도 말한다**", () => {
    const 말 = 고지({ what: "reference-files", used: 4, total: 7 });

    expect(말).toContain("7");
    expect(말).toContain("4");
  });

  it("**전사 범위도 말한다**", () => {
    const 말 = 고지({ what: "transcribe-pdf-pages", used: 20, total: 100 });

    expect(말).toContain("100");
    expect(말).toContain("20");
  });

  /**
   * **여러 곳이 잘리면 한 번에 말한다.** 토스트가 서로를 덮으면 사용자는
   * 마지막 것만 본다.
   */
  it("**여러 곳이 잘려도 한 문장이다**", () => {
    const 말 = 고지(
      { what: "pdf-reference-pages", used: 4, total: 20 },
      { what: "transcribe-pdf-pages", used: 20, total: 100 },
    );

    expect(말).toContain("20");
    expect(말).toContain("100");
    expect(말.split("\n")).toHaveLength(1);
  });

  /**
   * **무엇을 하면 되는지가 있어야 한다.** 「잘렸습니다」만 말하면 사용자는
   * 그대로 값을 내고 만다.
   */
  it("**어떻게 하면 되는지 붙는다**", () => {
    const 말 = 고지({ what: "pdf-reference-pages", used: 4, total: 20 });

    expect(말).toMatch(/나눠|줄여|중요한/);
  });

  it("**사용자에게 보이는 말에 줄표를 안 쓴다**", () => {
    const 말 = 고지(
      { what: "pdf-reference-pages", used: 4, total: 20 },
      { what: "reference-files", used: 4, total: 7 },
      { what: "transcribe-pdf-pages", used: 20, total: 100 },
      { what: "transcribe-strips", used: 40, total: 57 },
    );

    expect(말).not.toContain("—");
  });

  /**
   * **숫자가 뒤집혀 와도 거짓말을 하지 않는다.** 쓴 것이 전체보다 많을 수
   * 없다 — 그런 값이 오면 자른 것이 아니다.
   */
  it("**쓴 것이 더 많으면 자른 것이 아니다**", () => {
    expect(고지({ what: "reference-files", used: 5, total: 3 })).toBe("");
  });

  it("**모르는 종류는 조용히 지나간다**", () => {
    expect(고지({ what: "없는종류" as never, used: 1, total: 9 })).toBe("");
  });
});

/**
 * **모르는 수를 지어내지 않는다**(2026-09-21 리뷰).
 *
 * 조각내기는 상한에 닿으면 거기서 멈춘다. 원본이 몇 조각짜리였는지는 세지
 * 않았다. 그런데 처음 판은 상한값을 그대로 `total` 로 넣어 「40조각 중 앞
 * 40조각만」 같은 말이 나오게 돼 있었다. **고지가 목적인 기능이 사실이 아닌
 * 문장을 내면 안 된다.**
 */
describe("전체 수를 모르면 숫자를 안 쓴다", () => {
  it("**모르면 「앞 N조각까지만」으로 말한다**", () => {
    const 말 = 고지({ what: "transcribe-strips", used: 40 });

    expect(말).toContain("앞 40조각까지만");
    expect(말).not.toMatch(/\d+조각 중/);
  });

  it("**알면 몇 중 몇인지 말한다**", () => {
    expect(고지({ what: "transcribe-strips", used: 40, total: 57 })).toContain("57조각 중 앞 40조각");
  });

  /**
   * **어느 자료인지 밝힌다.** PDF 를 둘 올리면 어느 쪽이 잘렸는지 알 수 없다.
   */
  it("**자료 이름을 붙인다**", () => {
    const 말 = 고지(
      { what: "pdf-reference-pages", used: 4, total: 20, label: "앞면.pdf" },
      { what: "pdf-reference-pages", used: 0, total: 12, label: "뒷면.pdf" },
    );

    expect(말).toContain("앞면.pdf 20쪽 중 4쪽");
    expect(말).toContain("뒷면.pdf 12쪽 중 0쪽");
  });

  it("**이름이 없으면 그냥 「올린 자료」다**", () => {
    expect(고지({ what: "pdf-reference-pages", used: 4, total: 20 })).toContain("올린 자료 20쪽");
  });

  /**
   * **한 쪽도 못 쓴 것도 말해야 한다.** 둘째 PDF 가 통째로 빠졌는데 조용하면,
   * 사용자는 그것이 반영된 줄 안다.
   */
  it("**한 쪽도 안 썼으면 그렇게 말한다**", () => {
    expect(고지({ what: "pdf-reference-pages", used: 0, total: 12, label: "뒷면.pdf" }))
      .toContain("0쪽만");
  });

  it("**참조 이미지 수를 「올린 자료」라고 하지 않는다** — 긴 이미지 한 장이 넉 장이 된다", () => {
    const 말 = 고지({ what: "reference-files", used: 4, total: 5 });

    expect(말).toContain("만든 참조 이미지 5장 중 앞 4장");
    expect(말).not.toContain("올린 자료 5개");
  });
});

/**
 * **자른 뒤에 센다**(2026-09-21 리뷰 HIGH).
 *
 * 상한은 누적인데 처음 판은 파일마다 쌓았다. PDF 두 개(20쪽·12쪽)를 올리면
 * 실제로는 첫 PDF 의 4쪽만 쓰는데 「20쪽 중 4쪽, 12쪽 중 4쪽」이라고 말했다.
 */
describe("참조로 실제로 실린 것을 센다", () => {
  const 만든것 = (origins: string[]) => origins.map((origin) => ({ origin }));

  it("**둘째 PDF 가 한 쪽도 안 실렸으면 0쪽이라고 센다**", () => {
    const produced = 만든것(["앞.pdf", "앞.pdf", "앞.pdf", "앞.pdf", "뒤.pdf", "뒤.pdf"]);

    const cuts = referenceCuts({
      produced,
      kept: produced.slice(0, 4),
      pdfPages: new Map([["앞.pdf", 20], ["뒤.pdf", 12]]),
    });

    expect(cuts).toContainEqual({ what: "pdf-reference-pages", used: 4, total: 20, label: "앞.pdf" });
    expect(cuts).toContainEqual({ what: "pdf-reference-pages", used: 0, total: 12, label: "뒤.pdf" });
  });

  it("**다 실렸으면 아무 말도 안 한다**", () => {
    const produced = 만든것(["앞.pdf", "앞.pdf"]);

    expect(referenceCuts({ produced, kept: produced, pdfPages: new Map([["앞.pdf", 2]]) })).toEqual([]);
  });

  it("**만든 것이 상한을 넘으면 그것도 센다**", () => {
    const produced = 만든것(["긴.png", "긴.png", "긴.png", "긴.png", "둘째.png"]);

    const cuts = referenceCuts({ produced, kept: produced.slice(0, 4), pdfPages: new Map() });

    expect(cuts).toEqual([{ what: "reference-files", used: 4, total: 5 }]);
  });

  it("**자르기 전의 수로 세면 안 된다**", () => {
    const produced = 만든것(["앞.pdf", "앞.pdf", "앞.pdf", "앞.pdf", "뒤.pdf"]);

    const cuts = referenceCuts({
      produced,
      kept: produced.slice(0, 4),
      pdfPages: new Map([["뒤.pdf", 1]]),
    });

    // 뒤.pdf 는 한 쪽도 안 실렸다. 「1쪽 중 1쪽」이라고 하면 거짓말이다.
    expect(cuts).toContainEqual({ what: "pdf-reference-pages", used: 0, total: 1, label: "뒤.pdf" });
  });
});

describe("글자 읽기 조각이 얼마나 잘렸나", () => {
  it("**자르려던 것보다 적게 만들었으면 몇 중 몇인지 센다**", () => {
    expect(stripCuts({ used: 40, wanted: 57, skippedFiles: 0 }))
      .toEqual([{ what: "transcribe-strips", used: 40, total: 57 }]);
  });

  it("**파일을 통째로 건너뛰었으면 숫자 없이 센다** — 몇 조각짜리인지 안 열어 봤다", () => {
    expect(stripCuts({ used: 40, wanted: 40, skippedFiles: 1 }))
      .toEqual([{ what: "transcribe-strips", used: 40 }]);
  });

  it("**다 읽었으면 아무 말도 안 한다**", () => {
    expect(stripCuts({ used: 12, wanted: 12, skippedFiles: 0 })).toEqual([]);
  });
});

