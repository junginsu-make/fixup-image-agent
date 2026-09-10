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

const original = readFileSync(path.join(BRAND, "mcs-mark-dark-bg.svg"), "utf8");
const originalLight = readFileSync(path.join(BRAND, "mcs-mark-light-bg.svg"), "utf8");

/**
 * 사각형의 **모양과 짙기**를 뽑는다. 색과 c2pa 메타데이터는 뺀다.
 *
 * 좌표만 재면 안 된다. 불투명도 둘(0.35 · 0.7)이 겹쳐 쌓인 깊이감을 만드는데,
 * 뒤집거나 지워도 좌표는 그대로라 시험이 안 잡는다.
 *
 * 원본 svg 는 `fill-opacity`(kebab), TSX 는 `fillOpacity`(camel) 라 먼저 맞춘다.
 */
function rects(svg: string): string[] {
  const normalized = svg.replace(/fillOpacity=/g, "fill-opacity=");
  return [...normalized.matchAll(
    /x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"(?:[^/>]*?fill-opacity="([\d.]+)")?/g,
  )].map((found) => [...found.slice(1, 6), found[6] ?? "1"].join(","));
}

describe("MCS 마크", () => {
  it("원본 svg 와 모양·짙기가 같다", () => {
    const want = rects(original);
    expect(want.length, "원본에서 사각형을 못 읽었다").toBe(3);
    // 짙기가 실제로 잡혔는지 먼저 본다 — 정규식이 헛돌면 셋 다 "1" 이 된다.
    expect(want.map((row) => row.split(",")[5])).toEqual(["0.35", "0.7", "1"]);
    expect(rects(mark)).toEqual(want);
  });

  it("밝은 배경용과 어두운 배경용의 모양이 서로 같다", () => {
    // 둘은 색만 다르다. 그래서 한 벌로 합칠 수 있었다.
    expect(rects(originalLight)).toEqual(rects(original));
  });

  /**
   * **`viewBox` 를 따로 잰다.** 사각형 좌표만 맞대면 이것이 빠진다 —
   * 옛 마크의 `0 0 88 88` 로 되돌아가도 좌표는 그대로라 시험이 초록인데,
   * 화면에서는 마크가 상자 왼쪽 위에 1/3 크기로 찌그러진다.
   */
  it("원본과 같은 viewBox 를 쓴다", () => {
    const want = /viewBox="([^"]+)"/.exec(original);
    expect(want, "원본에서 viewBox 를 못 읽었다").toBeTruthy();
    expect(mark).toContain(`viewBox="${want![1]}"`);
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
    expect(original.match(accent)).toHaveLength(1);
  });
});
