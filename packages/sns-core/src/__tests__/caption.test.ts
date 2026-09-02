import { describe, expect, it } from "vitest";
import { buildCaptionPrompt, normalizeCaption, writeCaption, type CaptionInput } from "../caption";

const input: CaptionInput = {
  title: "월세 계약 전 확인할 것",
  language: "ko",
  cards: [
    { index: 1, headline: "월세 계약 전 확인할 것", body: "등기부등본부터 봅니다." },
    { index: 2, headline: "집주인이 맞는지", body: "신분증과 등기부의 이름을 맞춰 봅니다." },
  ],
};

const answer = {
  hook: "월세 계약, 이것만은 꼭 🏠",
  body: "등기부등본부터 확인하세요.\n\n집주인 이름이 다르면 멈춰야 합니다.",
  hashtags: ["#월세", "#부동산"],
  firstComment: "궁금한 점은 댓글로 남겨 주세요!",
};

const fake = (payload: unknown) => ({ async generate() { return payload; } });
const broken = (message: string) => ({ async generate(): Promise<unknown> { throw new Error(message); } });

describe("게시글을 만들 때 무엇을 주나", () => {
  it("카드 원고를 순서대로 넘긴다", () => {
    const prompt = buildCaptionPrompt({ ...input, toneNote: "초보자도 쉽게" });
    expect(prompt).toContain("1. 월세 계약 전 확인할 것");
    expect(prompt).toContain("2. 집주인이 맞는지");
    expect(prompt).toContain("초보자도 쉽게");
  });

  it("게시글이지 대본이 아니라고 알려 준다", () => {
    // 카드 원고를 그냥 이어 붙이던 것이 문제였다. 그러지 말라고 못박는다.
    const prompt = buildCaptionPrompt(input);
    expect(prompt).toMatch(/인스타그램/);
    expect(prompt).toMatch(/그대로 옮기지 마세요/);
    expect(prompt).toMatch(/첫 댓글/);
    expect(prompt).toMatch(/이모지/);
  });

  it("원고 언어를 따른다", () => {
    expect(buildCaptionPrompt({ ...input, language: "ja" })).toContain("日本語");
  });
});

describe("돌려받은 게시글 다듬기", () => {
  it("네 칸으로 나뉜다", () => {
    const caption = normalizeCaption(answer);
    expect(caption.hook).toBe("월세 계약, 이것만은 꼭 🏠");
    expect(caption.body).toContain("등기부등본");
    expect(caption.hashtags).toEqual(["#월세", "#부동산"]);
    expect(caption.firstComment).toBe("궁금한 점은 댓글로 남겨 주세요!");
  });

  it("우물정자를 안 붙여 온 해시태그에는 붙인다", () => {
    expect(normalizeCaption({ ...answer, hashtags: ["월세", "#부동산"] }).hashtags)
      .toEqual(["#월세", "#부동산"]);
  });

  it("빈 해시태그와 중복은 버린다", () => {
    expect(normalizeCaption({ ...answer, hashtags: ["#월세", "  ", "#월세", "#집"] }).hashtags)
      .toEqual(["#월세", "#집"]);
  });

  it("해시태그가 너무 많으면 자른다", () => {
    // 인스타그램은 30개까지 받지만 그렇게 붙이면 스팸으로 보인다.
    const many = Array.from({ length: 40 }, (_, index) => `#태그${index}`);
    expect(normalizeCaption({ ...answer, hashtags: many }).hashtags).toHaveLength(15);
  });

  it("모양이 아니면 거른다", () => {
    expect(() => normalizeCaption({ ...answer, hook: 3 })).toThrow();
    expect(() => normalizeCaption(null)).toThrow();
  });
});

describe("게시글 만들기", () => {
  it("모델이 준 것을 다듬어 돌려준다", async () => {
    const result = await writeCaption(input, fake(answer));
    expect(result.caption?.hook).toBe("월세 계약, 이것만은 꼭 🏠");
    expect(result.issues).toEqual([]);
  });

  it("주 모델이 실패하면 예비로 쓴다", async () => {
    const result = await writeCaption(input, broken("끊김"), fake(answer));
    expect(result.caption?.hook).toBe("월세 계약, 이것만은 꼭 🏠");
    expect(result.issues.join(" ")).toContain("예비");
  });

  it("둘 다 실패해도 사유를 남기고 넘어간다", async () => {
    // 카드가 이미 다 나온 마당에 게시글 하나 때문에 결과 화면이 무너지면 안 된다.
    const result = await writeCaption(input, broken("끊김"), broken("또 끊김"));
    expect(result.caption).toBeUndefined();
    expect(result.issues).toHaveLength(2);
  });

  it("카드 원고가 없으면 모델을 부르지 않는다", async () => {
    let called = false;
    const result = await writeCaption(
      { ...input, cards: [] },
      { async generate() { called = true; return answer; } },
    );
    expect(called).toBe(false);
    expect(result.issues).toEqual(["게시글을 쓸 카드 원고가 없습니다."]);
  });
});
