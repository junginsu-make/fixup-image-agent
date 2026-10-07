import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **상세페이지 생성 띠는 갤러리를 굴려도 보인다**(2026-10-08).
 * `sticky` 는 부모 상자 안에서만 붙는다. 띠를 편집기 전체를 감싼 루트의 직계 자식으로
 * 두어야 끝까지 따라온다. 갤러리 막대(`sticky top-0`)와 안 겹치게 막대를 띠 높이만큼 내린다.
 */
const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

describe("생성 띠 고정", () => {
  it("띠는 안내 줄 묶음(작은 상자) 밖, 편집기 루트의 직계 자식으로 고정된다", () => {
    const i = editor.indexOf("<GenerationRunBanner");
    const before = editor.slice(Math.max(0, i - 700), i);
    expect(before).toMatch(/sticky top-0 z-40/);
    expect(before).not.toContain('className="mb-4 grid gap-2"');
  });

  it("도는 동안에만 고정한다", () => {
    expect(editor).toMatch(/generationRun\.status === "running" \? "sticky/);
  });

  it("갤러리 막대는 띠 높이만큼 내려 겹치지 않는다", () => {
    expect(editor).toContain("--run-banner-h");
    expect(editor).toMatch(/\[&_\.sticky\]:top-\[calc\(var\(--run-banner-h/);
  });
});
