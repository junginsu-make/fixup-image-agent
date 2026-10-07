import { describe, expect, it } from "vitest";
import { easyAvailableWants, easyChatPrompt, readEasyDecision } from "../chat";
import { AD_QUESTION, adGuideBody } from "../ad-ask";
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
  "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page", "ad_specs",
];
const 경우들 = [false, true].flatMap((hasDraft) => [false, true].flatMap((made) =>
  [false, true].map((madeImage) => ({ hasDraft, made, madeImage }))));
const 갈래줄이있나 = (prompt: string, want: string) => new RegExp(`^  ${want}\\s`, "m").test(prompt);
const 선택지 = (wants: readonly string[]) =>
  (easyChatSpec(wants).schema as { properties: { wants: { enum: string[] } } }).properties.wants.enum;

describe("지금 쓸 수 있는 갈래 (A1)", () => {
  it("만든 것이 없으면 고치기 갈래가 아예 없다", () => {
    expect(easyAvailableWants({ hasDraft: false, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "talk", "detail_page", "ad_specs"]);
  });

  it("원고가 있으면 원고 고치기, 만들었으면 손보기, 이미지가 있으면 이미지 고치기가 열린다", () => {
    expect(easyAvailableWants({ hasDraft: true, made: false, madeImage: false }))
      .toEqual(["image", "cardnews", "either", "revise", "card_text", "talk", "detail_page", "ad_specs"]);
    expect(easyAvailableWants({ hasDraft: true, made: true, madeImage: true })).toEqual([
      "image", "cardnews", "either", "revise", "card_text", "card_redo", "caption", "download", "image_edit", "talk", "detail_page", "ad_specs",
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
    expect(prompt).toContain("「상세페이지 만들기」 화면에서 만들 수 있습니다");
    expect(prompt).toContain("「광고소재」 화면에서는 됩니다");
    expect(prompt).toContain("**된다고 하지 말고**");
  });

  it("상세페이지 · 광고 규격은 한 가지 사실 문장으로 답하게 한다", () => {
    const 줄 = easyCapabilityLines(["image", "talk", "detail_page"]).join("\n");
    expect(줄).toContain("쉽게(이 대화)에서는 상세페이지를 만들지 않습니다. 「상세페이지 만들기」 화면에서 만들 수 있습니다.");
    expect(줄).toContain("쉽게(이 대화)에서는 광고 규격별로 여러 장 뽑지 않습니다. 「광고소재」 화면에서는 됩니다.");
    expect(줄).toContain("그대로(두 부분 모두) 답하세요");
  });

  it("「이미지」라고 하면 한 장으로 읽고 either 로 두지 않는다", () => {
    const prompt = easyChatPrompt([], "겨울 화장품 이미지 만들어줘");
    expect(prompt).toContain("「○○ 이미지 만들어줘」");
    expect(prompt).toContain("「이미지」는 애매하지 않습니다");
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

describe("광고 규격 갈래 (A5)", () => {
  const 없음 = { hasDraft: false, made: false, madeImage: false };

  it("늘 열려 있다 — 「광고 소재」 낱말이 없어도 여러 규격을 말하면 고를 수 있다", () => {
    expect(easyAvailableWants(없음)).toContain("ad_specs");
    expect(갈래줄이있나(easyChatPrompt([], "구글 배너 사이즈별로 다"), "ad_specs")).toBe(true);
  });

  it("「광고 소재 말고」면 선택지와 안내에서 뺀다", () => {
    expect(easyAvailableWants({ ...없음, adNegated: true })).not.toContain("ad_specs");
    const prompt = easyChatPrompt([], "광고 소재 말고 그냥 이미지", 0, false, false, false, { adNegated: true });
    expect(prompt).not.toContain("ad_specs");
  });

  it("바로 앞이 광고 물음이면 그 답으로 읽으라고 알린다", () => {
    const 물은뒤 = [
      { id: "u", role: "user" as const, body: "광고 소재 만들어줘" },
      { id: "q", role: "assistant" as const, body: AD_QUESTION },
    ];
    // 「도우미가」까지 본다 — 2차 D4 의 reply 규칙에도 「바로 앞에서 모양을 이미 물었으면」이 있다.
    expect(easyChatPrompt(물은뒤, "사이즈별로요")).toContain("도우미가 바로 앞에서");
    expect(easyChatPrompt([], "사이즈별로요")).not.toContain("도우미가 바로 앞에서");
  });

  /** 최종 리뷰(2026-10-06): 답일 때만 처음 말을 잇는다. 답인지는 모델이 이미 있는 `note` 칸에 적는다. */
  it("물음의 답이면 note 에 answer 를 적으라고 알린다", () => {
    const 물은뒤 = [
      { id: "u", role: "user" as const, body: "광고 소재 만들어줘" },
      { id: "q", role: "assistant" as const, body: AD_QUESTION },
    ];
    expect(easyChatPrompt(물은뒤, "광고 이미지로요")).toContain("`note` 에 `answer`");
    expect(easyChatPrompt([], "광고 이미지로요")).not.toContain("`note` 에 `answer`");
  });

  it("만들어 달라는 말은 ad_specs 라고 하는 일 줄에도 적고, 「광고 소재 말고」면 뺀다 (A4)", () => {
    expect(easyCapabilityLines(easyAvailableWants(없음)).join("\n")).toContain("**만들어 달라는** 말은 ad_specs 입니다.");
    expect(easyCapabilityLines(easyAvailableWants({ ...없음, adNegated: true })).join("\n")).not.toContain("ad_specs");
  });

  it("안내 줄의 표시는 모델에게 안 보낸다", () => {
    const prompt = easyChatPrompt([{ id: "g", role: "assistant", body: adGuideBody("광고소재에서 합니다") }], "고마워");
    expect(prompt).toContain("도우미: 광고소재에서 합니다");
    expect(prompt).not.toContain("ad-guide:");
  });

  it("판단 결과로 ad_specs 를 받는다", () => {
    expect(readEasyDecision({ wants: "ad_specs", reply: "" }).wants).toBe("ad_specs");
  });
});
