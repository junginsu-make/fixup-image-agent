import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../prompt";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과" as const,
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

const images = [
  { kind: "style_reference" as const, title: "SNAP" },
  { kind: "preserved" as const, title: "제품 사진" },
];

const size = { width: 1024, height: 1536 };

describe("포스터 프롬프트", () => {
  const prompt = buildPosterPrompt({ slots, images, size });

  it("첨부마다 역할을 번호로 알려준다", () => {
    expect(prompt).toMatch(/Image 1 is[\s\S]*REFERENCE/);
    expect(prompt).toMatch(/Image 2 is[\s\S]*PRESERVED/);
  });

  it("보존 대상이 스타일보다 우선한다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("이전 결과를 붙이지 않는다 — 앵커가 없다", () => {
    expect(prompt).not.toMatch(/same series/i);
    expect(prompt).not.toMatch(/Only the content differs/i);
    expect(prompt).not.toMatch(/previous/i);
  });

  it("비어 있지 않은 글자 칸마다 자리를 준다", () => {
    for (const value of ["가을, 셔터를 누르다", "필름으로 담은 도시의 온도", "28MM F2.0", "ISO 400"]) {
      expect(prompt).toContain(value);
    }
  });

  it("길면 줄이지 말고 작게 넣으라고 한다", () => {
    expect(prompt).toMatch(/smaller font|more lines/i);
    expect(prompt).toMatch(/Do not omit|do not shorten/i);
  });

  it("원고에 없는 것을 지어내지 말라고 한다", () => {
    expect(prompt).toMatch(/copyright/i);
    expect(prompt).toMatch(/Do not invent/i);
  });

  it("배경 글자는 금지가 아니라 자제다", () => {
    // 간판·표지판까지 막으면 그림이 어색해진다. 2026-08-20 결정.
    expect(prompt).toMatch(/sparse|subordinate/i);
    expect(prompt).not.toMatch(/not listed above/i);
  });

  it("타이포 관계를 따로 말한다", () => {
    expect(prompt).toMatch(/통과|through/i);
  });

  it("금지 항목을 전한다", () => {
    expect(prompt).toContain("로고, 워터마크");
  });

  it("출력 크기를 명시한다", () => {
    expect(prompt).toContain("1024x1536");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    expect(prompt).not.toMatch(/\d+\s*characters/i);
  });

  it("빈 슬롯만 있어도 프롬프트가 깨지지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare.length).toBeGreaterThan(0);
    expect(bare).toContain("1024x1536");
  });

  it("글자 칸이 하나도 없으면 렌더 지시를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare).not.toMatch(/Render this/i);
  });
});
