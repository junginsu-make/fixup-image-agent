import { describe, expect, it } from "vitest";
import { toReadableParagraphs } from "../readable-text";

describe("수집 원문 문단화", () => {
  it("짧은 자막 줄을 읽기 좋은 문단으로 묶는다", () => {
    const transcript = Array.from({ length: 30 }, (_unused, index) => `자막 ${index + 1}에서 설명하는 내용입니다.`).join("\n");
    const paragraphs = toReadableParagraphs(transcript);

    expect(paragraphs.length).toBeGreaterThan(1);
    expect(paragraphs.length).toBeLessThan(10);
    expect(paragraphs.every((paragraph) => paragraph.length <= 420)).toBe(true);
    expect(paragraphs.join(" ")).toContain("자막 1에서 설명하는 내용입니다. 자막 2에서 설명하는 내용입니다.");
  });

  it("이미 나뉜 문단 경계는 유지한다", () => {
    expect(toReadableParagraphs("첫 번째 문단입니다.\n\n두 번째 문단입니다.")).toEqual([
      "첫 번째 문단입니다.",
      "두 번째 문단입니다.",
    ]);
  });
});
