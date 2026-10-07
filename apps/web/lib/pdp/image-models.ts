import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";

/*
  **상세페이지 그림 모델은 둘 — GPT Image 2.5(기본)와 Nano Banana Pro**(2026-10-08 사용자 결정).

  2026-10-07 에 나노바나나 일반판(경제형)을 뺐다 — 운영 기록에서 상세페이지 품질 검사를 3번 다
  떨어졌다. 이어서 고를 수 있는 것을 둘로 줄였다. 이름은 등급(경제형·표준형)이 아니라 **실제
  모델 이름**으로 보인다(사용자 결정). 크레딧은 그대로다 — 두 모델 모두 한 장 1크레딧.

  `IMAGE_MODELS` 는 고치지 않는다 — 스튜디오·카드뉴스·쉽게가 같은 목록과 이름을 쓴다.
*/
const PDP_MODEL_NAMES: ReadonlyArray<{ id: ImageModelId; label: string }> = [
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
];

export const PDP_RETIRED_MODEL_MESSAGE =
  "이 이미지 모델은 상세페이지에서 더 이상 쓰지 않습니다. 새로고침한 뒤 다시 만들어 주세요.";

/** 상세페이지 화면에 띄우는 모델 — 정한 차례대로, 상세페이지 이름으로. 설명·차감은 공용 목록 그대로. */
export const PDP_IMAGE_MODELS = PDP_MODEL_NAMES.flatMap(({ id, label }) => {
  const model = IMAGE_MODELS.find((entry) => entry.id === id);
  return model ? [{ ...model, label }] : [];
});

/** 상세페이지에서 안 쓰는 모델인가. 안 보낸 것(기본 모델로 간다)은 아니다. */
export function isRetiredPdpModel(id: string | null | undefined): boolean {
  return id != null && !PDP_IMAGE_MODELS.some((model) => model.id === id);
}

/** 저장된 작업에 남은 옛 선택·모르는 값은 기본 모델로 연다. */
export function pdpImageModelOrDefault(id: string | null | undefined): ImageModelId {
  return PDP_IMAGE_MODELS.some((model) => model.id === id) ? (id as ImageModelId) : DEFAULT_IMAGE_MODEL;
}
