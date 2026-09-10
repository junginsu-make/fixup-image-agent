import { IMAGE_MODELS as PDP_MODELS } from "@fixup/pdp-core";
import { IMAGE_MODELS as STUDIO_MODELS } from "@fixup/sns-core";

/**
 * 저장된 모델 id 를 **회원에게 보일 이름**으로 바꾼다.
 *
 * 목록(`pdp-core`·`sns-core`)은 고를 때 쓰는 것이고, 여기는 **이미 만들어진
 * 작업**이 들고 있는 id 를 되읽는 자리다. 라이브러리가 그동안 id 를 그대로
 * 찍고 있었다 — 「모델: gpt-image-2.5-flare」.
 *
 * **모르는 id 에도 절대 원본을 되돌려주지 않는다.** 은퇴한 모델로 만든 옛
 * 작업이 남아 있는데, 모르면 그대로 내보내는 식으로 두면 가려 놓은 이름이
 * 바로 그 자리에서 샌다. 이름을 못 찾는 것은 화면이 조금 덜 친절해지는
 * 일이고, 원본이 새는 것은 가린 이유가 통째로 사라지는 일이다.
 */
const ALIAS_BY_ID = new Map<string, string>([
  ...PDP_MODELS.map((model) => [model.id, model.label] as const),
  ...STUDIO_MODELS.map((model) => [model.id, model.label] as const),
]);

/** 목록에서 사라진 모델로 만든 옛 작업에 쓴다. */
export const RETIRED_MODEL_NAME = "이전 방식";

export function modelDisplayName(id: string | null | undefined): string {
  if (!id) return "—";
  return ALIAS_BY_ID.get(id) ?? RETIRED_MODEL_NAME;
}
