import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adExportHref } from "../href";

describe("결과에서 광고로 가는 주소", () => {
  it("표·작업·변형을 모두 싣는다", () => {
    expect(adExportHref("p1", 2)).toBe("/ad?source=poster&id=p1&position=2");
  });

  /** 0 은 실재하는 변형이다. 떨어뜨리면 첫 장이 안 골라진다. */
  it("0번도 싣는다", () => {
    expect(adExportHref("p1", 0)).toContain("position=0");
  });

  /** 작업 id 에 이상한 글자가 와도 주소를 깨뜨리지 않는다. */
  it("id 를 감싼다", () => {
    expect(adExportHref("a b&c=d", 1)).toBe("/ad?source=poster&id=a+b%26c%3Dd&position=1");
  });

  /**
   * **이 파일은 아무것도 안 들여야 한다.**
   *
   * 여기에 import 가 하나 붙는 순간 그것이 포스터 번들로 딸려 간다 —
   * 규격 목록을 별도 조각으로 뺀 일이 헛돈다.
   */
  it("잎 모듈로 남는다", () => {
    const source = readFileSync(new URL("../href.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
