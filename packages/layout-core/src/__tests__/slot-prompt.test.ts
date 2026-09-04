import { describe, expect, it } from "vitest";
import { buildSlotPrompt, slotAspectLabel } from "../slot-prompt";

const STYLE_BLOCK = "Image 1 is the cover CARD-NEWS REFERENCE for this card.";

describe("slotAspectLabel", () => {
  it("깔끔하게 떨어지는 비율은 이름으로 말한다", () => {
    expect(slotAspectLabel({ width: 544, height: 544 })).toBe("1:1");
    expect(slotAspectLabel({ width: 1088, height: 1360 })).toBe("4:5");
    expect(slotAspectLabel({ width: 2048, height: 1152 })).toBe("16:9");
  });

  it("떨어지지 않으면 픽셀로 말한다", () => {
    expect(slotAspectLabel({ width: 435, height: 803 })).toBe("435×803");
  });
});

describe("buildSlotPrompt", () => {
  const slot = { kind: "image" as const, box: { x: 0, y: 0, width: 1, height: 0.5 } };

  it("칸 비율을 먼저 말한다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt.split("\n")[0]).toContain("1:1");
  });

  /**
   * 안 넣으면 모델이 그림 안에 제목을 그려서 우리가 그린 글자와 겹친다.
   * 이 기능의 존재 이유가 바로 그것이라 빠지면 안 된다.
   */
  it("글자를 넣지 말라고 반드시 말한다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt).toContain("No text, no letters, no numbers");
  });

  it("칸에 적은 설명이 있으면 그것을 쓴다", () => {
    const prompt = buildSlotPrompt({
      slot: { ...slot, brief: "창밖을 보는 고양이" },
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt).toContain("창밖을 보는 고양이");
    expect(prompt).not.toContain("책상 위 노트북");
  });

  it("칸에 적은 설명이 없으면 카드 기획의 그림 설명을 쓴다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt).toContain("책상 위 노트북");
  });

  it("레퍼런스 지시를 그대로 싣는다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt).toContain(STYLE_BLOCK);
  });

  it("레퍼런스가 없어도 프롬프트는 나온다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: "",
    });

    expect(prompt).toContain("No text, no letters, no numbers");
    expect(prompt).not.toContain("Style:\n\n");
  });

  /**
   * 두 번 넣는 이유: 긴 프롬프트에서 가운데 문장은 힘을 잃는다(2026-09-04 실측).
   */
  it("사용자가 친 지시는 맨 앞과 맨 뒤 양쪽에 들어간다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
      userInstruction: "배경은 밤",
    });

    expect(prompt.startsWith("USER INSTRUCTION")).toBe(true);
    expect(prompt.trimEnd().endsWith("배경은 밤")).toBe(true);
    expect(prompt.match(/배경은 밤/g)).toHaveLength(2);
  });

  it("지시를 안 적었으면 그 줄 자체가 없다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
    });

    expect(prompt).not.toMatch(/USER INSTRUCTION/);
    expect(prompt.split("\n")[0]).toContain("1:1");
  });

  it("결이 auto 면 결에 대해 아무 말도 보태지 않는다", () => {
    // 지금까지의 동작(첨부 레퍼런스의 결을 따라감)이 유지돼야 쓰던 사람이 안 깨진다.
    const base = { slot, rect: { width: 544, height: 544 }, visualBrief: "책상 위 노트북", styleBlock: STYLE_BLOCK };
    expect(buildSlotPrompt({ ...base, look: "auto" })).toBe(buildSlotPrompt(base));
    expect(buildSlotPrompt(base)).not.toMatch(/Rendering style/i);
  });

  it("고른 결이 있으면 지시문이 들어간다", () => {
    const prompt = buildSlotPrompt({
      slot,
      rect: { width: 544, height: 544 },
      visualBrief: "책상 위 노트북",
      styleBlock: STYLE_BLOCK,
      look: "anime",
    });

    expect(prompt).toMatch(/cel-shaded/i);
    expect(prompt).toMatch(/overrides the rendering style/i);
  });
});
