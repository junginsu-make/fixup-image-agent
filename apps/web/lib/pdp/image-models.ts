import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";

/*
  **상세페이지에서는 나노바나나 일반판(경제형)을 고를 수 없다**(2026-10-07 사용자 지시).

  운영 기록에서 상세페이지 품질 검사를 3번 다 떨어졌다(다른 모델은 31번 다 통과).
  `IMAGE_MODELS` 에서 지우지 않는다 — 스튜디오·카드뉴스·쉽게가 계속 쓴다.
*/
const PDP_RETIRED_MODELS: readonly string[] = ["nano-banana"];

export const PDP_RETIRED_MODEL_MESSAGE =
  "이 이미지 모델은 상세페이지에서 더 이상 쓰지 않습니다. 새로고침한 뒤 다시 만들어 주세요.";

/** 상세페이지 화면에 띄우는 모델. 캐릭터에서 먼저 비교 중인 모델도 뺀다. */
export const PDP_IMAGE_MODELS = IMAGE_MODELS.filter(
  (model) => !model.characterOnly && !PDP_RETIRED_MODELS.includes(model.id),
);

export function isRetiredPdpModel(id: string | null | undefined): boolean {
  return id != null && PDP_RETIRED_MODELS.includes(id);
}

/** 저장된 작업에 남은 옛 선택·모르는 값은 기본 모델로 연다. */
export function pdpImageModelOrDefault(id: string | null | undefined): ImageModelId {
  return PDP_IMAGE_MODELS.some((model) => model.id === id) ? (id as ImageModelId) : DEFAULT_IMAGE_MODEL;
}
