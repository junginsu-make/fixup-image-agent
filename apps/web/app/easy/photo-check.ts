import { chooseModelForRatio } from "@fixup/sns-core";

/**
 * **값이 나가기 전에 멈춘다**(설계 §2-3 ⓪ · §2-6 ⓒ).
 *
 * ⓪ 붙인 사진 id 는 화면이 보낸 값이다. 이미지 만들기의 조회는 볼 수 없는 id 를
 *    **오류 없이 뺀다**(`reference-images.ts:248`). 그대로 가면 사진이 빠진 채
 *    만들어지거나 번호가 당겨져 말 속의 「2번」이 다른 사진을 가리킨다.
 * ⓒ 이미지 만들기는 모델 상한을 **그림을 만들기 직전**에 본다. 「쉽게」는 그 전에
 *    기획을 돌려 값을 확정하므로, 여기서 먼저 봐야 기획값만 나가는 일이 없다.
 */

export const UNUSABLE_PHOTO = "붙인 사진 중 쓸 수 없는 것이 있습니다. 그 사진을 빼고 다시 보내 주세요.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 글자인 id 만, 처음 자리 하나만. 번호(①②)가 이 차례다. */
export function uniqueIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((one, index): one is string =>
    typeof one === "string" && one.length > 0 && raw.indexOf(one) === index);
}

/** 사진 id 는 uuid 다. 모양이 틀리면 조회가 오류를 던지므로 그 전에 거른다. */
export function isPhotoId(id: string): boolean {
  return UUID.test(id);
}

/** 요청했는데 안 나온 것. 하나라도 있으면 멈춘다 — 조용히 빼지 않는다. */
export function missingIds(requested: readonly string[], found: ReadonlyArray<{ id: string }>): string[] {
  const have = new Set(found.map((one) => one.id));
  return requested.filter((id) => !have.has(id));
}

export type PhotoLimit = { ok: true; modelId: string; max: number } | { ok: false; message: string };

/**
 * 이 장수를 실제로 쓸 모델이 받을 수 있나.
 *
 * **생성 라우트와 같은 모델 고르기를 쓴다**(`chooseModelForRatio`). 비율 때문에
 * 모델이 바뀌면 상한도 바뀐다.
 */
export function photoLimit(input: { ratio: string; imageModel?: string; count: number }): PhotoLimit {
  const { model } = chooseModelForRatio(input.ratio, input.imageModel ?? "");
  if (input.count <= model.maxReferenceImages) {
    return { ok: true, modelId: model.id, max: model.maxReferenceImages };
  }
  return {
    ok: false,
    message: `「${model.label}」 모델은 사진을 ${model.maxReferenceImages}장까지 받습니다. `
      + `지금 ${input.count}장입니다. 몇 장을 빼거나 다른 이미지 모델을 골라 주세요.`,
  };
}
