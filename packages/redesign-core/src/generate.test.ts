import { describe, it, expect } from "vitest";
import {
  buildAnalyzePrompt,
  buildAttachmentRoleDirective,
  buildSections,
  factsForSections,
  characterSlots,
  referencesWithCharacter,
} from "./generate.js";

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
    const list = referencesWithCharacter(originals, [front]);
    expect(list[0]?.name).toBe("front.png");
  });

  it("상한을 넘지 않는다", () => {
    // 생성 함수가 4장에서 자른다. 넘겨 두면 원본이 조용히 사라진다.
    expect(referencesWithCharacter(originals, [front]).length).toBeLessThanOrEqual(4);
  });

  it("등장인물이 없으면 원본만 간다", () => {
    const list = referencesWithCharacter(originals, []);
    expect(list.map((entry) => entry.name)).toEqual(["a.png", "b.png", "c.png", "d.png"]);
  });

  it("원본이 상한보다 적으면 그대로 다 간다", () => {
    const list = referencesWithCharacter(originals.slice(0, 2), [front]);
    expect(list.map((entry) => entry.name)).toEqual(["front.png", "a.png", "b.png"]);
  });

  /**
   * 사람이 각도를 여러 장 고를 수 있게 됐다(2026-09-15). 그런데 첨부 상한이
   * 4장이라, 고른 대로 다 넣으면 **원본 상세페이지가 밀려난다** — 리디자인할
   * 대상이 사라지고 모델은 기억으로 그린다.
   *
   * 그래서 원본 자리를 **최소 한 장** 남긴다. 각도를 덜 쓰는 편이 원본을 잃는
   * 것보다 낫다.
   */
  describe("각도를 여러 장 고르면", () => {
    const 각도 = (name: string) => ({
      name: `${name}.png`, mimeType: "image/png", buffer: Buffer.from(name),
    });
    const 넷 = ["front", "left", "right", "back"].map(각도);

    it("고른 각도가 모두 맨 앞에 온다", () => {
      const list = referencesWithCharacter(originals.slice(0, 1), 넷.slice(0, 3));
      expect(list.map((entry) => entry.name)).toEqual(["front.png", "left.png", "right.png", "a.png"]);
    });

    it("고른 차례를 지킨다", () => {
      const list = referencesWithCharacter([], [각도("back"), 각도("front")]);
      expect(list.map((entry) => entry.name)).toEqual(["back.png", "front.png"]);
    });

    /** 이것이 핵심이다. 원본이 밀려나면 리디자인이 아니라 새로 그리기가 된다. */
    it("원본 자리를 최소 한 장 남긴다", () => {
      const list = referencesWithCharacter(originals, 넷);
      expect(list).toHaveLength(4);
      expect(list.filter((entry) => entry.name === "a.png")).toHaveLength(1);
      expect(list.map((entry) => entry.name)).toEqual([
        "front.png", "left.png", "right.png", "a.png",
      ]);
    });

    it("원본이 없으면 각도가 상한까지 다 간다", () => {
      expect(referencesWithCharacter([], 넷)).toHaveLength(4);
    });

    it("각도를 안 고르면 지금까지대로다", () => {
      const list = referencesWithCharacter(originals, []);
      expect(list.map((entry) => entry.name)).toEqual(["a.png", "b.png", "c.png", "d.png"]);
    });
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

/**
 * 첨부한 원본에 역할 지시를 붙인다.
 *
 * 여기가 비어 있었다. 원본 상세페이지를 그대로 첨부하면서 프롬프트에는
 * 「원본 참조: 제품컷, 대표 USP」 같은 섹션 템플릿 라벨만 붙였다 — 그 라벨은
 * 「이 섹션에서 원본의 어느 대목을 쓰라」는 말이지, 첨부된 그림이 무엇인지를
 * 알려 주는 말이 아니다.
 */
describe("첨부 원본 역할 지시", () => {
  it("첨부가 없으면 아무 말도 하지 않는다", () => {
    expect(buildAttachmentRoleDirective({ originalCount: 0, characterCount: 0 })).toBe("");
  });

  it("무엇을 지키고 무엇을 다시 짜는지 밝힌다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 1, characterCount: 0 });
    expect(directive.startsWith("Study every attached image closely")).toBe(true);
    expect(directive).toContain("[Image 1 — ORIGINAL DETAIL PAGE]");
    expect(directive).toContain("spelled exactly as shown");
    expect(directive).toContain("Never redesign, restyle or substitute the product itself.");
  });

  // 「색·서체까지 마음대로 새로 디자인하라」고 쓰면 designLanguageBlock 및
  // 「브랜드 색·폰트 감각은 유지」 규칙과 정면충돌한다.
  it("다시 짜는 것은 제품이 아니라 페이지 구성이라고 말한다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 2, characterCount: 0 });
    expect(directive).toContain("What you redesign is the page, not the product");
    expect(directive).toContain("the brand's design language");
  });

  it("여러 장이면 범위로 적는다", () => {
    expect(buildAttachmentRoleDirective({ originalCount: 3, characterCount: 0 })).toContain(
      "[Images 1-3 — ORIGINAL DETAIL PAGE]",
    );
  });

  // referencesWithCharacter 가 인물을 맨 앞에 놓는다. 번호가 어긋나면
  // 모델이 인물 사진을 원본 페이지로 읽는다.
  it("등장인물이 있으면 그것이 1번이고 원본은 2번부터다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 2, characterCount: 1 });
    expect(directive).toContain("[Image 1 — PERSON]");
    expect(directive).toContain("[Images 2-3 — ORIGINAL DETAIL PAGE]");
  });

  it("섹션 프롬프트에 실린다", () => {
    const base = { request: "", rolloutRequest: "", knowledgeText: "", options: { channel: "스마트스토어", ratio: "9:16", count: 1 } };
    const sections = buildSections(2, 1, base, {}, modelInfo, undefined, {
      attachmentDirective: buildAttachmentRoleDirective({ originalCount: 1, characterCount: 0 }),
    });
    for (const section of sections) {
      expect(section.promptText).toContain("[Image 1 — ORIGINAL DETAIL PAGE]");
    }
  });
});

describe("사용자 지시와 결", () => {
  const withRequest = (request: string) => ({
    request,
    rolloutRequest: "",
    knowledgeText: "",
    options: { channel: "스마트스토어", ratio: "9:16", count: 1 },
  });

  it("추가 요청사항이 프롬프트 맨 앞과 맨 뒤에 두 번 들어간다", () => {
    const prompt = buildSections(1, 1, withRequest("배경은 밤, 창밖에 네온"), {}, modelInfo)[0]!.promptText;
    expect(prompt.startsWith("USER INSTRUCTION")).toBe(true);
    // 긴 프롬프트에서 중간 문장은 힘을 잃는다(2026-09-04 실측). 그래서 양끝이다.
    // 가운데의 「추가 요청사항: …」 줄은 기존 그대로 남는다 — 그 줄은 채널·섹션과
    // 함께 읽히는 맥락이라 빼지 않았다. 그래서 셋이 된다.
    expect(prompt.trimEnd().endsWith("배경은 밤, 창밖에 네온")).toBe(true);
    expect(prompt).toContain("Before drawing, re-read the USER INSTRUCTION");
    expect(prompt.split("배경은 밤, 창밖에 네온").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("비어 있으면 한 줄도 안 들어간다", () => {
    const prompt = buildSections(1, 1, withRequest(""), {}, modelInfo)[0]!.promptText;
    expect(prompt).not.toContain("USER INSTRUCTION");
  });

  it("공백만 적었으면 없는 것으로 본다", () => {
    const prompt = buildSections(1, 1, withRequest("   \n "), {}, modelInfo)[0]!.promptText;
    expect(prompt).not.toContain("USER INSTRUCTION");
  });

  it("기본 결(auto)은 아무 말도 보태지 않는다 — 원본의 결을 따라간다", () => {
    const prompt = buildSections(1, 1, withRequest(""), {}, modelInfo)[0]!.promptText;
    expect(prompt).not.toMatch(/cel-shaded/i);
    expect(prompt).not.toContain("Realism:");
  });

  it("애니를 고르면 그 결 지시문이 들어간다", () => {
    const prompt = buildSections(1, 1, withRequest(""), {}, modelInfo, undefined, { look: "anime" })[0]!.promptText;
    expect(prompt).toMatch(/cel-shaded/i);
    expect(prompt).not.toContain("Realism:");
  });

  it("사용자 지시가 있으면 그것이 맨 위라고 적는다", () => {
    const prompt = buildSections(1, 1, withRequest("네온"), {}, modelInfo)[0]!.promptText;
    expect(prompt).toContain("Priority when instructions conflict: the USER INSTRUCTION");
    expect(prompt).toContain("the PRESERVED SUBJECT");
  });
});

/**
 * 자르는 규칙이 **한 곳**에만 있어야 한다.
 *
 * 첨부를 담는 쪽과 프롬프트에 번호를 적는 쪽이 따로 세면, 상한에 걸린 날
 * 「Image 4 — PERSON」이라고 적어 놓고 4번에는 원본이 붙는다.
 */
describe("붙는 인물 장수", () => {
  const 그림 = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from(name) });

  it("담긴 것과 센 것이 같다", () => {
    for (const 원본수 of [0, 1, 3, 5]) {
      for (const 각도수 of [0, 1, 2, 4]) {
        const originals = Array.from({ length: 원본수 }, (_, i) => 그림(`o${i}`));
        const characters = Array.from({ length: 각도수 }, (_, i) => 그림(`c${i}`));
        const list = referencesWithCharacter(originals, characters);
        const 센것 = characterSlots(원본수, 각도수);

        expect(list.filter((entry) => entry.name.startsWith("c"))).toHaveLength(센것);
      }
    }
  });

  it("원본이 있으면 인물은 상한보다 한 장 적게까지만", () => {
    expect(characterSlots(1, 9)).toBe(3);
    expect(characterSlots(0, 9)).toBe(4);
  });
});

/**
 * 각도가 여럿이면 **같은 사람이라고 말해야** 한다.
 *
 * 안 말하면 모델이 서로 다른 사람 여럿으로 읽고 절충해 제3의 인물을 만든다
 * (2026-07-30 실측). 오래 한 장만 보냈던 이유가 그것이고, 이제 여러 장을 보내는
 * 대신 말로 막는다.
 */
describe("각도가 여럿일 때의 지시문", () => {
  it("같은 사람의 다른 각도라고 말한다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 1, characterCount: 3 });

    expect(directive).toContain("SAME character seen from different angles");
    expect(directive).toContain("Do NOT reproduce their poses");
    expect(directive).toContain("Generate exactly one person");
  });

  /** 한 장이면 할 말이 없다. 넣으면 없는 각도를 찾게 만든다. */
  it("한 장이면 그 말을 안 한다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 1, characterCount: 1 });

    expect(directive).not.toContain("SAME character seen from different angles");
  });

  /** 번호가 첨부 순서와 갈라지면 모델이 엉뚱한 그림을 인물로 읽는다. */
  it("각도마다 번호를 매기고 원본은 그 다음부터다", () => {
    const directive = buildAttachmentRoleDirective({ originalCount: 2, characterCount: 2 });

    expect(directive).toContain("[Image 1 — PERSON]");
    expect(directive).toContain("[Image 2 — PERSON]");
    expect(directive).toContain("[Images 3-4 — ORIGINAL DETAIL PAGE]");
  });
});
