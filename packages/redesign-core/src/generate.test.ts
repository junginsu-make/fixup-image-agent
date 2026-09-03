import { describe, it, expect } from "vitest";
import { buildAnalyzePrompt, buildSections, factsForSections, referencesWithCharacter } from "./generate.js";

const payload = { request: "", rolloutRequest: "", knowledgeText: "", options: { channel: "스마트스토어", ratio: "9:16", count: 1 } };
const modelInfo = { provider: "openai" as const, label: "OpenAI Image 2.0", id: "gpt-image-2-2026-04-21" };

describe("buildAnalyzePrompt", () => {
  it("injects the transcript block when transcript is present", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, "성분: 나이아신아마이드 2%");
    expect(p).toContain("<상세페이지_전사>");
    expect(p).toContain("나이아신아마이드 2%");
    expect(p).toContain("verified_facts");
  });
  it("omits the transcript block when absent", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, undefined);
    expect(p).not.toContain("<상세페이지_전사>");
  });
  it("trims the transcript to 60,000 chars", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, "a".repeat(70_000));
    expect(p).not.toContain("a".repeat(60_001));
  });
});

describe("factsForSections", () => {
  it("returns the array when present", () => {
    expect(factsForSections({ verified_facts: ["제2024-1호", "비타민C 500mg"] })).toEqual(["제2024-1호", "비타민C 500mg"]);
  });
  it("returns [] when missing or non-array (fallback/non-JSON path)", () => {
    expect(factsForSections({})).toEqual([]);
    expect(factsForSections({ verified_facts: "oops" })).toEqual([]);
    expect(factsForSections(null)).toEqual([]);
  });
});

/**
 * 색을 나열만 하면 생성 모델이 그 색을 글자색으로만 쓰고 면으로는 쓰지 않는다.
 * 상세페이지 쪽 A/B 실측(2026-07-30, gpt-image-2, 조건당 2장)에서 확인했다:
 *
 *   역할 지시문만(이미지 첨부만) → 0/2 이 색을 면으로 씀
 *   쓰임새 서술을 실음           → 2/2
 *
 * 리디자인도 원본 페이지 이미지를 첨부하는 구조라 같은 결함을 갖는다.
 */
describe("디자인 언어의 색 쓰임새", () => {
  it("분석에 design_language 를 요구한다", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, undefined);
    expect(p).toContain("design_language");
  });

  it("면을 채우는 색과 글자색을 갈라서 적으라고 말한다", () => {
    const p = buildAnalyzePrompt(payload, modelInfo, undefined);
    expect(p).toContain("colour_usage");
    expect(p).toContain("면을 채우는지");
    expect(p).toContain("글자");
    expect(p).toContain("강조");
  });

  it("색을 나열만 하면 안 되는 이유를 함께 준다", () => {
    // 이유 없이 형식만 주면 모델이 색 이름만 나열한 JSON 을 돌려준다.
    const p = buildAnalyzePrompt(payload, modelInfo, undefined);
    expect(p).toContain("글자색으로만");
  });
});


describe("등장인물 붙이기", () => {
  const front = { name: "front.png", mimeType: "image/png", buffer: Buffer.from("front") };
  const originals = ["a", "b", "c", "d", "e"].map((name) => ({
    name: `${name}.png`, mimeType: "image/png", buffer: Buffer.from(name),
  }));

  it("등장인물이 맨 앞에 온다", () => {
    // 정체성 기준이 먼저다. 뒤에 두면 상한에 잘려 나간다.
    const list = referencesWithCharacter(originals, front);
    expect(list[0]?.name).toBe("front.png");
  });

  it("상한을 넘지 않는다", () => {
    // 생성 함수가 4장에서 자른다. 넘겨 두면 원본이 조용히 사라진다.
    expect(referencesWithCharacter(originals, front).length).toBeLessThanOrEqual(4);
  });

  it("등장인물이 없으면 원본만 간다", () => {
    const list = referencesWithCharacter(originals, undefined);
    expect(list.map((entry) => entry.name)).toEqual(["a.png", "b.png", "c.png", "d.png"]);
  });

  it("원본이 상한보다 적으면 그대로 다 간다", () => {
    const list = referencesWithCharacter(originals.slice(0, 2), front);
    expect(list.map((entry) => entry.name)).toEqual(["front.png", "a.png", "b.png"]);
  });
});

describe("등장인물 지시문", () => {
  const base = { request: "", rolloutRequest: "", knowledgeText: "", options: { channel: "스마트스토어", ratio: "9:16", count: 1 } };

  it("섹션 프롬프트에 그대로 들어간다", () => {
    const sections = buildSections(1, 1, base, {}, modelInfo, "얼굴을 그대로 유지한다");
    expect(sections[0]!.promptText).toContain("얼굴을 그대로 유지한다");
  });

  it("없으면 그 이야기를 하지 않는다", () => {
    const sections = buildSections(1, 1, base, {}, modelInfo);
    expect(sections[0]!.promptText).not.toContain("얼굴을 그대로 유지한다");
  });

  it("모든 섹션에 붙는다", () => {
    // 한 섹션만 빠지면 그 장에서 다른 사람이 나온다.
    const sections = buildSections(4, 1, base, {}, modelInfo, "정체성 기준");
    for (const section of sections) expect(section.promptText).toContain("정체성 기준");
  });
});
