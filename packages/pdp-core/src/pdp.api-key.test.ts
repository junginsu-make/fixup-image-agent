import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * AI 공급자 키 이름의 우선순위를 저장소 전체에서 같게 유지한다.
 *
 * 이름이 여러 개면 어느 쪽이 이기는지가 파일마다 갈리고, 두 키를 **다른 값**으로
 * 넣은 순간 경로마다 다른 키를 쓴다. 그러면 사용량이 갈라지고, 한쪽 키만 만료됐을 때
 * 일부 기능만 조용히 죽는다. 실제로 2026-07-29 에 apps/web 은 GOOGLE 우선,
 * pdp-core 는 GEMINI 우선으로 갈라져 있었다.
 *
 * 정본은 `apps/web/lib/server-keys.ts` 다: GOOGLE_API_KEY → GEMINI_API_KEY.
 */

const FILES = [
  "src/pdp.text-plan.ts",
  "src/pdp.style-picker.ts",
  "src/pdp.style-reference.ts",
];

describe("AI 키 이름 우선순위", () => {
  it("GEMINI_API_KEY 를 GOOGLE_API_KEY 보다 먼저 보지 않는다", () => {
    for (const file of FILES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(
        source,
        `${file} 이 GEMINI_API_KEY 를 먼저 본다. server-keys.ts 와 순서를 맞출 것`,
      ).not.toMatch(/process\.env\.GEMINI_API_KEY\s*\|\|\s*process\.env\.GOOGLE_API_KEY/);
    }
  });

  it("두 이름을 모두 받아들인다", () => {
    for (const file of FILES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, `${file} 에 GOOGLE_API_KEY 가 없다`).toContain("process.env.GOOGLE_API_KEY");
      expect(source, `${file} 에 GEMINI_API_KEY 대체가 없다`).toContain("process.env.GEMINI_API_KEY");
    }
  });
});
