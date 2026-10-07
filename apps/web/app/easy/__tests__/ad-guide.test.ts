import { describe, expect, it } from "vitest";
import { AD_STEPS } from "../../ad/steps";
import { AD_SPECS } from "../../../lib/ad/specs";
import { AD_FACTS, AD_GUIDE_FALLBACK, adGuidePrompt, readAdGuide } from "../ad-guide";

/**
 * **규격별 안내는 LLM 이 우리 기능의 사실로 쓴다**(2026-10-06 설계 A5). 사실은 코드가 넣는다.
 *
 * 최종 리뷰(2026-10-06): 처음 판은 단계 이름을 지어 적었고(「01 이미지 고르기」 — 화면은
 * 「01 그림 고르기」), 「크레딧이 들지 않습니다」라고 못 박았다. 투명 배경 규격은 배경을 지우는
 * 값이 든다(`lib/ad/cost.ts` · `api/ad/export/route.ts:176-183`). 단계 이름은 화면의 것을
 * 읽고, 값은 코드대로 적는다.
 */
const 투명규격 = AD_SPECS.filter((spec) => spec.format === "png-alpha");

describe("규격 안내 글", () => {
  it("단계 이름은 「광고소재」 화면의 것을 그대로 쓴다", () => {
    const prompt = adGuidePrompt({ prompt: "사이즈별로요", imageCount: 0 });
    expect(AD_STEPS.map((step) => step.label)).toEqual(["01 그림 고르기", "02 어디에 올릴까요", "03 확인하고 내려받기"]);
    for (const step of AD_STEPS) {
      expect(prompt).toContain(`「${step.label}」`);
      expect(AD_GUIDE_FALLBACK).toContain(`「${step.label}」`);
    }
    expect(prompt).not.toContain("01 이미지 고르기");
  });

  it("값은 코드대로 — 대부분 0, 투명 배경 규격만 1크레딧", () => {
    const 사실 = AD_FACTS.join("\n");
    expect(사실).toContain("대부분의 규격은");
    expect(사실).toContain("크레딧이 들지 않습니다");
    expect(사실).toContain("1크레딧");
    expect(투명규격.length).toBeGreaterThan(0);
    for (const spec of 투명규격) expect(사실).toContain(spec.label);
  });

  it("우리 기능의 한계와 받는 꼴을 사실로 넣고, 사용자의 말을 싣는다", () => {
    const prompt = adGuidePrompt({ prompt: "사이즈별로요", imageCount: 0 });
    for (const 사실 of ["ZIP", "1.2배까지만", "네이버 · 구글 · 카카오"]) expect(prompt).toContain(사실);
    expect(prompt).toContain("사이즈별로요");
  });

  it("만든 이미지가 있으면 그것을 골라 가라고, 없으면 여기서 먼저 만들라고 시킨다", () => {
    expect(adGuidePrompt({ prompt: "x", imageCount: 2 })).toContain("만든 이미지가 2장 있습니다");
    expect(adGuidePrompt({ prompt: "x", imageCount: 0 })).toContain("여기서 광고 이미지를 먼저 만들어 가져가도 된다");
  });

  it("모델이 빈 글을 주면 코드가 쓴 안내로 대신한다", () => {
    expect(readAdGuide({ text: "  " })).toBe(AD_GUIDE_FALLBACK);
    expect(readAdGuide(null)).toBe(AD_GUIDE_FALLBACK);
    expect(readAdGuide({ text: " 안내 " })).toBe("안내");
  });

  it("대신하는 안내도 같은 사실을 말한다", () => {
    for (const 사실 of ["「광고소재」", "크레딧이 들지 않습니다", "1크레딧", "1.2배"]) {
      expect(AD_GUIDE_FALLBACK).toContain(사실);
    }
    for (const spec of 투명규격) expect(AD_GUIDE_FALLBACK).toContain(spec.label);
  });
});
