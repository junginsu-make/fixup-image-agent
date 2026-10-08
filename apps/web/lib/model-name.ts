import { RETIRED_MODEL_NAME, imageModelName } from "@fixup/shared";

/**
 * 저장된 모델 id 를 **회원에게 보일 이름**으로 바꾼다.
 *
 * 이름의 정본은 `@fixup/shared` 의 `image-model-names.ts` 하나다. 여기는 그것을
 * 그대로 내보낸다 — 호출하는 쪽이 이전 이름(`modelDisplayName`)을 그대로 쓴다.
 *
 * 라이브러리 같은 곳은 **이미 만들어진 작업**이 들고 있는 id 를 되읽는다.
 * **모르는 id 에도 절대 원본을 되돌려주지 않는다.** 은퇴한 모델로 만든 옛 작업이
 * 남아 있는데, 모르면 그대로 내보내면 가려 놓은 이름이 그 자리에서 샌다.
 * 숨긴 모델·모르는 id 는 「이전 방식」으로 읽힌다.
 */
export { RETIRED_MODEL_NAME };

export function modelDisplayName(id: string | null | undefined): string {
  return imageModelName(id);
}
