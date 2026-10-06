import { describe, expect, it } from "vitest";
import {
  AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody, adImageInstruction, adQuestionOrigin,
  easyAdStep, hasAdNegation, isAdGuide, isAdQuestion, visibleBody,
} from "../ad-ask";
import { FAILED_TURN_GENERIC, failureRowBody } from "../../../lib/easy/failure-row";

/**
 * **「광고 소재」라는 말이 나오면 먼저 묻는다**(2026-10-06 설계 A5, 사용자 결정 두 번).
 * 낱말 찾기는 코드가 한다 — 규칙이 매번 지켜지게.
 */
const 줄 = (role: "user" | "assistant" | "image", body: string) => ({ role, body });
const 물은뒤 = [줄("user", "겨울 화장품 광고 소재 만들어줘"), 줄("assistant", AD_QUESTION)];

describe("「광고 소재」 낱말", () => {
  it("규격 낱말이 없으면 먼저 묻는다", () => {
    expect(easyAdStep("광고 소재 만들어줘", [])).toBe("ask");
    expect(easyAdStep("겨울 화장품 광고소재 하나 부탁해요", [])).toBe("ask");
  });

  it.each(["규격별", "사이즈별", "리사이징", "리사이즈", "베리에이션", "네이버", "구글", "카카오"])(
    "규격 낱말(%s)이 같이 있으면 묻지 않고 바로 안내한다",
    (word) => { expect(easyAdStep(`광고 소재 ${word}로 해줘`, [])).toBe("specs"); },
  );

  it("「광고 소재」라는 말이 없으면 코드는 끼어들지 않는다 — 판단 모델이 가른다", () => {
    expect(easyAdStep("광고 사진을 만들어주세요", [])).toBeUndefined();
    expect(easyAdStep("구글 배너 사이즈별로 다", [])).toBeUndefined();
  });

  it.each(["광고 소재 말고 그냥 이미지 만들어줘", "광고소재는 빼고 포스터로", "광고 소재 아니고 카드뉴스", "광고 소재 없이 그냥"])(
    "부정하면(%s) 묻지 않는다",
    (prompt) => {
      expect(hasAdNegation(prompt)).toBe(true);
      expect(easyAdStep(prompt, [])).toBeUndefined();
    },
  );
});

describe("물음 뒤의 답", () => {
  it("단추 글이면 코드가 정한다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, 물은뒤)).toBe("image");
    expect(easyAdStep(AD_CHOICE_SPECS, 물은뒤)).toBe("specs");
  });

  it("말로 한 답에 규격 낱말이 있으면 코드가 규격 안내로 정한다", () => {
    expect(easyAdStep("사이즈별로요", 물은뒤)).toBe("specs");
    expect(easyAdStep("네이버랑 카카오요", 물은뒤)).toBe("specs");
  });

  it("규격 낱말이 없는 말은 판단 모델에 맡긴다", () => {
    expect(easyAdStep("광고 이미지로요", 물은뒤)).toBeUndefined();
  });

  /**
   * 최종 리뷰(2026-10-06): 물음 바로 뒤의 답에 「광고 소재」가 또 들어 있으면 같은 물음이
   * 또 떴다(「광고 소재로 쓸 이미지요」). 물음 뒤에는 다시 묻지 않는다.
   */
  it("물음 바로 뒤에는 「광고 소재」가 있어도 다시 묻지 않는다", () => {
    expect(easyAdStep("광고 소재로 쓸 이미지요", 물은뒤)).not.toBe("ask");
    expect(easyAdStep("광고 소재로 쓸 이미지요", 물은뒤)).toBeUndefined();
    expect(easyAdStep("광고 소재 만들어줘", 물은뒤)).toBeUndefined();
  });

  it("물음 뒤라도 「광고 소재 말고」면 규격 낱말이 있어도 판단 모델에 맡긴다", () => {
    expect(easyAdStep("광고 소재 말고 그냥 네이버 블로그용 이미지", 물은뒤)).toBeUndefined();
  });

  it("물음이 마지막 줄이 아니면 단추 글도 보통 말이다 — 모드로 붙잡지 않는다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, [...물은뒤, 줄("user", "딴 얘기"), 줄("assistant", "네")])).toBeUndefined();
  });

  it("물음을 부른 말을 찾는다", () => {
    expect(adQuestionOrigin(물은뒤)).toBe("겨울 화장품 광고 소재 만들어줘");
    expect(adQuestionOrigin([줄("user", "안녕")])).toBeUndefined();
  });
});

describe("광고 이미지 지시 = 물음 앞의 말 + 답", () => {
  it("단추만 눌렀으면 처음 말 그대로", () => {
    expect(adImageInstruction(물은뒤, AD_CHOICE_IMAGE, true)).toBe("겨울 화장품 광고 소재 만들어줘");
  });

  it("말로 답했으면 처음 말에 답을 잇는다 — 「광고 이미지로요」 한마디로 그리지 않는다", () => {
    expect(adImageInstruction(물은뒤, "광고 이미지로요, 세로로", true))
      .toBe("겨울 화장품 광고 소재 만들어줘\n광고 이미지로요, 세로로");
  });

  /**
   * 최종 리뷰(2026-10-06): 물음에 답하지 않고 다른 것을 시켰는데 처음 말을 붙이면
   * 「겨울 화장품 광고 소재 + 고양이 포스터」가 그려진다. 답일 때만 잇는다.
   */
  it("답이 아니면(answered 가 거짓) 잇지 않는다 — 이번 말 그대로 쓴다", () => {
    expect(adImageInstruction(물은뒤, "그건 됐고 고양이 포스터 만들어줘", false)).toBeUndefined();
  });

  it("답이라는 표시는 note 의 answer 다", () => {
    expect(AD_ANSWER_NOTE).toBe("answer");
  });

  it("물음 뒤가 아니면 없다", () => {
    expect(adImageInstruction([줄("user", "안녕")], "포스터", true)).toBeUndefined();
  });

  it("물음 앞에 사용자 말이 없으면 없다 — 답만으로 그린다", () => {
    expect(adImageInstruction([줄("assistant", AD_QUESTION)], "광고 이미지로요", true)).toBeUndefined();
  });
});

describe("물음 줄 · 안내 줄 알아보기", () => {
  it("물음은 글이 똑같은 도우미 줄", () => {
    expect(isAdQuestion(줄("assistant", AD_QUESTION))).toBe(true);
    expect(isAdQuestion(줄("user", AD_QUESTION))).toBe(false);
    expect(isAdQuestion(줄("assistant", `${AD_QUESTION} `))).toBe(false);
  });

  it("안내 줄은 표시로 알아보고, 보일 때는 표시를 뗀다", () => {
    const 안내 = 줄("assistant", adGuideBody("「광고소재」에서 합니다."));
    expect(isAdGuide(안내)).toBe(true);
    expect(visibleBody(안내)).toBe("「광고소재」에서 합니다.");
    expect(isAdGuide(줄("user", adGuideBody("x")))).toBe(false);
    expect(visibleBody(줄("assistant", "그냥 답"))).toBe("그냥 답");
  });

  it("묻는 글은 사용자가 정한 그대로다", () => {
    expect(AD_QUESTION).toBe("광고 이미지를 만들고 싶으세요, 아니면 네이버·구글·카카오 규격별로 이미지를 베리에이션하고 싶으세요?");
  });
});

/**
 * **단추로 답했다가 실패한 뒤**(최종 리뷰 2026-10-06). 실패도 대화에 남으므로(B4) 물음 뒤에
 * 「단추 글 줄 + 실패 안내 줄」이 붙는다. 그대로면 물음이 마지막 줄이 아니라서, 다시 답해도
 * 앞 물음의 답으로 안 읽히고 처음 말도 사라진다.
 */
describe("단추로 답했다가 실패한 뒤", () => {
  const 실패뒤 = [...물은뒤, 줄("user", AD_CHOICE_IMAGE), 줄("assistant", failureRowBody(FAILED_TURN_GENERIC))];

  it("그 둘을 건너뛰고 물음을 부른 말을 찾는다", () => {
    expect(adQuestionOrigin(실패뒤)).toBe("겨울 화장품 광고 소재 만들어줘");
  });

  it("다시 답해도 앞 물음의 답으로 읽는다", () => {
    expect(easyAdStep(AD_CHOICE_IMAGE, 실패뒤)).toBe("image");
    expect(adImageInstruction(실패뒤, "광고 이미지로요", true)).toBe("겨울 화장품 광고 소재 만들어줘\n광고 이미지로요");
  });

  it("말로 한 답이 실패했으면 건너뛰지 않는다 — 단추 답만 그렇다", () => {
    expect(adQuestionOrigin([...물은뒤, 줄("user", "광고 이미지로요"), 줄("assistant", failureRowBody("x"))])).toBeUndefined();
  });

  it("실패 줄이 아닌 답 뒤면 건너뛰지 않는다", () => {
    expect(adQuestionOrigin([...물은뒤, 줄("user", AD_CHOICE_SPECS), 줄("assistant", adGuideBody("안내"))])).toBeUndefined();
  });
});
