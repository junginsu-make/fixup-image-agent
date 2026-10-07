import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **칸 읽어내기 띠가 작업 영역을 줄이지 않는다**(2026-10-08).
 * 작업 영역 높이는 `useFitScreen` 이 박아 둔다. 띠가 자리를 차지하면 네 열이 줄고
 * 캔버스가 작아졌다 돌아온다. 띠는 자리를 차지하지 않고 위에 얹는다.
 */
const layout = readFileSync(new URL("../layout/layout-client.tsx", import.meta.url), "utf8");

describe("칸 읽어내기 띠 자리", () => {
  it("작업 영역 루트가 기준 자리(relative)다", () => {
    expect(layout).toMatch(/ref=\{fit\.rootRef\} className="relative [^"]*"/);
  });

  it("띠는 absolute 로 얹어 레이아웃 자리를 차지하지 않는다", () => {
    const start = layout.indexOf('busy === "analyze" ? (');
    const block = layout.slice(start, start + 500);
    expect(block).toContain("<WorkingStatus");
    expect(block).toMatch(/className="[^"]*absolute inset-x-0 top-0[^"]*"/);
    expect(block).not.toMatch(/className="[^"]*shrink-0/);
  });
});
