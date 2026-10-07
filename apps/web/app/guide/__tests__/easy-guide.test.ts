import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS } from "../../easy/ad-ask";
import { EASY_RATIOS } from "../../easy/ask";
import { resultLabel } from "../../easy/image-numbers";
import { SEE_FAILED } from "../../easy/see-prompt";

/**
 * **쉽게 설명서가 2026-10-07 기능을 말하는가**(후속 Task 5).
 *
 * 도우미가 이 쪽을 읽고 답한다. 물음 · 번호 · 보고 답하기 · 광고 물음 · 크레딧이 빠지면 「번호로 고칠 수
 * 있나요」에 「모릅니다」가 나간다. 이름표 · 단추 글은 화면이 쓰는 그 값을 가져다 쓴다 — 손으로 옮겨 적으면
 * 한쪽만 바뀌는 날이 온다(이미지 설명서에서 겪었다).
 */

const source = readFileSync(new URL("../easy/page.tsx", import.meta.url), "utf8");
const adRows = readFileSync(new URL("../../easy/_components/ad-rows.tsx", import.meta.url), "utf8");

/** 주석은 화면이 아니다. */
const 주석을뺀다 = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("쉽게 설명서 · 2026-10-07 기능", () => {
  it("새 섹션이 다 있다", () => {
    for (const title of [
      "AI 가 물으면 단추로도, 말로도 답합니다",
      "만든 것에 번호가 붙습니다",
      "이미지를 보고 답합니다",
      "「광고 소재」라고 하면 먼저 묻습니다",
      "크레딧은 이미지가 나올 때만 듭니다",
    ]) {
      expect(source, `「${title}」 섹션이 없다`).toContain(`title="${title}"`);
    }
  });

  /** 화면의 「이미지 N」 · 「카드뉴스 N」은 `resultLabel` 이 쓴다. */
  it("결과물 이름표를 코드에서 가져온다", () => {
    expect(source).toContain('from "../../easy/image-numbers"');
    expect(source).toContain('resultLabel("image"');
    expect(source).toContain('resultLabel("cardnews"');
    expect(resultLabel("image", 1)).toBe("이미지 1");
    expect(resultLabel("cardnews", 2)).toBe("카드뉴스 2");
  });

  it("광고 물음의 단추 글을 코드에서 가져온다", () => {
    expect(source).toContain("AD_CHOICE_IMAGE");
    expect(source).toContain("AD_CHOICE_SPECS");
    for (const label of [AD_CHOICE_IMAGE, AD_CHOICE_SPECS]) {
      expect(주석을뺀다(source), `단추 글 「${label}」을 손으로 적었다`).not.toContain(label);
    }
  });

  /** 안내 줄 밑 단추 이름은 `ad-rows.tsx` 가 쓴다. 설명서가 부르는 이름이 같아야 화면에서 찾는다. */
  it("「광고소재 열기」가 화면 단추 이름과 같다", () => {
    expect(adRows).toContain(">광고소재 열기<");
    expect(source).toContain("「광고소재 열기」");
  });

  /** 못 봤을 때 화면에 남는 글을 그대로 보여 준다. */
  it("볼 수 없었을 때의 말을 코드에서 가져온다", () => {
    expect(source).toContain("SEE_FAILED");
    expect(SEE_FAILED.startsWith("지금은 이미지를 볼 수 없었습니다.")).toBe(true);
  });

  /**
   * **100개 밖의 옛 결과물만 고르면 SEE_FAILED 가 아니다**(최종 수정, 2차 최종 리뷰). `see-turn.ts` 는 고른 것이
   * 모두 최근 작업 100개보다 앞선 결과물이면 「오래되어 이 대화에서는 볼 수 없습니다 … 라이브러리에서 열어 볼 수
   * 있습니다」라고 답한다. 설명서가 그 예외를 말해야 한다. 코드 쪽 문장이나 100 이 바뀌면 이 시험이 알린다.
   */
  it("오래된 결과물을 보라고 하면 다른 말을 한다는 것을 사실대로 적는다", () => {
    const seeTurn = readFileSync(new URL("../../../lib/easy/see-turn.ts", import.meta.url), "utf8");
    const imageList = readFileSync(new URL("../../../lib/easy/image-list.ts", import.meta.url), "utf8");
    expect(seeTurn).toContain("은 오래되어 이 대화에서는 볼 수 없습니다. 지우지 않았다면 라이브러리에서 열어 볼 수 있습니다.");
    expect(imageList).toContain("export const RECENT_RESULT_WORKS = 100;");
    const text = 주석을뺀다(source);
    expect(text).toContain("최근에 만든 작업 100개보다 앞선 것");
    expect(text).toContain("오래되어 이 대화에서는 볼 수 없다");
    expect(text).toContain("라이브러리에서 열어 보시라고");
  });

  /** 2026-10-06 부터 말로 고친다(#254). 「다시 적어서 다시 만든다」는 옛 안내다. */
  it("고치는 법이 옛 안내로 남아 있지 않다", () => {
    expect(source).not.toContain("다시 적어서 다시 만든다");
  });

  /**
   * **모양 물음 바로 뒤의 새 주문은 다시 묻지 않고 만든다**(Task 5 리뷰 Critical). `settleTypedAnswer` 의 ratio
   * 갈래가 `askRatio: false` 다(`ask-chain.ts`, 라우트의 모양 물음 조건). 「다시 주문하시면 다시 묻습니다」는 거짓이었다.
   */
  it("모양 물음 뒤 새 주문을 다시 묻는다고 말하지 않는다", () => {
    const text = 주석을뺀다(source);
    expect(text).not.toContain("다시 주문하시면 다시 묻습니다");
    expect(text).toContain("모양을 다시 묻지 않고 바로 만듭니다");
  });

  /** 예로 든 단추 이름은 화면에 실제로 있어야 한다. 「세로」라는 단추는 없다. */
  it("모양 답의 예가 실제 단추 이름이다", () => {
    const askChoice = readFileSync(new URL("../../easy/_components/ask-choice.tsx", import.meta.url), "utf8");
    expect(EASY_RATIOS.map((ratio) => ratio.label)).toContain("포스터 세로");
    expect(askChoice).toContain('"이걸로 만들기"');
    expect(source).toContain("「포스터 세로」를 고르고 「이걸로 만들기」를 누르면");
    expect(source).not.toContain("「세로」를 고르면");
  });

  /** 대화가 없으면 `work.href`(`/poster/{id}` · `/sns/{id}`)로 간다 — 사이드바 이름은 「다양하게」 · 「카드뉴스」. */
  it("과정 보기가 대화를 못 찾을 때 가는 화면 이름을 말한다", () => {
    expect(source).toContain("「다양하게」나 「카드뉴스」 화면이 열립니다");
  });

  it("값이 드는 것과 안 드는 것을 함께 말한다", () => {
    const text = 주석을뺀다(source);
    expect(text).toContain("고치기도");
    expect(text).toContain("이미지를 보고 답하기");
    expect(text).toContain("입력창에서 내려갑니다");
  });
});
