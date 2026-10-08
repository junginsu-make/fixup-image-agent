import { DEFAULT_IMAGE_MODEL, VISIBLE_PDP_MODELS } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";

/*
  **상세페이지 그림 모델은 셋 — 표준형(기본)·디테일형·속도형**(2026-10-08 오후 사용자 결정).

  다른 화면과 같은 등급 이름을 쓴다. 이름표 정본은 packages/shared/src/image-model-names.ts 이고,
  설명·차감은 pdp-core 의 보이는 목록(`VISIBLE_PDP_MODELS`) 그대로다. 크레딧은 그대로 — 한 장 1크레딧.

  `IMAGE_MODELS` 는 고치지 않는다 — 숨긴 모델도 옛 작업을 열 때 필요해서 전체 목록은 남는다.
*/
export const PDP_RETIRED_MODEL_MESSAGE =
  "이 이미지 모델은 상세페이지에서 더 이상 쓰지 않습니다. 새로고침한 뒤 다시 만들어 주세요.";

/** 상세페이지 화면에 띄우는 모델 — 정한 차례대로, 등급 이름으로. */
export const PDP_IMAGE_MODELS = VISIBLE_PDP_MODELS;

/** 상세페이지에서 안 쓰는 모델인가. 안 보낸 것(기본 모델로 간다)은 아니다. */
export function isRetiredPdpModel(id: string | null | undefined): boolean {
  return id != null && !PDP_IMAGE_MODELS.some((model) => model.id === id);
}

/** 저장된 작업에 남은 옛 선택·모르는 값은 기본 모델로 연다. */
export function pdpImageModelOrDefault(id: string | null | undefined): ImageModelId {
  return PDP_IMAGE_MODELS.some((model) => model.id === id) ? (id as ImageModelId) : DEFAULT_IMAGE_MODEL;
}
