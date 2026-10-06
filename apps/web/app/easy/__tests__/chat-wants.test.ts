import { describe, expect, it } from "vitest";
import { easyAvailableWants, easyChatPrompt } from "../chat";
import { easyCapabilityLines } from "../chat-facts";
import { easyChatSpec } from "../../../lib/easy/chat-provider";

/**
 * **선택지를 지금 쓸 수 있는 갈래로만**(2026-10-06 설계 A1).
 *
 * 판단 틀의 선택지에 `image_edit` · `revise` 가 늘 열려 있어서, 만든 것이 없는 대화에서도
 * 모델이 그것을 골랐고 「고칠 이미지가 없습니다」로 끝났다(실측 6/6). 선택지를 줄이면
 * 같은 말이 6/6 새 이미지였다. 프롬프트와 틀이 **같은 함수**에서 나와야 다시 안 갈린다.
 */
const 모든갈래 = [
  "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page",
];
const 경우들 = [false, true].flatMap((hasDraft) => [false, true].flatMap((made) =>
  [false, true].map((madeImage) => ({ hasDraft, made, madeImage }))));
const 갈래줄이있나 = (prompt: string, want: string) => new RegExp(`^  ${want}\\s`, "m").test(prompt);
const 선택지 = (wants: readonly string[]) =>
  (easyChatSpec(wants).schema as { properties: { wants: { enum: string[] } } }).properties.wants.enum;

describe("지금 쓸 수 있는 갈래 (A1)", () => {
  it("만든 것이 없으면 고치기 갈래가 아예 없다", () => {
    expect(easyAvailableWants({ hasDraft: false, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "talk", "detail_page"]);
  });

  it("원고가 있으면 원고 고치기, 만들었으면 손보기, 이미지가 있으면 이미지 고치기가 열린다", () => {
    expect(easyAvailableWants({ hasDraft: true, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "revise", "card_text", "talk", "detail_page"]);
    expect(easyAvailableWants({ hasDraft: true, made: true, madeImage: true })).toEqual([
      "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page",
    ]);
    // 원고 없이 「만들었다」만 오는 일은 없지만, 와도 손보기는 열지 않는다.
    expect(easyAvailableWants({ hasDraft: false, made: true, madeImage: false })).not.toContain("card_redo");
  });

  it.each(경우들)("프롬프트의 갈래 안내가 목록과 꼭 같다 — %o", (choices) => {
    const prompt = easyChatPrompt([], "말", 0, choices.hasDraft, choices.made, choices.madeImage);
    const 쓸수있는 = easyAvailableWants(choices) as string[];
    for (const want of 모든갈래) expect(갈래줄이있나(prompt, want), want).toBe(쓸수있는.includes(want));
  });

  it.each(경우들)("판단 틀의 선택지가 목록과 꼭 같다 — %o", (choices) => {
    expect(선택지(easyAvailableWants(choices))).toEqual(easyAvailableWants(choices));
  });
});

describe("하는 일 · 안 하는 일 (A4)", () => {
  it("상세페이지와 광고 규격은 어디서 하는지 사실대로 적는다", () => {
    const prompt = easyChatPrompt([], "상세페이지도 돼?");
    expect(prompt).toContain("「상세페이지 만들기」에서 만듭니다");
    expect(prompt).toContain("「광고소재」 화면에서 합니다");
    expect(prompt).toContain("**된다고 하지 말고**");
  });

  /**
   * 최종 리뷰(2026-10-06): 「안 되는 것을 물으면 talk」만 있으면 「상세페이지 만들어줘」도
   * talk 로 읽힌다. **만들어 달라는 말**과 **되는지 묻기만 하는 말**을 가른다.
   */
  it("만들어 달라는 말은 그 갈래, 되는지 묻기만 하는 말은 talk 라고 가른다", () => {
    const 줄 = easyCapabilityLines(easyAvailableWants({ hasDraft: false, made: false, madeImage: false })).join("\n");
    expect(줄).toContain("상세페이지를 **만들어 달라는** 말은 detail_page 입니다.");
    expect(줄).toContain("**되는지 묻기만 하는** 말");
    expect(줄).toContain("talk 입니다");
  });

  it("쓸 수 없는 갈래 이름은 적지 않는다 — 아직 없는 ad_specs 도 마찬가지다 (A1)", () => {
    const 줄 = easyCapabilityLines(["image", "talk", "detail_page"]).join("\n");
    expect(줄).not.toContain("ad_specs");
    expect(줄).not.toContain("image_edit");
  });
});

describe("만든 것이 없는 대화의 사진 (A1-2)", () => {
  it("사진을 붙였고 만든 것이 없으면 「바꿔줘」도 새 이미지라고 알린다", () => {
    expect(easyChatPrompt([], "두번째 사진 사람을 화장품으로 바꿔줘", 2))
      .toContain("**붙인 사진으로 새 이미지를 만들라는 것**");
  });

  it("이미지나 원고가 있으면 그 말을 안 적는다 — 그때는 고치기가 맞다", () => {
    expect(easyChatPrompt([], "바꿔줘", 2, false, false, true)).not.toContain("새 이미지를 만들라는 것");
    expect(easyChatPrompt([], "바꿔줘", 2, true)).not.toContain("새 이미지를 만들라는 것");
  });
});
