import { describe, expect, it } from "vitest";
import { FALLBACK_SLIDES, MIN_SLIDES, slidesFromShowcase } from "../slides";
import type { ShowcaseView } from "../../../api/showcase/core";

/**
 * 첫 화면에 무엇이 걸리는가.
 *
 * 관리자가 `/library` 에서 고른 것이 여기로 온다. 이 판단이 틀리면 **첫 화면이
 * 텅 비거나**, 반대로 고른 것을 무시하고 기본값만 돌린다. 둘 다 조용히 일어난다.
 */

const item = (id: string, over: Partial<ShowcaseView> = {}): ShowcaseView => ({
  id,
  url: `/api/showcase/${id}/file`,
  thumbUrl: `/api/showcase/${id}/file?size=thumb`,
  width: 1024,
  height: 1024,
  caption: null,
  kindLabel: null,
  ...over,
});

describe("관리자가 아무것도 안 골랐을 때", () => {
  it("기본값을 그대로 건다 — 첫 화면이 비어 있으면 안 된다", () => {
    expect(slidesFromShowcase([])).toEqual(FALLBACK_SLIDES);
  });
});

describe("관리자가 고른 것이 있을 때", () => {
  const 고른것 = Array.from({ length: 8 }, (_, i) => item(`id-${i}`));

  it("고른 것만 건다", () => {
    const slides = slidesFromShowcase(고른것);
    expect(slides).toHaveLength(8);
    expect(slides.every((slide) => slide.src.includes("/api/showcase/"))).toBe(true);
  });

  /** 첫 화면이 원본 여덟 장을 받아 오면 느리다. 판 하나는 화면의 절반도 안 된다. */
  it("작은 사본을 쓴다", () => {
    expect(slidesFromShowcase(고른것)[0]!.src).toContain("size=thumb");
  });

  it("적어 둔 설명과 도구 이름을 쓴다", () => {
    const slides = slidesFromShowcase([item("a", { caption: "겨울 트렌드", kindLabel: "상세페이지" })]);
    expect(slides[0]!.label).toBe("겨울 트렌드");
    expect(slides[0]!.kind).toBe("상세페이지");
  });

  it("설명이 비어 있어도 빈 글자를 안 남긴다", () => {
    const slides = slidesFromShowcase([item("a", { caption: "   ", kindLabel: null })]);
    expect(slides[0]!.label.trim().length).toBeGreaterThan(0);
    expect(slides[0]!.kind.trim().length).toBeGreaterThan(0);
  });
});

describe("고른 것이 몇 장뿐일 때", () => {
  /** 두세 장이면 한 바퀴가 너무 짧아 같은 그림이 금세 다시 온다. */
  it("모자란 만큼만 기본값으로 채운다", () => {
    const slides = slidesFromShowcase([item("a"), item("b")]);

    expect(slides).toHaveLength(MIN_SLIDES);
    expect(slides[0]!.src).toContain("/api/showcase/a");
    expect(slides[1]!.src).toContain("/api/showcase/b");
    // 고른 것이 앞, 채운 것이 뒤.
    expect(slides[2]!.src).toBe(FALLBACK_SLIDES[0]!.src);
  });

  it("상한을 넘겨 고르면 채우지 않는다", () => {
    const 많이 = Array.from({ length: MIN_SLIDES + 3 }, (_, i) => item(`x-${i}`));
    const slides = slidesFromShowcase(많이);

    expect(slides).toHaveLength(MIN_SLIDES + 3);
    expect(slides.every((slide) => slide.src.includes("/api/showcase/"))).toBe(true);
  });
});
