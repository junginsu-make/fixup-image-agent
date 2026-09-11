import { describe, expect, it } from "vitest";
import { CARD_RATIOS, IMAGE_MODELS, unitPrice } from "@fixup/sns-core";
import { imageCreditUnits, imageUnitUsd, maxImageUnitUsd } from "../credit-cost";

/**
 * 도구 넷이 **같은 곳에서** 단가를 본다 (2026-09-08 사용자 결정).
 *
 * 전에는 도구마다 따로 셌다. 상세페이지·캐릭터는 손으로 매긴 정수 가중치,
 * 리디자인은 무엇이든 1장으로 세었다. 단가에 묶은 뒤로는 저절로 따라온다.
 */

describe("한 장이 얼마인가", () => {
  it("표가 있는 모델은 그 표를 쓴다", () => {
    // 2026-09-08 실측. 이 값이 바뀌면 시험이 알려 준다.
    expect(imageUnitUsd("nano-banana", { size: { width: 1024, height: 1536 } })).toBeCloseTo(0.039, 4);
    expect(imageUnitUsd("gpt-image-2", { size: { width: 1024, height: 1536 } })).toBeCloseTo(0.178, 4);
  });

  it("**크기가 반영된다** — 정수 가중치로는 못 하던 것", () => {
    const tall = imageUnitUsd("gpt-image-2", { size: { width: 1024, height: 1536 } });
    const square = imageUnitUsd("gpt-image-2", { size: { width: 1024, height: 1024 } });
    expect(square).toBeGreaterThan(tall);
  });

  it("표에 없는 모델은 정해 둔 값을 쓴다", () => {
    // 전부 fal·공급자 공표값이다 (2026-09-10 모델 페이지에서 다시 확인).
    expect(imageUnitUsd("seedream-5-pro")).toBe(0.0675);
    // **$0.0675 였다가 고쳤다.** 재지도 읽지도 않고 seedream 등급에서 옮겨 적은
    // 값이라 11% 적게 차감하고 있었다. 공표값은 t2i·edit 두 페이지 모두 $0.075 다.
    expect(imageUnitUsd("qwen-image-2-pro")).toBe(0.075);
    /**
     * **$0.19 였다가 $0.02 로 내렸다(2026-09-11).**
     *
     * $0.19 는 잰 값이 아니라 「청구서로 확인 후 조정」이라 적어 두고 굳은
     * 값이었다. 그런데 리디자인은 그림을 `quality: "low"` 로 부른다 —
     * 공개가로 저품질은 $0.01~0.02 대다. **고품질 값을 받고 저품질을 만들어
     * 주고 있었다.**
     */
    expect(imageUnitUsd("redesign-openai")).toBe(0.165);
    expect(imageUnitUsd("redesign-google")).toBe(0.13);
  });

  it("**모르는 모델은 가장 비싼 값으로 잡는다** — 적게 잡으면 공짜 구멍이 된다", () => {
    expect(imageUnitUsd("아직-없는-모델")).toBe(maxImageUnitUsd());
    expect(maxImageUnitUsd()).toBeGreaterThanOrEqual(0.219);
  });

  it("목록에 있는 어느 모델보다도 싸지 않다", () => {
    /**
     * 위 `0.219` 는 **오늘 가장 비싼 모델의 값**이라 목록이 늘어도 안 움직인다.
     * 더 비싼 모델이 들어오는데 `maxImageUnitUsd` 가 그것을 못 보면, 예약이
     * 모자란 채로 통과해 **한도를 넘겨 만들 수 있다.** `unitPrice` 가 던지면
     * `catch` 가 조용히 삼키므로 오류로도 안 보인다. 그래서 값을 목록에서
     * 다시 세어 맞댄다.
     */
    const 아는것중최대 = Math.max(
      ...IMAGE_MODELS.flatMap((model) =>
        CARD_RATIOS.map((ratio) => {
          try { return unitPrice(model, "i2i", ratio.pixel); } catch { return 0; }
        }),
      ),
    );
    expect(아는것중최대).toBeGreaterThan(0);
    expect(maxImageUnitUsd()).toBeGreaterThanOrEqual(아는것중최대);
  });
});

describe("몇 장을 만들면 몇 장인가", () => {
  it("장수만큼 곱한다", () => {
    // $0.165 × 3 = $0.495 → 올림($0.495 / $0.05) = 10장
    expect(imageCreditUnits("redesign-openai", 3)).toBe(10);
  });

  /**
   * 하루 사이 4장 → 1장 → 5장 → 4장으로 움직였다. **숫자가 흔들린 것이 아니라
   * 무엇을 쓰는지가 흔들렸다** — 값이 $0.19 인데 저품질로 부르고 있던 것을
   * 바로잡느라 1장까지 내렸고, 품질을 올리며 5장이 됐다가, gpt-image-2.5 로
   * 옮기면서 더 좋은 그림을 더 싸게 만들게 되어 4장으로 돌아왔다.
   */
  it("리디자인 한 장은 4장, Google 은 3장이다", () => {
    expect(imageCreditUnits("redesign-openai", 1)).toBe(4);
    expect(imageCreditUnits("redesign-google", 1)).toBe(3);
  });

  it("안 만들면 0장", () => {
    expect(imageCreditUnits("gpt-image-2", 0)).toBe(0);
    expect(imageCreditUnits("gpt-image-2", -1)).toBe(0);
  });
});

/**
 * **상한을 넘으면 예약이 통째로 막힌다.**
 *
 * `max_reserve_units()` 가 60 이다. 넘으면 사용자는 「사용량을 확인하지
 * 못했습니다」만 보고 이유를 알 수 없다. 정수 가중치를 실제 단가로 바꾸면서
 * 장수가 커졌으므로, 현실적으로 가능한 가장 큰 조합을 재 둔다.
 */
describe("가장 큰 조합도 상한 60 안에 있는가", () => {
  const CAP = 60;

  it("상세페이지 — 7섹션 × 가장 비싼 모델", () => {
    expect(imageCreditUnits("gpt-image-2", 7)).toBeLessThanOrEqual(CAP);
  });

  it("리디자인 — 10장 × OpenAI", () => {
    expect(imageCreditUnits("redesign-openai", 10)).toBeLessThanOrEqual(CAP);
  });

  it("캐릭터 — 후보 3 + 각도 6", () => {
    expect(imageCreditUnits("gpt-image-2", 9)).toBeLessThanOrEqual(CAP);
  });

  it("카드뉴스 — 카드 10장", () => {
    expect(imageCreditUnits("gpt-image-2", 10)).toBeLessThanOrEqual(CAP);
  });

  it("이미지 만들기 — 변형 3장", () => {
    expect(imageCreditUnits("gpt-image-2", 3)).toBeLessThanOrEqual(CAP);
  });
});
