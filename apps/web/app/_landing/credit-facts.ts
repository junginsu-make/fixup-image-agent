import { IMAGE_MODELS, unitPrice } from "@fixup/sns-core";
import { creditUnits } from "@fixup/shared";

/**
 * 랜딩이 말하는 **크레딧 사실**. 손으로 안 적는다.
 *
 * ── 왜 생겼나 ────────────────────────────────────────────────
 *
 * 2026-09-21 에 설명서의 크레딧 표가 틀린 것을 고쳤는데, **공개 홈에 같은 옛
 * 숫자가 그대로 남아 있었다.**
 *
 *   「정밀형 · 가중치 4」        실제 **5장**
 *   「원가 차이 최대 4.6배」      실제 **5.4배**
 *   「모델별 가중치 4 / 3 / 1」   가중치 방식은 2026-09-08 에 그만뒀다
 *
 * 로그인도 필요 없는 화면이라 검색엔진도 읽는다. **틀린 값이 가장 멀리 가는
 * 자리**였다.
 *
 * ── 차감은 가중치가 아니라 원가에서 나온다 ───────────────────
 *
 * 2026-09-08 부터 장(크레딧)은 **실제 지불액**에 붙는다(`credit.ts`). 정수
 * 가중치를 쓰던 때는 같은 「1장」이 모델마다 $0.039~$0.060 으로 54% 차이가
 * 났고, 싼 모델을 쓰는 사람이 손해를 봤다.
 *
 * 그래서 「가중치」라는 말 자체를 안 쓴다. 숫자는 쓰는 그 함수로 셈한다 —
 * 모델 표가 바뀌면 홈도 같이 바뀐다.
 */

/** 표가 기준으로 삼는 크기. 정사각 1024 는 가장 흔한 한 장이다. */
const 기준크기 = { width: 1024, height: 1024 };

function 한장당(id: string): number {
  const model = IMAGE_MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`모델 표에 없습니다: ${id}`);
  return creditUnits(unitPrice(model, "t2i", 기준크기));
}

/**
 * 정사각 한 장을 만들 때 깎이는 장수.
 *
 * **id 로 집는다.** 「가장 비싼 것」처럼 순위로 집으면 모델이 드나들 때 홈이
 * 말하는 모델과 표의 모델이 조용히 갈린다.
 */
export const LANDING_CREDITS = {
  정밀형: 한장당("gpt-image-2"),
  속도형: 한장당("nano-banana-pro"),
  경제형: 한장당("nano-banana"),
} as const;

/**
 * 가장 비싼 모델이 가장 싼 모델의 몇 배인가.
 *
 * 소수 한 자리로 적는다 — 「5.4배」는 읽는 사람이 크기를 가늠하는 말이지
 * 정산에 쓰는 값이 아니다.
 */
export const LANDING_COST_SPREAD = (() => {
  const 값 = IMAGE_MODELS.map((model) => unitPrice(model, "t2i", 기준크기));
  return (Math.max(...값) / Math.min(...값)).toFixed(1);
})();
