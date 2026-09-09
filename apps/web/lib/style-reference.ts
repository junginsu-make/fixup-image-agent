import { pickStyleWithLlm, type StyleReferenceMatch } from "@fixup/pdp-core";
import type { ProductBrief } from "@fixup/pdp-core";
import { loadUserReferenceCandidates } from "./user-style-references";
import { createPdpLlmOrNull } from "./pdp/providers";

/**
 * 브리프에 어울리는 레퍼런스 한 장을 고른다.
 *
 * **이 사용자가 올린 것 중에서만** 고른다. 공용 레퍼런스는 없다 — 전역이면
 * A 셀러의 디자인이 B 셀러 결과에 씌워진다.
 *
 * 유사도 검색을 쓰지 않는다. 실제로 재보니 위스키를 포함해 모든 질의에서
 * "산뜻한 파스텔"이 1위였다. 질의는 상품 얘기인데 레퍼런스 서술은 디자인
 * 얘기라 서로 다른 의미 공간에 있다. LLM 이 훨씬 잘 고른다.
 *
 * 실패해도 던지지 않는다. 레퍼런스는 있으면 좋은 것이지, 없다고 상세페이지
 * 생성을 막을 이유가 없다.
 */
export async function suggestStyleReference(
  userId: string,
  brief: ProductBrief,
): Promise<{ reference: StyleReferenceMatch | null; reason: string; total: number }> {
  try {
    const candidates = await loadUserReferenceCandidates(userId);
    if (candidates.length === 0) return { reference: null, reason: "", total: 0 };

    const { reference, pick } = await pickStyleWithLlm(brief, candidates, createPdpLlmOrNull() ?? undefined);
    return { reference, reason: pick.reason, total: candidates.length };
  } catch (error) {
    console.warn("[style] 레퍼런스 선택 실패, 없이 진행합니다", error);
    return { reference: null, reason: "", total: 0 };
  }
}
