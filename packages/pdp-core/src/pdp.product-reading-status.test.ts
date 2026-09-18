import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { effectiveGapPolicy, productReadingStatus } from "./pdp.product-reading";
import type { ProductReading } from "./pdp.product-reading";

/**
 * **제품을 못 읽었으면 그렇다고 말한다.**
 *
 * `isProductReadingUsable` 은 만들어만 두고 **아무도 부르지 않았다** — 내보내기
 * 목록에만 있었다(U-13 「제품 판독 품질 함수가 생성 경로에 연결 안 됨」).
 * 그래서 사진이 흐릿하든 제품이 안 보이든 똑같이 「완성」으로 나왔다.
 *
 * 설계 §9.2: 「충분성 검사 → 정보 보완/불확실 표시」.
 */

const 좋은판독 = (overrides: Partial<ProductReading> = {}): ProductReading => ({
  category: "펌프형 유리병에 든 수분 세럼",
  visibleFacts: ["하늘색 반투명 유리", "원목 캡"],
  labelText: [],
  distinctiveTraits: [],
  unknowns: ["효능"],
  ...overrides,
});

describe("판독 품질을 한 낱말로", () => {
  it("쓸 만하면 usable", () => {
    expect(productReadingStatus({ reading: 좋은판독(), sellerSourceText: "" })).toBe("usable");
  });

  it("**판독이 부실해도 사용자가 적은 것이 있으면 thin** — 그쪽에 기댈 수 있다", () => {
    expect(productReadingStatus({ reading: undefined, sellerSourceText: "3단 높이 조절" })).toBe("thin");
  });

  it("**둘 다 없으면 unfounded** — 카피가 딛고 설 것이 아예 없다", () => {
    expect(productReadingStatus({ reading: undefined, sellerSourceText: "" })).toBe("unfounded");
  });

  it("공백만 적은 것은 적은 것이 아니다", () => {
    expect(productReadingStatus({ reading: undefined, sellerSourceText: "   \n  " })).toBe("unfounded");
  });

  it("판독이 한 낱말 범주면 부실한 것으로 본다", () => {
    // `isProductReadingUsable` 의 기준을 그대로 쓴다. 두 벌로 적으면 갈린다.
    expect(productReadingStatus({ reading: 좋은판독({ category: "병" }), sellerSourceText: "" })).toBe("unfounded");
  });
});

describe("근거가 아예 없으면 예시로 채우지 않는다", () => {
  it("**unfounded 면 sample 을 ask 로 내린다**", () => {
    // 「예시로 채우기」는 사용자가 확인하고 고칠 것을 전제로 한 정책이다. 근거가
    // 아예 없으면 예시가 곧 페이지 전체가 된다 — 통째로 지어낸 페이지다.
    expect(effectiveGapPolicy("unfounded", "sample")).toBe("ask");
  });

  it("thin 이면 사용자 선택을 그대로 둔다", () => {
    // 사용자가 적은 것이 있으면 그것을 근거로 예시를 쓸 수 있다.
    expect(effectiveGapPolicy("thin", "sample")).toBe("sample");
  });

  it("usable 이면 그대로 둔다", () => {
    expect(effectiveGapPolicy("usable", "sample")).toBe("sample");
  });

  it("**내리기만 한다 — 올리지 않는다**", () => {
    // 「빼기」를 고른 사람에게 지어낸 문장을 주면 안 된다.
    expect(effectiveGapPolicy("unfounded", "omit")).toBe("omit");
    expect(effectiveGapPolicy("unfounded", "ask")).toBe("ask");
  });
});

/**
 * **소스를 읽는 것으로는 「결과를 쓰는가」를 못 잰다**(K-09 에서 겪었다).
 *
 * 판단 함수를 부르고 그 결과를 버려도 문자열 시험은 통과한다. 실제로 돌려서
 * **결과물이 달라지는지** 본다.
 */
describe("사진 경로를 실제로 돌려 본다", () => {
  // 판매자가 한 적 없는 말을 인용이라고 우긴다. 근거 검사에 걸리는 문장이다.
  const 지어낸인용 = {
    executiveSummary: "요약",
    scorecard: [],
    blueprintList: [],
    sections: [
      {
        section_id: "s1",
        section_name: "히어로",
        goal: "관심",
        headline: "하루 한 번으로 충분합니다",
        subheadline: "",
        bullets: [],
        trust_or_objection_line: "",
        CTA: "",
        prompt_ko: "",
        prompt_en: "a product",
        layout_notes: "",
        evidenceVersion: 1,
        evidence: [
          {
            target: { slot: "headline" },
            value: "하루 한 번으로 충분합니다",
            kind: "quoted",
            quote: "하루 한 번으로 충분합니다",
          },
        ],
      },
    ],
  };

  const 돌리기 = async (request: { sellerBrief?: Record<string, string>; productReading?: unknown }) => {
    const 응답 = { ...지어낸인용, ...(request.productReading ? { productReading: request.productReading } : {}) };
    const llm = { generate: async () => ({ text: JSON.stringify(응답) }) };

    return new PdpService().analyzeProduct(
      {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        aspectRatio: "3:4",
        ...(request.sellerBrief ? { sellerBrief: request.sellerBrief } : {}),
        // 사용자는 「예시로 채우기」를 골랐다.
        gapPolicy: "sample",
      } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      { skipFirstImage: true },
    );
  };

  it("**판독도 없고 적은 것도 없으면 지어낸 문장을 남기지 않는다**", async () => {
    const 결과 = await 돌리기({});

    expect(결과.productReadingStatus).toBe("unfounded");
    // sample 이 ask 로 내려갔으니 문구가 비고 확인이 남는다.
    expect(결과.blueprint.sections[0]!.headline).toBe("");
    expect(결과.blueprint.sections[0]!.evidence?.some((entry) => entry.kind === "ask")).toBe(true);
    // **한 일을 적는다.** 화면은 이 값으로만 「치웠습니다」를 말할 수 있다.
    expect(결과.copyGapOutcome).toEqual({ requested: "sample", applied: "ask", cleared: 1 });
  });

  it("**대상 칸만 적은 것은 제품 근거가 아니다**", async () => {
    // 화면 흐름상 가장 채우기 쉬운 칸이다. 이것으로 근거가 생기면 보호가 늘 꺼진다.
    const 결과 = await 돌리기({ sellerBrief: { audience: "30대 여성", problem: "건조함" } });

    expect(결과.productReadingStatus).toBe("unfounded");
  });

  it("**사용자가 적은 것이 있으면 고른 정책을 지킨다** — 같은 입력, 브리프만 다르다", async () => {
    const 결과 = await 돌리기({ sellerBrief: { features: "하루 한 번 바르는 나이트 세럼" } });

    expect(결과.productReadingStatus).toBe("thin");
    // 예시로 남긴다. 사용자가 확인하고 고칠 것을 전제로 한 선택이다.
    expect(결과.blueprint.sections[0]!.headline).toBe("하루 한 번으로 충분합니다");
    expect(결과.blueprint.sections[0]!.evidence?.some((entry) => entry.kind === "sample")).toBe(true);
    // 고른 대로 했고 아무것도 안 비웠다.
    expect(결과.copyGapOutcome).toEqual({ requested: "sample", applied: "sample", cleared: 0 });
  });

  it("판독이 제대로 오면 usable 로 적는다", async () => {
    const 결과 = await 돌리기({
      sellerBrief: { features: "하루 한 번 바르는 나이트 세럼" },
      productReading: 좋은판독(),
    });

    expect(결과.productReadingStatus).toBe("usable");
  });
});

/*
  화면이 이 상태로 무엇을 말하는가는 웹 쪽 시험이 본다
  (`apps/web/app/create/__tests__/product-reading-notice.test.ts`). 문구 판단이
  거기 있어서다 — 이 파일에서 소스 문자열로 흉내내면 두 벌이 된다.
*/
