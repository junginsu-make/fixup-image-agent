import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 라이브러리 화면이 「캐릭터」 단추의 숫자를 **개수만** 묻는다(2026-10-08 사용자 요청).
 * 이 저장소에는 jsdom 이 없어 화면 코드의 문장을 직접 본다.
 */
const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("캐릭터 숫자", () => {
  it("관리자 전체 범위로 개수만 묻는다", () => {
    expect(source).toContain('"/api/characters?scope=all&count=1"');
  });

  it("한 줄 거르기에 넘긴다", () => {
    expect(source).toContain("characterCount={characterCount}");
  });
});
