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
 */

/** 지킬 실물이 없는 유형들. 이 경우 디자인을 온전히 받는 편이 낫다. */
const INTANGIBLE_KINDS: OfferingKind[] = [
  "course",
  "coaching",
  "subscription",
  "software",
  "community",
];

export function shouldSendAnchor(input: {
  hasStyleReference: boolean;
  preserveProduct: boolean;
}) {
  // 레퍼런스가 없으면 앵커가 유일한 시각 기준이다. 빼면 섹션마다 상품이 달라진다.
  if (!input.hasStyleReference) return true;
  return input.preserveProduct;
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
  // 사진으로 시작했으면 실물 상품이 있다. 그 생김새는 지켜야 한다.
  if (input.startedFromImage) return true;
  if (input.offeringKind && INTANGIBLE_KINDS.includes(input.offeringKind)) return false;
  return true;
}
