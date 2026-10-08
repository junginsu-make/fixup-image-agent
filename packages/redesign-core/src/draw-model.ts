import { imageModelName } from "@fixup/shared";

/**
 * **실제로 그리는 모델**(2026-10-08, 세 모델).
 *
 * 앱이 그림 통로(`generateImage`)를 넘길 때 함께 준다. `id` 는 fal 모델 id
 * (`nano-banana-2.1`), `endpoint` 는 글 모델에게 알릴 이름(`modelEndpointLabel`).
 * 코어는 fal 모델 목록(`sns-core`)을 모르므로 앱이 만들어 준다.
 *
 * 없으면 옛 직접 호출로 그린다 — 그때는 그 호출의 id 를 쓴다.
 */
export type DrawModel = { id: string; endpoint: string };

/** 회원에게 보일 이름. 모르면 「선택한 모델」 — 옛 이름(정밀형 등)을 지어내지 않는다. */
export function drawModelName(drawModel?: DrawModel): string {
  return drawModel ? imageModelName(drawModel.id) : "선택한 모델";
}

/** 서버 키가 없을 때의 말. 분석 AI 키지만 회원에게는 고른 모델로 말한다. */
export function missingKeyMessage(drawModel?: DrawModel): string {
  return `${drawModelName(drawModel)}의 API 키가 필요합니다.`;
}
