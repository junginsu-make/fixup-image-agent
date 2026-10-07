import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS } from "../../easy/ad-ask";
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

  /** 2026-10-06 부터 말로 고친다(#254). 「다시 적어서 다시 만든다」는 옛 안내다. */
  it("고치는 법이 옛 안내로 남아 있지 않다", () => {
    expect(source).not.toContain("다시 적어서 다시 만든다");
  });

  it("값이 드는 것과 안 드는 것을 함께 말한다", () => {
    const text = 주석을뺀다(source);
    expect(text).toContain("고치기도");
    expect(text).toContain("이미지를 보고 답하기");
    expect(text).toContain("입력창에서 내려갑니다");
  });
});
