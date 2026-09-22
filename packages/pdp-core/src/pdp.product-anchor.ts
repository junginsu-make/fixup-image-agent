import type { OfferingKind } from "./types";

/**
 * 앵커(이 페이지의 기준 이미지)를 섹션 생성에 함께 보낼지 정한다.
 *
 * 앵커는 섹션마다 같은 상품이 나오게 하는 장치다. 섹션 이미지는 서로를 모른 채
 * 따로 만들어지므로, 매번 같은 앵커를 함께 보내 "이 상품은 이렇게 생겼다"를
 * 알려준다.
 *
 * 스타일 레퍼런스가 들어오면서 참조가 둘이 됐다. 둘이 다른 것을 요구하면
 * 모델이 절충한다 — 실측에서 배경과 글자는 레퍼런스(네이비+옐로)를 따랐는데
 * 제품 라벨만 앵커 성향으로 크림색이 남았다. 레퍼런스만 보내니 라벨까지
 * 레퍼런스를 따랐다.
 *
 * 그래서 사용자가 고르게 한다. 무엇을 지킬지는 자기 상품을 아는 사람이
 * 제일 잘 안다 — 상품 유형 추론은 LLM 짐작이라 틀릴 수 있다.
 *
 * ## 「빼는 것」은 해법이 아니었다 (U-03, 2026-09-18)
 *
 * 위 실측은 여전히 참이다. 그런데 해법으로 **앵커를 뺐던 것**이 틀렸다 —
 * 실물 제품 사진을 빼면 모델은 **제품을 지어낸다.** 「조금 달라진다」가 아니라
 * 없는 제품이 나온다.
 *
 * 이제 절충은 **지시로** 푼다(`anchorRoleFor`).
 *
 * ## 아직 재지 않은 것
 *
 * **`shape-only` 가 실제로 색을 넘기는지는 실측하지 않았다.** 오히려
 * `pdp.reference-policy.ts` 머리말의 2026-07-30 실측은 반대 방향을 가리킨다 —
 * 「정체성은 첨부된 이미지가 지킨다. 설명이 필요 없다」, 제품 보존 지시가 아예
 * 없는 조건에서도 정체성이 유지됐다. **지시문은 조이는 쪽으로도 잘 안 들었는데
 * 푸는 쪽으로 듣기를 기대하는 셈이다.**
 *
 * 그래도 이쪽이 낫다고 본다 — 측정된 손상(제품 날조)을 미측정 가설과 맞바꿨고,
 * 최악의 경우에도 「레퍼런스 색이 덜 반영된다」에 그친다. 화면 문구는 그래서
 * 단정하지 않는다.
 *
 * ## 앵커가 늘 실물인 것은 아니다
 *
 * 글 경로의 앵커는 **우리가 만든 대표 이미지**다(`TextModeFlow` 의 keyVisual).
 * 거기엔 헤드라인 글자와 임의의 소품이 박혀 있다. 그것을 「판매 중인 제품,
 * 라벨 글자까지 지켜라」로 선언하면 그 글자가 페이지 전체에 되풀이된다.
 */

/** 지킬 실물이 없는 유형들. 이 경우 디자인을 온전히 받는 편이 낫다. */
const INTANGIBLE_KINDS: OfferingKind[] = [
  "course",
  "coaching",
  "subscription",
  "software",
  "community",
];

/**
 * **실물 제품 사진은 언제나 보낸다**(U-03).
 *
 * 전에는 보존을 끄면 `false` 를 돌려줘 **제품 사진을 아예 안 보냈다.** 그러면
 * 모델은 레퍼런스만 보고 **제품을 지어낸다.** 화면은 그것을 「섹션마다 제품
 * 모습이 조금씩 달라질 수 있습니다」라고 말했는데, 사실은 「다른 제품이
 * 나옵니다」였다.
 *
 * 설계 §9.1(U-03): 「실물 product 역할의 **보존 불변**」. 토글이 정하는 것은
 * **얼마나 지킬 것인가**지 **보낼 것인가**가 아니다 — 그것은 `anchorRoleFor`.
 *
 * 남겨 둔다. 부르는 쪽이 「보낼까 말까」를 여기서 묻는 것이 맞고, 언젠가 실물이
 * 없는 입력(글 경로)이 이 길로 들어오면 그때 답이 갈린다.
 */
export function shouldSendAnchor(input: {
  anchorKind?: AnchorKind;
  hasStyleReference: boolean;
}) {
  // **실물 제품 사진은 언제나 보낸다.** 빼면 모델이 제품을 지어낸다.
  if ((input.anchorKind ?? "product-photo") === "product-photo") return true;

  /*
    대표 이미지는 우리가 만든 것이라 「지켜야 할 실물」이 아니다. 디자인
    레퍼런스가 있으면 그쪽이 이 페이지의 기준이고, 둘 다 보내면 모델이
    절충한다 — 원래 실측이 말한 그 절충이다.
  */
  return !input.hasStyleReference;
}

/**
 * 제품 참조를 **얼마나 지킬 것인가.**
 *
 * | | 뜻 |
 * |---|---|
 * | `identity` | 형태·색·재질·라벨을 모두 지킨다 |
 * | `shape-only` | **형태와 라벨 글자만** 지키고, 색·마감은 레퍼런스를 따른다 |
 *
 * 참조가 둘이면 모델이 절충한다 — 실측에서 배경과 글자는 레퍼런스를 따랐는데
 * 제품 라벨만 앵커 성향으로 크림색이 남았다. 무엇을 양보할지는 자기 상품을
 * 아는 사람이 정한다.
 *
 * **형태만이어도 라벨 글자는 지킨다.** 글자가 바뀌면 그건 다른 제품이고, 없는
 * 브랜드를 지어낸 것이 된다.
 */
export type AnchorRole = "identity" | "shape-only" | "mood-only";

/**
 * 앵커가 **무엇인가.**
 *
 * - `product-photo` — 사용자가 올린 실물 사진. 지켜야 할 물건이 있다
 * - `key-visual` — 글 경로에서 **우리가 만든** 대표 이미지. 지켜야 할 물건이
 *   없고, 그 안의 글자·소품은 페이지가 물려받으면 안 된다
 */
export type AnchorKind = "product-photo" | "key-visual";

export function anchorRoleFor(input: {
  anchorKind?: AnchorKind;
  hasStyleReference: boolean;
  preserveProduct: boolean;
}): AnchorRole {
  /*
    **만들어 낸 대표 이미지를 「판매 중인 제품」이라 선언하지 않는다.**

    거기엔 헤드라인 글자와 임의의 소품이 박혀 있다. 라벨 글자까지 지키라고
    하면 그 글자가 페이지 전체에 되풀이된다.
  */
  if (input.anchorKind === "key-visual") return "mood-only";

  // 따를 디자인이 없는데 색을 풀면 제품이 아무 색이나 된다.
  if (!input.hasStyleReference) return "identity";
  return input.preserveProduct ? "identity" : "shape-only";
}

/**
 * 토글의 처음 위치.
 *
 * 대부분 안 건드려도 되게 잡는다. 판단이 안 서면 켜 둔다 — 껐다가 상품이
 * 매번 달라지면 사용자는 원인을 짐작할 수 없다.
 */
export function defaultPreserveProduct(input: {
  startedFromImage?: boolean;
  offeringKind?: OfferingKind;
}) {
  /*
    무형 상품에서 이 값이 하던 일(「실물을 안 보낸다」)은 이제
    `shouldSendAnchor` 가 `anchorKind` 로 정한다. 여기 남은 뜻은 **색·마감까지
    지킬 것인가** 하나다 — 그 판단으로도 아래 규칙은 그대로 옳다.
  */
  // 사진으로 시작했으면 실물 상품이 있다. 그 생김새는 지켜야 한다.
  if (input.startedFromImage) return true;
  if (input.offeringKind && INTANGIBLE_KINDS.includes(input.offeringKind)) return false;
  return true;
}
