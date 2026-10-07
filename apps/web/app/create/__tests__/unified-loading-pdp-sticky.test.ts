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
    expect(before).toMatch(/sticky top-\[var\(--shell-head,0px\)\] z-30/);
    expect(before).not.toContain('className="mb-4 grid gap-2"');
  });

  it("도는 동안에만 고정한다", () => {
    expect(editor).toMatch(/generationRun\.status === "running" \? "sticky/);
  });

  it("갤러리 막대는 띠 높이만큼 내려 겹치지 않는다", () => {
    expect(editor).toContain("--run-banner-h");
    expect(editor).toMatch(/\[&_\.sticky\]:top-\[calc\(var\(--run-banner-h,0px\)\+var\(--shell-head,0px\)/);
  });

  /* **작은 화면 맨 위 메뉴 줄을 덮지 않는다**(2026-10-08 리뷰 M3). 둘 다 top-0·z-40 이라 띠가
     메뉴·크레딧을 생성 내내 가렸다. 도는 동안만 메뉴 줄 높이(h-14 + 테두리)만큼 내린다. */
  it("작은 화면에서는 메뉴 줄 아래에 붙는다", () => {
    expect(editor).toContain("[--shell-head:calc(3.5rem+1px)] lg:[--shell-head:0px]");
    expect(editor).not.toMatch(/sticky top-0 z-40/);
  });

  /* **편집 화면 왼쪽 칸도 띠 아래로 내린다**(2026-10-08 리뷰 M4). */
  it("편집 화면 왼쪽 고정 칸도 띠 높이만큼 내린다", () => {
    expect(editor).toContain("xl:top-[calc(var(--run-banner-h,0px)+1.5rem)]");
    expect(editor).not.toContain("xl:sticky xl:top-6");
  });
});
