import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_MODEL,
  TEXT_MODELS,
  textModelChoices,
  textModelVendor,
} from "../text-models";
import { LLM_PRICES } from "../llm-price";

/**
 * Easy 모드의 **글 모델 드롭다운**(설계 §5-4·§7).
 *
 * 사용자가 값을 알고 고를 수 있어야 한다. 글 모델은 가장 싼 것과 가장 비싼 것이
 * **열 배 넘게** 벌어지는데, 그림값과 달리 고르는 사람이 그 차이를 모른다.
 */

describe("글 모델 목록", () => {
  /**
   * **단가를 두 벌로 적지 않는다.**
   *
   * 여기에 값을 손으로 적으면 `LLM_PRICES` 와 두 벌이 되고, 하나는 곧 낡는다.
   * 그리고 **낡은 쪽이 화면에 보인다** — 사용자가 보는 유일한 값 정보다.
   */
  it("단가를 스스로 적지 않는다", () => {
    for (const model of TEXT_MODELS) {
      expect(Object.keys(model), `${model.id} 가 값을 직접 갖고 있다`)
        .not.toContain("inputPerMillion");
    }
  });

  /**
   * **값을 모르는 모델은 목록에 안 넣는다.**
   *
   * `priceOf` 는 모르는 모델에 「아는 것 중 가장 비싼 값」을 물린다. 안전한
   * 기본값이지만 **화면에 그 값이 그대로 보인다** — 사용자는 그것이 진짜 값인 줄
   * 안다. 설계 §5-4 가 「값을 모르는 채로 넣지 않는다」고 못 박은 이유다.
   */
  it("목록의 모든 모델이 단가표에 있다", () => {
    for (const model of TEXT_MODELS) {
      expect(LLM_PRICES[model.id], `${model.id} 의 단가가 표에 없다`).toBeDefined();
    }
  });

  it("기본은 지금 기획이 쓰는 모델이다", () => {
    // 바꾸려면 근거가 있어야 한다(설계 §5-4). 값이 다섯 배인 모델로 기본을
    // 옮기면 근거 없이 다섯 배를 낸다.
    expect(DEFAULT_TEXT_MODEL).toBe("claude-sonnet-5");
    expect(TEXT_MODELS.some((model) => model.id === DEFAULT_TEXT_MODEL)).toBe(true);
  });

  it("id 가 겹치지 않는다", () => {
    const ids = TEXT_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** 드롭다운에 이름과 한 줄 설명이 같이 나온다. 빈 것이 있으면 줄이 비어 보인다. */
  it("이름과 설명이 다 있다", () => {
    for (const model of TEXT_MODELS) {
      expect(model.label.trim().length, `${model.id} 의 이름이 없다`).toBeGreaterThan(0);
      expect(model.note.trim().length, `${model.id} 의 설명이 없다`).toBeGreaterThan(0);
    }
  });
});

describe("화면에 낼 목록", () => {
  const choices = textModelChoices();

  it("값을 단가표에서 가져온다", () => {
    const sonnet = choices.find((choice) => choice.id === "claude-sonnet-5")!;

    expect(sonnet.price).toEqual(LLM_PRICES["claude-sonnet-5"]);
  });

  /**
   * **싼 것부터 낸다.** 사용자가 값을 보고 고르는 자리이므로, 목록의 차례가
   * 그 판단을 돕는다.
   */
  it("싼 것부터 낸다", () => {
    const outputs = choices.map((choice) => choice.price.outputPerMillion);

    expect([...outputs].sort((a, b) => a - b)).toEqual(outputs);
  });

  it("기본 모델을 표시한다", () => {
    const 기본 = choices.filter((choice) => choice.isDefault);

    expect(기본).toHaveLength(1);
    expect(기본[0]!.id).toBe(DEFAULT_TEXT_MODEL);
  });
});

describe("어느 업체로 부르나", () => {
  /**
   * **고른 모델을 실제로 부르려면 SDK 를 갈라야 한다.**
   *
   * 목록에 Anthropic 과 OpenAI 가 섞여 있다. 업체를 안 가르면 드롭다운이
   * **모양만 있고** 아무것도 안 한다 — 2026-09-18 에 실제로 그랬다.
   */
  it("claude 는 anthropic 으로", () => {
    expect(textModelVendor("claude-sonnet-5")).toBe("anthropic");
    expect(textModelVendor("claude-opus-5")).toBe("anthropic");
  });

  it("gpt 는 openai 로", () => {
    expect(textModelVendor("gpt-5.6-sol")).toBe("openai");
  });

  /** 목록에 있는 것은 **모두** 업체가 정해져 있어야 한다. 하나라도 모르면 못 부른다. */
  it("목록의 모든 모델에 업체가 있다", () => {
    for (const model of TEXT_MODELS) {
      expect(textModelVendor(model.id), `${model.id} 의 업체를 모른다`).toBeTruthy();
    }
  });

  /**
   * **모르는 이름은 기본으로 떨어진다.** 지어내면 없는 SDK 를 부르고, 그
   * 실패가 「기획이 안 됐다」로만 보인다.
   */
  it("모르는 이름은 기본 모델의 업체로", () => {
    expect(textModelVendor("어디서-온-모델-9")).toBe(textModelVendor(DEFAULT_TEXT_MODEL));
  });
});
