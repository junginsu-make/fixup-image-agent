import { describe, expect, it } from "vitest";
import { conceptOnlyNotice, conceptOnlyPromptRule } from "./pdp.concept-only";
import { buildImageJson } from "./pdp.image-prompt";
import { buildSectionImageOptions } from "./pdp.image-options";

/**
 * **사진 없이 실물을 팔 때**(N-2, 설계 §9.1).
 *
 * 글로만 「나무 도마를 팝니다」라고 적으면 우리는 **나무 도마를 지어낸다.**
 * 그 그림에는 실제로 파는 물건과 다른 결·색·모양이 그려지고, 사용자는 그것을
 * 상세페이지에 올린다.
 *
 * 설계 §9.1: 「참고용 외형 없는 실물 입력은 **임의 제품을 실제 제품처럼 생성
 * 승인하지 않는다**」.
 */

describe("개념 시안으로 다루어야 하는 때", () => {
  it("**실물인데 사진이 없으면 알린다**", () => {
    const 알림 = conceptOnlyNotice({ productKind: "physical", hasProductPhoto: false });

    expect(알림.conceptOnly).toBe(true);
    expect(알림.message).toBeTruthy();
  });

  it("**사진이 있으면 아무 말도 안 한다**", () => {
    const 알림 = conceptOnlyNotice({ productKind: "physical", hasProductPhoto: true });

    expect(알림.conceptOnly).toBe(false);
    expect(알림.message).toBe("");
  });

  /**
   * **무형 상품에는 해당 없다.** 서비스·디지털에는 보여 줄 실물이 없어
   * 「실제와 다르다」는 말이 성립하지 않는다.
   */
  it.each([
    ["service", "서비스"],
    ["digital", "디지털"],
  ])("**%s 에는 안 알린다** — 보여 줄 실물이 없다", (kind) => {
    expect(conceptOnlyNotice({ productKind: kind as never, hasProductPhoto: false }).conceptOnly).toBe(false);
  });

  /**
   * **모를 때는 경고하지 않는다.** 상품 종류를 안 밝힌 사람에게 「사진이
   * 없습니다」라고 하면 무형 상품을 파는 사람도 그 말을 듣는다. 잘못된
   * 경고는 사용자가 경고 전체를 무시하게 만든다.
   */
  it("**상품 종류를 모르면 안 알린다**", () => {
    expect(conceptOnlyNotice({ hasProductPhoto: false }).conceptOnly).toBe(false);
    expect(conceptOnlyNotice({ productKind: "other" as never, hasProductPhoto: false }).conceptOnly).toBe(false);
  });
});

describe("사용자에게 보여 줄 말", () => {
  const 말 = conceptOnlyNotice({ productKind: "physical", hasProductPhoto: false }).message;

  it("**무엇이 문제인지 말한다** — 실제와 다를 수 있다", () => {
    expect(말).toContain("다를 수 있");
  });

  it("**무엇을 하면 되는지 말한다** — 까닭만 말하면 사용자는 멈춘다", () => {
    expect(말).toContain("사진을 올리면");
  });

  it("**막는다고 하지 않는다** — 개념 시안이 필요한 경우가 실제로 있다", () => {
    expect(말).not.toContain("만들 수 없");
    expect(말).not.toContain("불가");
  });

  it("**줄표를 안 쓴다**", () => {
    expect(말).not.toContain("—");
  });
});

/**
 * **지어내지 말라고만 하면 부족하다.**
 *
 * `productKindRule("physical")` 이 이미 「사진이 없으므로 색·로고·글자를
 * 지어내지 마라」고 한다. 그 말만으로는 모델이 그럴듯한 물건을 그리고, 그
 * 그림은 **실제 제품처럼 보인다.**
 */
describe("개념 시안일 때 더하는 지시", () => {
  const 지시 = conceptOnlyPromptRule();

  it("**개념 시안임을 못 박는다**", () => {
    expect(지시).toContain("개념 시안");
  });

  it("**상표·로고·제품명을 빼라고 한다** — 그것이 실제처럼 보이게 만든다", () => {
    expect(지시).toContain("상표");
    expect(지시).toContain("로고");
  });

  it("**제품을 확대하지 말라고 한다** — 가까이 볼수록 다른 점이 드러난다", () => {
    expect(지시).toContain("확대하지");
  });
});

/**
 * **판단을 만들어 두고 프롬프트가 안 쓰면 아무것도 안 고친 것이다**(X-07 의 교훈).
 *
 * 그림을 실제로 바꾸는 것은 프롬프트다. 판정 함수만 맞으면 지어낸 물건이
 * 그대로 나간다.
 */
describe("프롬프트가 실제로 달라진다", () => {
  const 섹션 = {
    section_id: "S1", section_name: "히어로", goal: "관심",
    headline: "나무 도마", subheadline: "", bullets: [],
    trust_or_objection_line: "", CTA: "",
    prompt_ko: "도마", prompt_en: "a wooden cutting board", layout_notes: "",
  } as never;

  const 프롬프트 = (conceptOnly?: boolean) =>
    buildImageJson(섹션, {
      style: "studio", withModel: false, outputMode: "full-image", conceptOnly,
    } as never);

  it("**켜면 개념 시안임을 싣는다**", () => {
    expect(프롬프트(true)).toContain("concept_only");
  });

  it("**끄면 아무것도 안 싣는다** — 사진이 있는 사람의 그림을 바꾸면 안 된다", () => {
    expect(프롬프트(false)).not.toContain("concept_only");
    expect(프롬프트(undefined)).not.toContain("concept_only");
  });

  it("**상표·로고를 빼라고 싣는다**", () => {
    const 글 = 프롬프트(true);

    expect(글).toContain("logos");
    expect(글).toContain("brand marks");
  });

  it("**제품 확대를 피하라고 싣는다** — 가까이 볼수록 다른 점이 드러난다", () => {
    expect(프롬프트(true)).toContain("close-ups");
  });
});

/**
 * **화면이 보낸 값이 옵션 조립을 지나 살아남는가.**
 *
 * 이 저장소는 「값만 고치면 아무 일도 안 일어난다」를 이미 겪었다(U-07).
 */
describe("옵션 조립이 값을 안 버린다", () => {
  it("**페이지 설정의 개념 시안 표시가 섹션 옵션까지 온다**", () => {
    const options = buildSectionImageOptions(
      { conceptOnly: true } as never,
      { section: { section_id: "S1" } as never, index: 0 },
    );

    expect(options.conceptOnly).toBe(true);
  });

  it("**안 보내면 안 켜진다**", () => {
    const options = buildSectionImageOptions({} as never, { section: { section_id: "S1" } as never, index: 0 });

    expect(options.conceptOnly).toBeFalsy();
  });
});
