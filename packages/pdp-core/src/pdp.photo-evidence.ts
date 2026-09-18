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
