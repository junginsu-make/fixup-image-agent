import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REFERENCE_MAX_HEIGHT,
  REFERENCE_MAX_WIDTH,
  referenceRenderScale,
} from "../redesign-files";
import { STYLE_REFERENCE_MAX_PIXELS } from "../../../lib/pdp/reference-limits";

/**
 * **같은 원본이 확장자에 따라 갈렸다**(F-7-1).
 *
 * 화면은 참조 그림을 줄여 올리는데 **PDF 갈래만 줄이지 않았다.**
 *
 *   1080×15000 을 PNG 로   → 조각내고 줄여 518×1800
 *   같은 것을 PDF 로       → 1728×24000 = **41.5백만 화소**
 *
 * 서버에 문지기가 생긴 뒤로 뒤쪽이 413 으로 막힌다. 사용자에게는 「줄여서
 * 올려 주세요」라고 하는데 PDF 라 줄일 방법이 없다.
 */

/** 문지기가 받는 한도. 이 값과 짝이다. */
const 상한화소 = STYLE_REFERENCE_MAX_PIXELS;

const 결과화소 = (width: number, height: number, base = 1) => {
  const scale = referenceRenderScale(width, height, base);
  return Math.round(width * scale) * Math.round(height * scale);
};

describe("줄인 결과가 문지기를 지난다", () => {
  it.each([
    ["한 장짜리 긴 상세페이지 PDF", 1080, 14468, 1.6],
    ["더 긴 것", 1080, 40000, 1.6],
    ["아주 넓은 것", 20000, 20000, 1.6],
    ["긴 이미지 한 조각", 1080, 3750, 1],
    ["보통 A4", 595, 842, 1.6],
  ])("**%s 가 상한 아래로 내려온다**", (_label, width, height, base) => {
    expect(결과화소(width, height, base)).toBeLessThanOrEqual(상한화소);
  });

  it.each([
    ["한 장짜리 긴 상세페이지 PDF", 1080, 14468, 1.6],
    ["아주 넓은 것", 20000, 20000, 1.6],
  ])("**%s 가 폭·높이 한도 안이다**", (_label, width, height, base) => {
    const scale = referenceRenderScale(width, height, base);

    expect(Math.round(width * scale)).toBeLessThanOrEqual(REFERENCE_MAX_WIDTH);
    expect(Math.round(height * scale)).toBeLessThanOrEqual(REFERENCE_MAX_HEIGHT);
  });
});

describe("되던 것을 잃지 않는다", () => {
  /**
   * **보통 PDF 는 전과 똑같아야 한다.** A4(595×842pt)는 1.6 배로 키워도
   * 952×1347 이라 한도 안이다 — 글씨를 읽히려고 키우는 것이라 줄이면 손해다.
   */
  it("**A4 는 그대로 1.6 배다**", () => {
    expect(referenceRenderScale(595, 842, 1.6)).toBe(1.6);
  });

  it("**작은 이미지는 키우지 않는다** — 기준 배율이 1 이다", () => {
    expect(referenceRenderScale(400, 600)).toBe(1);
  });

  it("**한도보다 큰 이미지는 줄인다**", () => {
    expect(referenceRenderScale(2400, 1800)).toBe(0.5);
  });

  it.each([
    ["0", 0, 100],
    ["음수", -5, 100],
    ["숫자가 아님", Number.NaN, 100],
    ["무한", Number.POSITIVE_INFINITY, 100],
  ])("**크기가 %s 여도 쓸 수 있는 배율을 낸다**", (_label, width, height) => {
    const scale = referenceRenderScale(width, height, 1.6);

    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });
});

/**
 * **자를 만들어 두고 안 쓰면 아무것도 안 고친 것이다**(X-07 의 교훈).
 *
 * 깨진 갈래는 `renderPdfToImages` 다. 그 안은 pdfjs 와 캔버스를 쓰므로 여기서
 * 돌려 볼 수 없다. **글로 잠근다** — 다른 방법이 없어서이지 이것이 더 나아서가
 * 아니다. 변이로 확인했다: 그 한 줄을 `scale: 1.6` 으로 되돌려도 위 시험은
 * 전부 초록이었다.
 */
describe("두 갈래가 같은 자를 쓴다", () => {
  const 읽기 = () =>
    readFileSync(new URL("../redesign-files.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("**PDF 갈래가 자를 쓴다**", () => {
    const source = 읽기();
    const pdf = source.slice(source.indexOf("export async function renderPdfToImages"));

    expect(pdf).toContain("referenceRenderScale(");
  });

  it("**PDF 갈래가 배율을 직접 적지 않는다**", () => {
    const source = 읽기();
    const pdf = source.slice(source.indexOf("export async function renderPdfToImages"));

    // `getViewport({ scale: 1.6 })` 처럼 상수를 그대로 쓰면 한도를 안 본다.
    expect(pdf).not.toMatch(/getViewport\(\{\s*scale:\s*1\.6\s*\}\)/);
  });

  it("**이미지 갈래도 같은 자를 쓴다**", () => {
    const source = 읽기();
    const crop = source.slice(source.indexOf("export async function cropImageToPngFile"));

    expect(crop.slice(0, 1200)).toContain("referenceRenderScale(");
  });
});

