import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 마크는 **첫 화면 로고와 같아야 한다.** 원본은
 * `apps/web/public/brand/mcs-mark-{dark,light}-bg.svg` 이고, 이 컴포넌트는
 * 스튜디오 사이드바와 가입·로그인 화면이 쓴다. 둘이 갈리면 같은 서비스인데
 * 화면마다 다른 로고가 뜬다.
 *
 * jsdom 이 없는 저장소라 컴포넌트를 그려 볼 수 없다. 소스를 글자로 읽어
 * **원본 svg 의 모양과 맞댄다** — 사각형 셋의 좌표·크기·모서리가 같은지.
 */
const HERE = path.join(process.cwd(), "src/components");
const BRAND = path.join(process.cwd(), "../../apps/web/public/brand");

const mark = readFileSync(path.join(HERE, "brand-mark.tsx"), "utf8");

/** svg 원본에서 사각형 좌표만 뽑는다. 색과 c2pa 메타데이터는 뺀다. */
function rects(svg: string): string[] {
  return [...svg.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"/g)]
    .map((found) => found.slice(1).join(","));
}

describe("MCS 마크", () => {
  it("원본 svg 와 모양이 같다", () => {
    const original = rects(readFileSync(path.join(BRAND, "mcs-mark-dark-bg.svg"), "utf8"));
    expect(original.length, "원본에서 사각형을 못 읽었다").toBe(3);
    expect(rects(mark)).toEqual(original);
  });

  it("밝은 배경용과 어두운 배경용의 모양이 서로 같다", () => {
    // 둘은 색만 다르다. 그래서 한 벌로 합칠 수 있었다.
    expect(rects(readFileSync(path.join(BRAND, "mcs-mark-light-bg.svg"), "utf8")))
      .toEqual(rects(readFileSync(path.join(BRAND, "mcs-mark-dark-bg.svg"), "utf8")));
  });

  it("회색 둘은 글자색을 따라간다 — 테마 양쪽에서 보여야 한다", () => {
    // 색을 박으면 한쪽 테마에서 배경에 묻힌다. 이 컴포넌트가 붙는 두 화면은
    // 첫 화면과 달리 테마를 따라간다.
    expect(mark.match(/fill="currentColor"/g)).toHaveLength(2);
    expect(mark).not.toContain('fill="#F2F2F0"');
    expect(mark).not.toContain('fill="#08080A"');
  });

  it("액센트 초록만 고정이다", () => {
    // 브랜드를 알아보게 하는 자리다. 테마를 따라가면 안 된다.
    const accent = /fill="#6EE7A8"/g;
    expect(mark.match(accent)).toHaveLength(1);
    expect(readFileSync(path.join(BRAND, "mcs-mark-dark-bg.svg"), "utf8").match(accent)).toHaveLength(1);
  });
});
