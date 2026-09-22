import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_GOAL,
  DEFAULT_PRODUCT_KIND,
  PAGE_GOALS,
  PRODUCT_KINDS,
  isTangibleKind,
  pageGoalRule,
  productKindRule,
} from "./pdp.offering";
import { buildBriefPrompt, buildTextBlueprintPrompt, planFromText } from "./pdp.text-plan";

/**
 * **글로 시작하면 무엇을 팔든 무형 취급이었다**(K-08).
 *
 * 글 입력 경로의 프롬프트가 이렇게 못 박혀 있었다.
 *
 * - 「너는 **무형 상품**(강의·코칭·구독·소프트웨어·커뮤니티)의 판매 기획자다」
 * - 「**무형 상품이다.** 만질 수 있는 제품 사진을 전제하지 마라.」
 *
 * 그리고 모델이 고르는 `offeringKind` 의 값도 **전부 무형**이었다. 사진이 없을
 * 뿐인 실물을 글로 설명한 사람은, 「만질 수 있는 제품을 전제하지 마라」는
 * 지시를 받은 기획을 돌려받는다 — 제품 사진 자리에 은유가 들어간다.
 *
 * 설계 §9.1: 「이미지/텍스트는 **입력 방식**이다. 실물/서비스/디지털/기타와
 * 판매/문의/홍보 목적은 **별도로 받는다.** 텍스트 경로의 '무형 상품' 고정
 * 지시를 제거한다.」
 *
 * 즉 **입력 방식과 상품 종류는 다른 축**이다. 그것을 섞어 둔 것이 이 결함이다.
 */

describe("상품 종류는 사용자가 정한다", () => {
  it("**실물이 목록에 있다** — 없으면 사진 없는 실물을 담을 칸이 없다", () => {
    expect(PRODUCT_KINDS).toContain("physical");
  });

  it("설계가 적은 넷이다", () => {
    expect([...PRODUCT_KINDS].sort()).toEqual(["digital", "other", "physical", "service"]);
  });

  /**
   * **안 고르면 무형으로 몰지 않는다.** 그동안의 기본값이 사실상 「무형」이었고,
   * 그것이 이 결함의 뿌리다. 모르면 **모른다**고 두고 프롬프트가 단정하지
   * 않는다.
   */
  it("**기본값은 「모름」이다**", () => {
    expect(DEFAULT_PRODUCT_KIND).toBe("other");
  });

  it.each([
    ["physical", true],
    ["service", false],
    ["digital", false],
    ["other", false],
  ])("%s 이 만질 수 있는가 → %s", (kind, tangible) => {
    expect(isTangibleKind(kind as never)).toBe(tangible);
  });
});

describe("종류가 기획 규칙을 바꾼다", () => {
  it("**실물이면 제품 사진을 전제해도 된다**", () => {
    const 규칙 = productKindRule("physical");

    expect(규칙).toContain("실물");
    expect(규칙).not.toContain("만질 수 있는 제품 사진을 전제하지 마라");
  });

  it("**서비스면 전과 같이 장면·은유로 간다**", () => {
    const 규칙 = productKindRule("service");

    expect(규칙).toContain("전제하지");
    expect(규칙).toContain("장면");
  });

  it("디지털도 만질 수 없다", () => {
    expect(productKindRule("digital")).toContain("전제하지");
  });

  /**
   * **모르면 단정하지 않는다.** 실물이라고도, 무형이라고도 하지 않는다 —
   * 어느 쪽으로 단정해도 절반은 틀린다.
   */
  it("**모르면 양쪽 다 단정하지 않는다**", () => {
    const 규칙 = productKindRule("other");

    expect(규칙).not.toContain("실물이다");
    expect(규칙).not.toContain("무형 상품이다");
    expect(규칙).toContain("사용자가 쓴 말");
  });
});

describe("페이지 목적도 따로 받는다", () => {
  it("설계가 적은 셋이다", () => {
    expect([...PAGE_GOALS].sort()).toEqual(["inquiry", "promotion", "purchase"]);
  });

  it("**기본은 판매다** — 상세페이지는 그것이 보통이다", () => {
    expect(DEFAULT_PAGE_GOAL).toBe("purchase");
  });

  it("**문의 목적이면 구매를 재촉하지 않는다**", () => {
    const 규칙 = pageGoalRule("inquiry");

    expect(규칙).toContain("문의");
    expect(규칙).not.toContain("바로 구매");
  });

  it("**홍보 목적이면 파는 말을 앞세우지 않는다**", () => {
    expect(pageGoalRule("promotion")).toContain("알리는");
  });

  it("판매 목적은 전과 같다", () => {
    expect(pageGoalRule("purchase")).toContain("구매");
  });
});

/**
 * **프롬프트에 실제로 실리는가.**
 *
 * 규칙만 맞고 배선이 안 됐으면 아무 소용이 없다. 이 저장소가 이미 여러 번 그랬다.
 */
describe("글 경로 프롬프트가 종류를 반영한다", () => {
  const 브리프 = {
    offeringName: "수제 비누", offeringKind: "other", oneLiner: "한 줄",
    audience: "대상", problem: "문제", outcome: "결과",
    differentiators: [], objections: [], pricePositioning: "", tone: "",
    sourceText: "손으로 만든 비누를 팝니다",
  } as never;

  const 프롬프트 = (over: Record<string, unknown> = {}) =>
    buildTextBlueprintPrompt({ ...(브리프 as object), ...over } as never);

  it("**고정 문장이 사라졌다** — 무엇을 팔든 무형이라 하지 않는다", () => {
    expect(프롬프트({ productKind: "physical" })).not.toContain("무형 상품이다.");
  });

  it("**실물이면 제품을 보여 줘도 된다고 말한다**", () => {
    const 글 = 프롬프트({ productKind: "physical" });

    expect(글).toContain("실물 상품이다");
    expect(글).not.toContain("제품 사진을 전제하지 마라");
  });

  it("**서비스면 전과 같이 말한다**", () => {
    expect(프롬프트({ productKind: "service" })).toContain("제품 사진을 전제하지 마라");
  });

  it("**안 고르면 단정하지 않는다**", () => {
    const 글 = 프롬프트();

    expect(글).not.toContain("실물 상품이다");
    expect(글).not.toContain("무형 상품이다");
  });

  it("**목적도 실린다**", () => {
    expect(프롬프트({ pageGoal: "inquiry" })).toContain("문의를 받는 것");
    expect(프롬프트()).toContain("구매");
  });
});

describe("브리프를 뽑는 프롬프트도 무형이라 못 박지 않는다", () => {
  it("**「무형 상품의 판매 기획자」가 아니다**", () => {
    expect(buildBriefPrompt("손으로 만든 비누를 팝니다", "physical")).not.toContain("무형 상품(");
  });

  it("**고른 종류를 알려 준다**", () => {
    expect(buildBriefPrompt("비누", "physical")).toContain("실물 상품");
  });

  it("안 고르면 종류를 단정하지 않는다", () => {
    const 글 = buildBriefPrompt("무언가를 팝니다");

    expect(글).not.toContain("무형 상품(");
    expect(글).not.toContain("실물 상품이라고");
  });
});

/**
 * **요청에서 프롬프트까지 실제로 이어지는가.**
 *
 * 규칙도 맞고 프롬프트 조립도 맞는데 **그 사이가 끊겨 있으면** 아무 소용이
 * 없다. 변이로 확인했다 — `productKind` 를 브리프에 안 싣게 바꿔도 위 시험은
 * 전부 통과했다. 여기가 그 구멍이다.
 */
describe("고른 종류가 설계도 프롬프트까지 간다", () => {
  const 온전한브리프 = JSON.stringify({
    offeringName: "수제 비누", offeringKind: "other", oneLiner: "한 줄",
    audience: "대상", problem: "문제", outcome: "결과",
    differentiators: ["차별"], objections: ["반론"], pricePositioning: "중간", tone: "담백",
  });
  const 온전한설계도 = JSON.stringify({
    executiveSummary: "", scorecard: [], blueprintList: [],
    sections: [{ section_id: "S1", section_name: "첫", headline: "제목", prompt_en: "a", layout_notes: "" }],
  });

  /** 프롬프트를 받아 적는 가짜. 무엇이 실려 갔는지 이것으로 본다. */
  const 받아적기 = () => {
    const 받은것: string[] = [];
    return {
      받은것,
      deps: {
        generateJson: async (prompt: string, _schema: unknown, name: string) => {
          받은것.push(prompt);
          return JSON.parse(name.includes("brief") ? 온전한브리프 : 온전한설계도);
        },
        generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }),
      },
    };
  };

  it("**실물을 고르면 설계도 프롬프트가 그렇게 말한다**", async () => {
    const { 받은것, deps } = 받아적기();

    await planFromText(
      { text: "손으로 만든 비누를 팝니다", aspectRatio: "3:4", productKind: "physical" } as never,
      undefined,
      deps as never,
    );

    const 설계도프롬프트 = 받은것.find((prompt) => prompt.includes("구성안을 설계한다"));
    expect(설계도프롬프트, "설계도 프롬프트를 못 찾았다").toBeTruthy();
    expect(설계도프롬프트).toContain("실물 상품이다");
    expect(설계도프롬프트).not.toContain("제품 사진을 전제하지 마라");
  });

  it("**목적도 끝까지 간다**", async () => {
    const { 받은것, deps } = 받아적기();

    await planFromText(
      { text: "상담을 받습니다", aspectRatio: "3:4", pageGoal: "inquiry" } as never,
      undefined,
      deps as never,
    );

    expect(받은것.find((p) => p.includes("구성안을 설계한다"))).toContain("문의를 받는 것");
  });

  it("**브리프 뽑는 프롬프트에도 간다**", async () => {
    const { 받은것, deps } = 받아적기();

    await planFromText(
      { text: "비누", aspectRatio: "3:4", productKind: "physical" } as never,
      undefined,
      deps as never,
    );

    expect(받은것[0]).toContain("실물 상품");
  });
});
