import { describe, expect, it } from "vitest";
import { GROUNDING_RULE, NEVER_FABRICATE } from "@fixup/shared";
import { PRODUCT_GROUNDING_RULES } from "@fixup/pdp-core";
import { buildAnalyzePrompt, buildSections, editSection } from "@fixup/redesign-core";

/**
 * **두 코어가 근거 규칙을 따로 썼다**(F-7-1).
 *
 * 설계 §14.6: 「별도 코어의 참조·검수·예산·**근거 규칙 불일치** | **공통
 * 실행/검수 계약 공유**, 도메인 전체 병합은 하지 않음 | W3/W5/W8」.
 *
 * 같은 말을 네 곳이 조금씩 다르게 적고 있었다.
 *
 *   상세페이지 · 제품 읽기   효능 · 수치 · 인증 · 후기 를 지어내지 않는다
 *   리디자인 · 분석          근거 없는 수치 · 「효과」 · 「리뷰」 · 인증
 *   리디자인 · 섹션          근거 없는 수치 · 리뷰 · 인증 · 효과
 *   리디자인 · 수정          근거 없는 효능 · 리뷰 · 인증 · 수치
 *
 * 「효과」와 「효능」, 「리뷰」와 「후기」는 사람에게는 같은 말이지만 **계약으로
 * 보면 네 벌**이다. 한 곳을 고쳐도 나머지 셋은 그대로 남고, 어느 것이 맞는지
 * 아무도 모른다.
 *
 * **도메인을 합치지 않는다.** 상세페이지는 상세페이지대로, 리디자인은
 * 리디자인대로 제 프롬프트를 쓴다. 다만 **지어내면 안 되는 것의 목록**은
 * 한 벌이어야 한다.
 */

const 분석프롬프트 = buildAnalyzePrompt(
  { request: "밝게", rolloutRequest: "", knowledgeText: "", options: { channel: "smartstore", ratio: "3:4", count: 4 } },
  { label: "정밀형", id: "test-model" },
);

const 섹션프롬프트 = buildSections(
  1, 1,
  { request: "밝게", rolloutRequest: "", knowledgeText: "", options: { channel: "smartstore", ratio: "3:4", count: 1 } },
  { strategy: "좋다" },
  { provider: "openai", label: "정밀형", id: "test-model" } as never,
)[0]!.promptText;

/**
 * **고치는 길도 같은 계약이다.**
 *
 * 조립기가 따로 없어 실제로 돌려서 받아 적는다 — 그림 통로를 주면 모델을
 * 안 부르고 프롬프트만 여기로 온다.
 */
const 수정프롬프트 = await (async () => {
  let 받은것 = "";
  await editSection({
    imageUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    request: "글자를 키워 주세요",
    section: { id: "S1", name: "첫 섹션" },
    project: { title: "작업" },
    openaiKey: "sk-test",
    generateImage: async (request: { prompt: string }) => {
      받은것 = request.prompt;
      return { buffer: Buffer.from("AAA"), mimeType: "image/png" };
    },
  } as never);
  return 받은것;
})();

describe("지어내면 안 되는 것의 목록이 한 벌이다", () => {
  it("**목록이 비어 있지 않다** — 비면 아래 검사가 전부 조용히 통과한다", () => {
    expect(NEVER_FABRICATE.length).toBeGreaterThan(3);
  });

  it.each(NEVER_FABRICATE.map((word) => [word]))(
    "**상세페이지가 %s 를 금지한다**",
    (word) => {
      expect(PRODUCT_GROUNDING_RULES).toContain(word);
    },
  );

  it.each(NEVER_FABRICATE.map((word) => [word]))(
    "**리디자인 분석도 %s 를 금지한다**",
    (word) => {
      expect(분석프롬프트).toContain(word);
    },
  );

  it.each(NEVER_FABRICATE.map((word) => [word]))(
    "**리디자인 섹션도 %s 를 금지한다**",
    (word) => {
      expect(섹션프롬프트).toContain(word);
    },
  );

  it.each(NEVER_FABRICATE.map((word) => [word]))(
    "**리디자인 수정도 %s 를 금지한다**",
    (word) => {
      expect(수정프롬프트).toContain(word);
    },
  );
});

/**
 * **계약을 글자 그대로 싣는다.**
 *
 * 목록만 맞추면 「각자 제 말로 적되 낱말만 같게」가 된다 — 그러면 계약을
 * 고쳐도 각 코어의 문장은 안 따라온다. 한 문장을 그대로 실으면 고칠 곳이
 * 한 곳이다.
 */
describe("양쪽이 같은 문장을 싣는다", () => {
  it.each([
    ["상세페이지 제품 근거", PRODUCT_GROUNDING_RULES],
    ["리디자인 분석", 분석프롬프트],
    ["리디자인 섹션", 섹션프롬프트],
    ["리디자인 수정", 수정프롬프트],
  ])("**%s 가 공통 계약을 싣는다**", (_label, prompt) => {
    expect(prompt).toContain(GROUNDING_RULE);
  });
});
