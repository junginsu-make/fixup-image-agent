import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 라이브러리 화면이 「캐릭터」 단추의 숫자를 **개수만** 묻는다(2026-10-08 사용자 요청).
 * 이 저장소에는 jsdom 이 없어 화면 코드의 문장을 직접 본다.
 */
const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

/**
 * **「캐릭터」는 별도 화면이 아니다**(2026-10-08 사용자 보고 — 누르면 다른 페이지 같았다). 작업물 목록이
 * 캐릭터만 걸러 보인다. 숫자도 그 목록에서 센다 — 따로 묻지 않는다.
 */
describe("캐릭터", () => {
  it("별도 캐릭터 화면을 그리지 않는다", () => {
    expect(source).not.toContain("CharactersTab");
  });

  it("개수를 따로 묻지 않는다", () => {
    expect(source).not.toContain("count=1");
  });
});
