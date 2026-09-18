import type { SellerBrief } from "./pdp.seller-brief";

/**
 * 사진 경로에서 **무엇을 원문으로 볼 것인가.**
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * `verifyEvidenceStructure` 는 글 경로에서만 돌았다. 사진 경로는 같은 스키마로
 * `evidence` 를 받으면서 **아무도 검사하지 않았다** — 지어낸 인용, 금지된 주장,
 * 안 채운 질문이 그대로 통과했다(K-09 「사진 근거 게이트 비대칭」).
 *
 * ── 사진 경로의 원문 ─────────────────────────────────────────
 *
 * 글 경로는 사용자가 친 글이 원문이다. 사진에는 그런 것이 없다. 대신
 * **사용자가 직접 적은 것**이 있다 — 판매자 브리프와 추가 정보.
 *
 * **사진에서 읽은 것은 원문이 아니다.** 「가죽으로 보인다」는 추정이고, 그것을
 * 인용의 근거로 삼으면 모델이 본 것을 사용자가 말한 것처럼 둔갑시킨다
 * (설계 §9.2: 「시각 추정 재질/효능을 확인 사실로 자동 승격하지 않는다」).
 */

export interface PhotoSourceInput {
  sellerBrief?: SellerBrief;
  additionalInfo?: string;
}

export function photoSourceText(input: PhotoSourceInput): string {
  const brief = input.sellerBrief ?? {};

  return [
    brief.audience,
    brief.problem,
    brief.features,
    brief.differentiator,
    brief.emphasis,
    input.additionalInfo,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

/**
 * 판매자가 적은 것 중 **제품에 관한 것만.**
 *
 * ── 왜 따로 세나 ─────────────────────────────────────────────
 *
 * `photoSourceText` 는 인용을 대조할 원문이라 판매자가 적은 칸을 모두 잇는다 —
 * 「대상: 30대 여성」도 사용자가 한 말이니 인용의 근거가 된다.
 *
 * 그런데 **「제품에 대해 아는 것이 있는가」를 재는 데는 못 쓴다.** 대상 칸 한 줄만
 * 채워도 「근거가 있다」가 되어 버리는데, 제품에 대한 근거는 여전히 0이다.
 * 화면 흐름상 대상 칸은 가장 채우기 쉬운 자리라 이 구멍이 늘 열린다.
 *
 * 그래서 **제품을 말하는 칸만** 센다. 문제·대상·강조점은 제품 사실이 아니다.
 */
export function productFactText(input: PhotoSourceInput): string {
  const brief = input.sellerBrief ?? {};

  return [brief.features, brief.differentiator, input.additionalInfo]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}
