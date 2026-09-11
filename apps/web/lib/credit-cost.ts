import { CARD_RATIOS, IMAGE_MODELS, modelById, unitPrice, type ImageMode } from "@fixup/sns-core";
import { creditUnits } from "@fixup/shared";

/**
 * 그림 한 장이 얼마인가 — **도구 넷이 같은 곳에서 본다.**
 *
 * ── 왜 이 파일이 있나 ────────────────────────────────────────
 *
 * 장을 실제 돈에 붙이기로 했는데(2026-09-08 사용자 결정, `@fixup/shared/credit`),
 * 단가를 아는 곳이 도구마다 달랐다.
 *
 *   이미지 만들기 · 카드뉴스   `sns-core` 의 크기별 표 (모델 넷)
 *   상세페이지 · 캐릭터        모델 여섯 — 둘은 그 표에 없다
 *   리디자인                  OpenAI·Google 직접 호출 — 표가 아예 없다
 *
 * 도구마다 따로 세면 같은 그림이 도구마다 다른 장수가 된다. 그래서 묻는 곳을
 * 하나로 모은다.
 *
 * **가능하면 `sns-core` 의 표를 쓴다.** 크기와 모드(i2i/t2i)까지 반영하는 진짜
 * 표는 거기 하나뿐이고, 두 벌로 적으면 언젠가 갈린다.
 */

/**
 * `sns-core` 표에 없는 모델들.
 *
 * 캐릭터 전용 둘은 크기별 표가 없어 한 값으로 둔다. 리디자인은 fal 을 안 거치고
 * OpenAI·Google 을 직접 부르므로 그 표에 있을 수가 없다.
 *
 * **`model_prices` 표와 같은 값이어야 한다.** 관리자가 거기서 단가를 고치면 이
 * 숫자도 함께 고쳐야 한다 — 매 요청마다 DB 를 읽으면 그림 만들기 앞에 왕복이
 * 하나 더 붙는다.
 */
const FLAT_USD: Record<string, number> = {
  // pdp-core 주석의 실측값: $0.0675(1536 이하) — Nano Banana Pro 의 절반 아래다.
  "seedream-5-pro": 0.0675,
  /**
   * fal 모델 페이지 공표값 (2026-09-10 확인, t2i·edit 두 페이지 모두 $0.075).
   *
   * 전에는 $0.0675 였다 — **재지도 읽지도 않고 seedream 과 같은 등급이라는
   * 이유로 같은 값을 적어 둔 것이었다.** 11% 적게 잡았으니 그만큼 덜 차감했다.
   * 공표값은 페이지에 그냥 적혀 있었다.
   */
  "qwen-image-2-pro": 0.075,
  /**
   * 리디자인 · OpenAI. **품질을 올리면서 값도 함께 올렸다(2026-09-11).**
   *
   * 이 값은 `redesign-core` 의 `IMAGE_QUALITY` 와 **한 몸이다.**
   *
   *   `low`  → $0.02   (오늘 아침까지 이 품질이었다)
   *   `high` → $0.21   ← 지금
   *
   * 한쪽만 고치면 **고품질 값을 받고 저품질을 만들어 주거나 그 반대**가 된다.
   * 실제로 그랬다 — 값은 $0.19(고품질 자리)인데 품질은 `low` 였다.
   *
   * $0.21 은 gpt-image-2 고품질 공개가다(1024×1024 $0.211, 1024×1536 $0.165).
   * 우리 출력은 1152×2048 이라 위쪽을 잡는다. **청구서로 대조한 값은 아니다** —
   * 적게 잡으면 우리가 손해를 보므로 안전한 쪽에 둔다.
   */
  "redesign-openai": 0.21,
  /**
   * 리디자인 · Google(gemini-3.1-flash-image-preview).
   *
   * 공개가가 해상도에 따라 $0.045~0.151 이고 1K 가 $0.067 이다. 지금 값은 그
   * 범위 안이라 그대로 둔다 — 해상도를 지정하지 않고 부르므로 위쪽을 잡는 편이
   * 안전하다.
   */
  "redesign-google": 0.13,
};

/** 기본 크기. 크기를 모르는 도구가 부를 때 쓴다. */
const DEFAULT_SIZE = { width: 1024, height: 1024 };

/**
 * 그림 한 장의 값.
 *
 * 모르는 모델이면 **가장 비싼 값**을 준다. 적게 잡는 쪽이 위험하다 — 공짜로
 * 만들 수 있는 구멍이 되기 때문이다(`sns-core` 의 `priceCoverage` 와 같은 판단).
 */
export function imageUnitUsd(
  modelId: string,
  options: { size?: { width: number; height: number }; mode?: ImageMode } = {},
): number {
  const flat = FLAT_USD[modelId];
  if (flat !== undefined) return flat;

  /**
   * **`modelById` 는 모르는 id 에 예외를 던진다.** 여기서 터뜨리면 그림 만들기
   * 전체가 죽는다 — 값을 못 세는 것보다 나쁘다. 못 찾으면 가장 비싼 값으로
   * 잡고 계속한다.
   */
  try {
    return unitPrice(modelById(modelId), options.mode ?? "i2i", options.size ?? DEFAULT_SIZE);
  } catch {
    return maxImageUnitUsd();
  }
}

/**
 * 아는 것 중 가장 비싼 한 장 값.
 *
 * **모델을 아직 모를 때 쓴다.** 캐릭터 각도는 결이 정해 주는 모델을 안쪽에서
 * 고르므로, 예약 시점에는 무엇이 될지 모른다. 그때는 **비싸게 잡아 두고 실제
 * 모델로 확정한다** — 적게 잡으면 한도를 넘겨 만들 수 있다.
 */
export function maxImageUnitUsd(): number {
  const prices = Object.values(FLAT_USD);
  for (const ratio of CARD_RATIOS) {
    /**
     * **목록을 손으로 적지 않는다.** 전에는 네 id 를 여기 박아 뒀는데, 모델을
     * 하나 더 비싼 것으로 들이면서 이 줄을 잊으면 「가장 비싼 값」이 실제보다
     * 싸진다. 그러면 예약이 모자란 채로 통과하고 **한도를 넘겨 만들 수 있다** —
     * 막히지 않고 조용히 새는 쪽이라 아무도 모른다.
     */
    for (const model of IMAGE_MODELS) {
      try { prices.push(unitPrice(model, "i2i", ratio.pixel)); } catch { /* 표가 없는 모델은 건너뛴다 */ }
    }
  }
  return Math.max(...prices);
}

/**
 * 이만큼 만들면 몇 장인가.
 *
 * 부르는 쪽이 「몇 장을 만드는지」만 알면 된다. 단가와 장 환산은 여기가 안다.
 */
export function imageCreditUnits(
  modelId: string,
  imageCount: number,
  options: { size?: { width: number; height: number }; mode?: ImageMode } = {},
): number {
  if (imageCount <= 0) return 0;
  return creditUnits(imageUnitUsd(modelId, options) * imageCount);
}
