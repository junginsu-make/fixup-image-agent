import { describe, expect, it } from "vitest";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { modelCatalog, priceText, ratiosText, vendorOf } from "../model-catalog";

/**
 * **화면 이름 뒤에 실제로 무엇이 있는가.**
 *
 * 사이트는 모델 이름을 일부러 가린다 — 「표준형」·「속도형」처럼 부른다. 운영하는
 * 사람은 그 뒤가 무엇인지 알아야 값이 왜 그런지, 왜 어떤 비율이 안 되는지 안다.
 * 지금은 코드를 열어야만 알 수 있다(2026-09-16 사용자 요청).
 *
 * **화면 밖에서 만든다.** `.tsx` 안에 두면 「한 모델이 빠졌다」를 값으로 못 잰다.
 */

describe("대조표", () => {
  /** 빠지면 그 모델만 조용히 안 보인다. 개수를 못 박는다. */
  it("코드에 있는 모델을 하나도 안 빠뜨린다", () => {
    expect(modelCatalog().map((row) => row.id)).toEqual(IMAGE_MODELS.map((model) => model.id));
  });

  it("화면 이름과 실제 id 를 나란히 준다", () => {
    const rows = modelCatalog();
    const standard = rows.find((row) => row.label === "표준형");

    expect(standard?.id).toBe("gpt-image-2.5-flare");
    expect(rows.find((row) => row.label === "경제형")?.id).toBe("nano-banana");
  });

  /** 기본값이 무엇인지 화면에서 바로 보여야 한다. */
  it("기본 모델을 표시한다", () => {
    const defaults = modelCatalog().filter((row) => row.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.label).toBe("표준형");
  });

  it("두 종점을 모두 준다", () => {
    const economy = modelCatalog().find((row) => row.id === "nano-banana")!;

    expect(economy.t2iEndpoint).toBe("fal-ai/nano-banana");
    expect(economy.i2iEndpoint).toBe("fal-ai/nano-banana/edit");
  });
});

/**
 * 제공자는 **종점 이름 앞부분**에서만 읽는다.
 *
 * 코드는 어디에서도 「Google」이라고 말하지 않는다. 지어내면 관리자 화면이
 * 근거 없는 말을 하게 된다 — 가장 믿어야 할 화면에서.
 */
describe("제공자", () => {
  it("종점 앞부분을 그대로 쓴다", () => {
    expect(vendorOf("openai/gpt-image-2.5/flare/edit")).toBe("openai");
    expect(vendorOf("fal-ai/nano-banana-pro")).toBe("fal-ai");
  });

  it("모르는 모양이면 물음표를 준다 — 지어내지 않는다", () => {
    expect(vendorOf("weird")).toBe("?");
    expect(vendorOf("")).toBe("?");
  });
});

describe("값", () => {
  /** 고정값 모델은 숫자를 그대로 보여 준다. */
  it("고정값은 달러로 적는다", () => {
    expect(priceText(modelCatalog().find((row) => row.id === "nano-banana")!)).toBe("$0.039 고정");
  });

  /**
   * GPT 계열은 크기에 따라 표에서 뽑는다. 하나의 숫자로 적으면 거짓말이 된다 —
   * 비율만 바꿔도 값이 달라진다.
   */
  it("표에서 뽑는 모델은 고정값처럼 적지 않는다", () => {
    const text = priceText(modelCatalog().find((row) => row.id === "gpt-image-2.5-flare")!);

    expect(text).toContain("크기");
    expect(text).not.toContain("고정");
  });
});

describe("비율", () => {
  it("제한이 없으면 자유라고 적는다", () => {
    expect(ratiosText(modelCatalog().find((row) => row.id === "gpt-image-2")!)).toContain("자유");
  });

  /** 왜 A4 를 고르면 모델이 바뀌는지 여기서 읽혀야 한다. */
  it("정해진 목록만 되는 모델은 그 목록을 적는다", () => {
    const text = ratiosText(modelCatalog().find((row) => row.id === "nano-banana")!);

    expect(text).not.toContain("자유");
    expect(text.length).toBeGreaterThan(0);
  });
});
