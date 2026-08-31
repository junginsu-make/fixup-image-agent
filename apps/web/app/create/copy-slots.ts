import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 편집기에서 **눌러서 이미지에 얹을 수 있는** 카피 자리.
 *
 * ## 왜 목록으로 두는가
 *
 * 예전에는 자리마다 JSX 를 손으로 썼다. 그러다 두 번 같은 사고가 났다 —
 * 신뢰문구와 CTA 가 **화면에는 보이는데 눌러도 아무 일이 없었다**(`onClick` 누락).
 * 사용자에게는 "있는데 못 쓰는 카피"였고, 화면만 봐서는 구분되지 않았다.
 *
 * 목록으로 두면 `onClick` 을 빼먹는 일이 **구조적으로 불가능하다.** 목록의 각 항목은
 * `overlayType` 을 반드시 갖고, 화면은 그것을 그대로 쓴다. 테스트로 잡는 것보다
 * 애초에 못 만들게 하는 편이 낫다.
 *
 * ## 불릿과 CTA 는 여기 없다
 *
 * - **불릿**은 개수가 정해지지 않아 목록을 돌며 그린다. 자리 하나가 아니다
 * - **CTA** 는 아예 만들지 않는다(사용자 결정 2026-07-30). 이미지에 그리면 눌리지
 *   않는 그림 버튼이 되고, 실제 구매 버튼은 쇼핑몰이 붙인다
 *
 * 새 카피 자리를 더할 때는 이 목록에 넣거나, 넣지 않는 이유를 `UNPLACEABLE_SLOTS` 에
 * 적는다. 둘 다 안 하면 테스트가 막는다.
 */

/** 얹을 때 쓰는 서식 종류. 자리마다 크기·굵기가 다르다. */
export type CopyOverlayType = "headline" | "subheadline" | "keypoint" | "trust";

export interface CopySlot {
  /**
   * pdp-core `CopyTarget` 의 자리 이름. 테스트가 이 값으로 "빠진 자리"를 찾는다 —
   * 화면 이름(label)이나 서식 이름(overlayType)과 달리, 이것이 카피 필드의 정식 이름이다.
   */
  slot: "headline" | "subheadline" | "trust_or_objection_line";
  /** 화면에 보이는 이름. */
  label: string;
  /** 어떤 서식으로 얹을지. */
  overlayType: CopyOverlayType;
  /** 강한 블록인가(제목) 조용한 블록인가(부제·신뢰문구). */
  tone: "strong" | "soft";
  /** 이 자리의 한국어·영어 문구를 꺼낸다. */
  read: (section: SectionBlueprint) => { ko: string; en: string };
}

export const COPY_SLOTS: readonly CopySlot[] = [
  {
    slot: "headline",
    label: "Headline",
    overlayType: "headline",
    tone: "strong",
    read: (section) => ({ ko: section.headline, en: section.headline_en }),
  },
  {
    slot: "subheadline",
    label: "Subheadline",
    overlayType: "subheadline",
    tone: "soft",
    read: (section) => ({ ko: section.subheadline, en: section.subheadline_en }),
  },
  {
    slot: "trust_or_objection_line",
    label: "Trust / Objection",
    overlayType: "trust",
    tone: "soft",
    read: (section) => ({
      ko: section.trust_or_objection_line,
      en: section.trust_or_objection_line_en,
    }),
  },
];

/**
 * 얹는 자리를 두지 **않는** 카피와 그 이유.
 *
 * 여기에 적지 않은 새 카피 자리는 테스트가 막는다 — "화면에 있는데 못 쓰는 카피"가
 * 다시 생기지 않게 하려는 것이다.
 */
export const UNPLACEABLE_SLOTS: Readonly<Record<string, string>> = {
  bullet: "개수가 정해지지 않아 목록을 돌며 그린다. 자리 하나가 아니다.",
  CTA: "만들지 않는다(사용자 결정 2026-07-30). 실제 구매 버튼은 쇼핑몰이 붙인다.",
  prompt_ko: "이미지 지시문이다. 페이지에 그리는 카피가 아니다.",
};

/**
 * 자리별 오버레이 서식.
 *
 * 신뢰문구는 불릿보다 작고 조용해야 한다 — 크게 넣으면 제목과 주인 자리를 다툰다.
 */
export function overlayStyleFor(type: CopyOverlayType): {
  fontSize: number;
  fontWeight: string;
  maxWidth: number;
} {
  switch (type) {
    case "headline":
      return { fontSize: 42, fontWeight: "700", maxWidth: 360 };
    case "subheadline":
      return { fontSize: 24, fontWeight: "500", maxWidth: 320 };
    case "keypoint":
      return { fontSize: 18, fontWeight: "700", maxWidth: 280 };
    case "trust":
      return { fontSize: 16, fontWeight: "500", maxWidth: 280 };
  }
}
