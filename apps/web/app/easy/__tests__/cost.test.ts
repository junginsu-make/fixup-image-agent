import { describe, expect, it } from "vitest";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { easyCost } from "../cost";

/**
 * **이번 한 장에 얼마 드나** (설계 §5-2).
 *
 * 채팅은 돌이킬 수 없다 — 엔터가 곧 생성이다. 누르기 전에 아는 것이 누른 뒤에
 * 아는 것보다 낫다. 그 값을 화면이 말하려면 여기서 셈이 맞아야 한다.
 */

const MODEL = "gpt-image-2.5-flare";
const RATIO = "1:1";

describe("이번 한 장 값", () => {
  it("글값과 그림값을 함께 센다", () => {
    const 첨부없음 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 0 });

    expect(첨부없음.rejected).toBeUndefined();
    // 글값만도 한 장이 된다($0.05 미만이라도 올림한다).
    expect(첨부없음.units).toBeGreaterThanOrEqual(creditUnits(llmCostUsd({ planCalls: 1 })) + 1);
  });

  /**
   * **붙인 그림마다 읽는데, 장으로 올림하면 티가 안 날 수 있다.**
   *
   * 첨부 셋을 읽으면 글값이 $0.014 → $0.044 로 세 배가 되는데 **둘 다 한
   * 장**이다($0.05 미만). 화면이 「1장」에서 「1장」으로 안 변한다.
   *
   * **그것이 맞다.** 실제로 깎이는 것도 한 장이다 — 라우트가 같은
   * `creditUnits` 로 예약한다. 화면과 청구가 갈리지 않는 것이 중요하고,
   * 여기서 억지로 늘려 보이면 실제보다 비싸게 말하게 된다.
   *
   * 많이 붙이면 넘어간다. 그 자리를 잰다.
   */
  it("많이 붙이면 값이 는다", () => {
    const 없음 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 0 });
    const 여덟 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 8 });

    expect(여덟.units!).toBeGreaterThan(없음.units!);
  });

  /**
   * **화면이 말하는 값과 실제로 깎이는 값이 같아야 한다.**
   *
   * 라우트는 기획과 그림을 **각각** 예약한다. 합쳐서 올림하면 실제보다 적게
   * 말한다 — 포스터 03 이 2026-09-17 에 같은 자리에서 틀렸다.
   */
  it("기획과 그림을 각각 올림한다", () => {
    const 셋 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 3 });
    const 글값 = creditUnits(llmCostUsd({ planCalls: 1, visionReads: 3 }));

    // 글값 몫이 따로 한 장을 차지한다. 그림값과 합쳐 올림하면 이보다 작아진다.
    expect(셋.units!).toBeGreaterThanOrEqual(글값 + 1);
  });

  /**
   * **적게 잡는 쪽이 위험하다.** 읽기에 실패한 것은 라우트가 안 세는데, 화면은
   * 그것을 미리 알 수 없다. 전부 읽는다고 보고 잰다.
   */
  it("식을 다시 적지 않는다", () => {
    const 하나 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 1 });
    const 글값 = creditUnits(llmCostUsd({ planCalls: 1, visionReads: 1 }));

    // 글값 몫은 라우트가 쓰는 식과 정확히 같아야 한다.
    expect(하나.units!).toBeGreaterThanOrEqual(글값);
  });

  it("음수는 0으로 본다", () => {
    const 음수 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: -5 });
    const 없음 = easyCost({ modelId: MODEL, ratioId: RATIO, attachmentCount: 0 });

    expect(음수.units).toBe(없음.units);
  });
});

describe("못 셀 때", () => {
  /**
   * **모르는 모델이면 금액을 안 적는다.** 지어내면 화면이 거짓말을 하고, 그것이
   * 이 모드에서 사용자가 보는 유일한 값 정보다.
   */
  it("모르는 모델이면 까닭을 준다", () => {
    const 모름 = easyCost({ modelId: "어디서-온-모델-9", ratioId: RATIO, attachmentCount: 0 });

    expect(모름.units).toBeUndefined();
    expect(모름.rejected).toBeTruthy();
  });
});
