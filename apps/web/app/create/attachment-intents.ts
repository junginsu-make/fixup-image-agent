import type { AttachmentIntents } from "@fixup/pdp-core";

/**
 * 첨부 자리별 지시를 **붙어 있는 자리만** 남긴다.
 *
 * 레퍼런스에 「색만 가져와」라고 적어 두고 레퍼런스를 지우면, 적은 말은 화면에서
 * 사라지지만 상태에는 남는다. 그대로 보내면 붙어 있지도 않은 그림에 대한 지시가
 * 프롬프트에 실린다 — 사용자는 왜 이상한 말이 반영되는지 알 수 없다.
 *
 * 카드뉴스에서 같은 자리를 겪었다(`slot-rows.ts` 의 `visibleIntents`).
 *
 * **제품 자리도 물어본다.** 「자리가 비지 않는다」와 「같은 그림이다」는 다른 말이다.
 * 다른 작업을 불러오면 제품이 바뀌는데, 앞 제품에 대해 적은 말이 그대로 남으면
 * 새 제품의 보호 문구가 엉뚱한 이유로 풀린다. 글로 시작한 경로에는 제품 사진이
 * 아예 없다.
 */
export interface AttachedSlots {
  /** 제품 사진이 실제로 붙어 있는가. 글로 시작한 경로에는 없다. */
  anchor: boolean;
  /** 인물 사진 또는 캐릭터 중 하나라도 골랐는가. */
  person: boolean;
  /** 디자인 레퍼런스를 골랐는가. */
  style: boolean;
}

export function visibleIntents(
  intents: AttachmentIntents,
  attached: AttachedSlots,
): AttachmentIntents {
  const kept: AttachmentIntents = {};
  const put = (key: keyof AttachmentIntents, present: boolean) => {
    const text = intents[key]?.trim();
    if (present && text) kept[key] = text;
  };

  put("anchor", attached.anchor);
  put("person", attached.person);
  put("style", attached.style);
  return kept;
}

/** 보낼 것이 하나도 없으면 아예 안 보낸다. 빈 객체를 실으면 「적었다」로 읽힌다. */
export function intentsOrUndefined(
  intents: AttachmentIntents,
  attached: AttachedSlots,
): AttachmentIntents | undefined {
  const kept = visibleIntents(intents, attached);
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * 화면 상태에서 「어느 자리가 붙어 있나」를 읽는다.
 *
 * 화면 안에 두면 시험이 못 잡는다 — 조건 하나를 지워도 1,300건이 전부 통과한다.
 * 실제로 독립 리뷰가 그렇게 재서 잡아냈다.
 */
export function attachedSlotsOf(input: {
  preparedImage: unknown;
  modelImage: unknown;
  characterId: string | undefined;
  styleReference: unknown;
  /** 시나리오 화면의 「디자인 레퍼런스 쓰기」 토글. 끄면 그림도 지시도 안 간다. */
  styleReferenceEnabled: boolean;
}): AttachedSlots {
  return {
    anchor: Boolean(input.preparedImage),
    person: Boolean(input.modelImage || input.characterId),
    style: Boolean(input.styleReferenceEnabled && input.styleReference),
  };
}
