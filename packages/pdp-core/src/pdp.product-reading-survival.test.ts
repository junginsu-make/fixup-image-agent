import { describe, expect, it } from "vitest";
import { isProductReadingUsable, normalizeProductReading, productReadingStatus } from "./pdp.product-reading";

/**
 * **사진에서 읽은 것이 살아남는가**(2026-09-22 사용자 신고).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 프로틴 통 사진을 올렸는데 화면에 「**사진에서 제품을 충분히 읽지
 * 못했습니다**」가 떴다. 라벨이 크게 보이는 정면 사진이었다.
 *
 * 조사해 보니 판정선 자체는 느슨하다 — 종류 이름 4자 이상 + 사진에서 본 것
 * 2개 이상. 실측 기록을 보면 같은 파이프라인이 종류 30자·본 것 6개를
 * 돌려준 적이 있다.
 *
 * 그래서 **읽기는 읽었는데 중간에 잃어버리는 길**과 **한글에서만 빡빡한
 * 자릿수**, 둘을 본다.
 */

const 읽은것 = (patch: Record<string, unknown> = {}) => ({
  category: "유청 단백질 보충제",
  visibleFacts: ["검은 통", "금색 라벨", "2.5kg 표기"],
  labelText: ["IMPACT WHEY PROTEIN"],
  distinctiveTraits: ["손잡이가 있는 통"],
  unknowns: ["실제 효능", "가격", "성분 함량"],
  ...patch,
});

describe("판정선", () => {
  it("**제대로 읽었으면 통과한다**", () => {
    expect(isProductReadingUsable(읽은것() as never)).toBe(true);
  });

  it("**본 것이 하나뿐이면 얇다고 본다**", () => {
    expect(isProductReadingUsable(읽은것({ visibleFacts: ["검은 통"] }) as never)).toBe(false);
  });

  /**
   * **한글은 한 음절이 한 자다.**
   *
   * 「프로틴」·「단백질」·「보충제」는 셋 다 3자다. 사진에서 본 것을 여섯 개
   * 적어도 **종류 이름이 짧다는 이유 하나로** 「못 읽었다」가 된다.
   *
   * 영어는 `protein powder` 만 해도 14자라 이 선에 안 걸린다. **한글
   * 사용자에게만 빡빡한 기준**이다.
   */
  it("**한 낱말짜리 한글 종류도 통과한다** — 본 것이 충분하면", () => {
    const 짧은이름 = 읽은것({ category: "프로틴" });

    expect(isProductReadingUsable(짧은이름 as never), "프로틴 3자").toBe(true);
  });

  it.each(["단백질", "보충제", "영양제", "세럼", "크림"])(
    "**%s 도 통과한다**",
    (category) => {
      expect(isProductReadingUsable(읽은것({ category }) as never)).toBe(true);
    },
  );

  /**
   * **너무 짧은 것은 여전히 막는다.** 한 글자·두 글자는 종류 이름이라고
   * 보기 어렵다. 그리고 빈 것은 당연히 막는다.
   */
  it("**빈 이름은 막는다**", () => {
    expect(isProductReadingUsable(읽은것({ category: "" }) as never)).toBe(false);
    expect(isProductReadingUsable(읽은것({ category: "  " }) as never)).toBe(false);
  });

  it("**한 글자는 막는다** — 종류 이름을 못 적은 것이다", () => {
    expect(isProductReadingUsable(읽은것({ category: "통" }) as never)).toBe(false);
  });

  /**
   * **두 자짜리 한글 종류가 실제로 많다.** 세럼·크림·비누·가방·양말…
   * 막으면 그 제품을 파는 사람은 늘 경고를 본다.
   */
  it.each(["세럼", "크림", "비누", "가방"])("**%s 도 통과한다** — 두 자짜리 종류다", (category) => {
    expect(isProductReadingUsable(읽은것({ category }) as never)).toBe(true);
  });
});

/**
 * **읽은 것이 중간에 사라지지 않는가.**
 *
 * 사진 경로는 구성안 안에 제품 판독을 함께 들고 다닌다. 구성안을 통째로
 * 갈아 끼우는 자리가 있으면 그때 판독이 떨어져 나간다.
 *
 * 저장소가 이미 한 곳에서 이 위험을 알고 조심하고 있다 — 근거 구조 실패를
 * 고칠 때 「섹션만 갈아 끼운다. 구성안 전체를 바꾸면 제품 판독이 떨어져
 * 나간다」고 주석까지 달았다.
 */
describe("구성안을 갈아 끼워도 읽은 것은 남는다", () => {
  const 구성안 = (productReading?: unknown) =>
    ({
      executiveSummary: "전략",
      scorecard: [],
      blueprintList: [],
      sections: [],
      ...(productReading ? { productReading } : {}),
    }) as never;

  /**
   * 심사에서 지적이 나오면 구성안을 한 번 다시 만든다. 그 응답에 제품 판독이
   * 안 실려 오면, **처음에 잘 읽은 것까지 사라진다.**
   */
  it("**다시 만든 구성안에 판독이 없으면 앞의 것을 잇는다**", async () => {
    const { carryProductReading } = await import("./pdp.product-reading");

    const 처음 = 구성안(읽은것());
    const 다시만든것 = 구성안(); // 모델이 판독을 안 실어 보냈다

    const 이은것 = carryProductReading(다시만든것, 처음);

    expect((이은것 as { productReading?: unknown }).productReading).toBeTruthy();
    expect(isProductReadingUsable((이은것 as never as { productReading: never }).productReading)).toBe(true);
  });

  it("**다시 만든 것에 판독이 있으면 그것을 쓴다** — 새로 읽은 것이 더 맞다", async () => {
    const { carryProductReading } = await import("./pdp.product-reading");

    const 처음 = 구성안(읽은것({ category: "옛 판독" }));
    const 다시만든것 = 구성안(읽은것({ category: "새 판독 이름" }));

    const 이은것 = carryProductReading(다시만든것, 처음) as { productReading: { category: string } };

    expect(이은것.productReading.category).toBe("새 판독 이름");
  });

  it("**둘 다 없으면 없는 대로 둔다** — 없는 것을 지어내지 않는다", async () => {
    const { carryProductReading } = await import("./pdp.product-reading");

    const 이은것 = carryProductReading(구성안(), 구성안()) as { productReading?: unknown };

    expect(이은것.productReading).toBeUndefined();
  });

  /**
   * **얇은 판독보다 두꺼운 판독이 낫다.** 다시 만들면서 판독이 얇아졌다면
   * 앞의 것을 지킨다 — 사용자에게는 경고가 하나 줄어드는 일이다.
   */
  it("**다시 만든 판독이 더 얇으면 앞의 것을 지킨다**", async () => {
    const { carryProductReading } = await import("./pdp.product-reading");

    const 처음 = 구성안(읽은것());
    const 얇아진것 = 구성안(읽은것({ visibleFacts: ["검은 통"] }));

    const 이은것 = carryProductReading(얇아진것, 처음) as { productReading: never };

    expect(isProductReadingUsable(이은것.productReading)).toBe(true);
  });
});

/**
 * **상태 이름이 셋이다.** 그 뜻이 갈려야 화면이 다른 말을 한다.
 */
describe("상태", () => {
  it("**제대로 읽었으면 usable**", () => {
    expect(productReadingStatus({ reading: 읽은것() as never, sellerSourceText: "적은 것" })).toBe("usable");
  });

  it("**못 읽었는데 사용자가 적은 것이 있으면 thin**", () => {
    expect(productReadingStatus({ reading: normalizeProductReading({}), sellerSourceText: "적은 것" })).toBe("thin");
  });

  it("**못 읽었고 적은 것도 없으면 unfounded**", () => {
    expect(productReadingStatus({ reading: normalizeProductReading({}) })).toBe("unfounded");
  });
});
