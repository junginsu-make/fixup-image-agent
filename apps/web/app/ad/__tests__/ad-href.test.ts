import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adExportHref } from "../href";

describe("결과에서 광고로 가는 주소", () => {
  /*
   * **그림 id 를 싣는다**(2026-09-29). 변형 번호를 실으면 고친 결과(번호 0) 밑의
   * 단추가 변형 1 을 골랐다.
   */
  it("표·작업·그림 id 를 싣는다", () => {
    expect(adExportHref("p1", "img-3")).toBe("/ad?source=poster&id=p1&image=img-3");
  });

  /** 작업 id 에 이상한 글자가 와도 주소를 깨뜨리지 않는다. */
  it("id 를 감싼다", () => {
    expect(adExportHref("a b&c=d", "x&y")).toBe("/ad?source=poster&id=a+b%26c%3Dd&image=x%26y");
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
