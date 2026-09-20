import { MAX_STRATEGY_LENGTH } from "./pdp.replan";
import { SELLER_BRIEF_FIELDS } from "./pdp.seller-brief";
import type { SellerBrief } from "./pdp.seller-brief";

/**
 * **입력 칸의 최대 길이.** 화면과 서버가 같은 값을 쓴다.
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 화면 칸에는 제한이 없었다. 사용자는 얼마든지 적고, 그 뒤에 둘 중 하나가
 * 일어났다.
 *
 * - `normalizeSellerBrief` 가 **말없이 500자에서 잘랐다.** 무엇을 잃었는지
 *   사용자는 모른다
 * - 서버 검증에 걸리면 「요청이 올바르지 않습니다」 한 줄이 떴다 — **어느 칸이
 *   왜 걸렸는지 아무 말도 없이**
 *
 * 「그 밖에」 칸은 더 이상했다. **기획은 길이 제한이 없고 이미지 생성만
 * 500자**라, 501자를 적으면 구성안은 나오고 **이미지를 만들 때** 400 이 난다 —
 * 그때는 이미 구성안을 손봐 둔 뒤다.
 *
 * 설계 §6: 「입력 칸의 최대 길이는 서버와 UI가 공유한다. … **입력을 몰래 자르지
 * 않는다.**」
 */

/** 판매자 브리프 한 칸. */
export const SELLER_BRIEF_MAX_LENGTH = 500;

/** 「그 밖에 · 채널과 시즌」. 이미지 생성이 이 값으로 막는다. */
export const PAGE_CONTEXT_MAX_LENGTH = 500;

/**
 * 「이 그림을 어떻게 쓸까요」 한 칸.
 *
 * **짧게 잡는다.** 이 말은 `pdp.reference-policy` 에서 **그 자리의 고정 규칙
 * 문구를 통째로 밀어내고** 대신 앉는다 — 「우선순위 한 줄로는 못 이긴다」는
 * 판단 때문이다. 즉 여기 적힌 만큼 역할 규칙이 사라진다.
 *
 * 칸의 예시가 「뚜껑 색은 그대로 두고 각도만 바꿔 주세요」 한 줄이라, 배경 한
 * 칸과 같은 500자면 넉넉하다.
 */
export const ATTACHMENT_INTENT_MAX_LENGTH = 500;

/**
 * 길이를 재는 칸의 열쇠.
 *
 * 판매자 브리프 다섯 칸, 배경 한 칸, 그리고 **긴 지시 두 칸**(D-8)이다.
 * 뒤의 둘은 상한이 늦게 붙어서, 그 전에 저장된 초안이 넘친 값을 담고 있을 수
 * 있다.
 */
export type InputLimitKey = keyof SellerBrief | "pageContext" | LongInstructionKey;

/**
 * 프롬프트로 가는 지시 칸.
 *
 * **상한이 칸마다 다르다.** 첨부 지시는 그 자리의 역할 규칙을 통째로 밀어내므로
 * 짧게 잡는다(`ATTACHMENT_INTENT_MAX_LENGTH`).
 */
export type LongInstructionKey =
  | "userInstruction"
  | "planInstruction"
  | "anchorIntent"
  | "personIntent"
  | "styleIntent";

const LONG_INSTRUCTIONS: Array<{ key: LongInstructionKey; label: string; limit: number }> = [
  { key: "userInstruction", label: "이미지 연출 요청", limit: MAX_STRATEGY_LENGTH },
  { key: "planInstruction", label: "구성·문구 요청", limit: MAX_STRATEGY_LENGTH },
  { key: "anchorIntent", label: "제품 사진에 적은 말", limit: ATTACHMENT_INTENT_MAX_LENGTH },
  { key: "personIntent", label: "인물 사진에 적은 말", limit: ATTACHMENT_INTENT_MAX_LENGTH },
  { key: "styleIntent", label: "디자인 레퍼런스에 적은 말", limit: ATTACHMENT_INTENT_MAX_LENGTH },
];

export interface OverLimitField {
  key: InputLimitKey;
  /** 사용자가 읽을 칸 이름. 「audience」로는 어느 칸인지 모른다. */
  label: string;
  length: number;
  limit: number;
}

/**
 * 넘친 칸을 짚는다.
 *
 * **자르지 않는다.** 무엇이 얼마나 넘쳤는지 돌려줄 뿐이고, 고치는 것은
 * 사용자의 몫이다 — 몰래 자르면 어떤 말을 잃었는지 알 길이 없다.
 */
export function overLimitFields(
  brief: SellerBrief,
  pageContext?: string,
  /**
   * 화면이 쓰는 질문형 이름. 안 주면 코어의 짧은 이름을 쓴다.
   *
   * **열쇠를 좁힌다.** `Record<string, string>` 이면 오타가 조용히 기본 이름으로
   * 떨어져 화면이 엉뚱한 이름을 보여 준다.
   */
  labels?: Partial<Record<InputLimitKey, string>>,
  /**
   * 프롬프트로 가는 긴 지시 칸.
   *
   * **상한이 늦게 붙은 칸이다**(D-8). 그 전에 저장된 초안이 넘친 값을 담은 채
   * 복원되면 화면은 멀쩡해 보이고 만들기를 누를 때 설명 없는 400 이 난다.
   * U-08 에서 똑같이 당했다.
   */
  instructions?: Partial<Record<LongInstructionKey, string>>,
): OverLimitField[] {
  const over: OverLimitField[] = [];

  for (const field of SELLER_BRIEF_FIELDS) {
    const value = brief[field.key];
    if (value && value.length > SELLER_BRIEF_MAX_LENGTH) {
      over.push({
        key: field.key,
        label: labels?.[field.key] ?? field.label,
        length: value.length,
        limit: SELLER_BRIEF_MAX_LENGTH,
      });
    }
  }

  if (pageContext && pageContext.length > PAGE_CONTEXT_MAX_LENGTH) {
    over.push({
      key: "pageContext",
      label: labels?.pageContext ?? "그 밖에 · 채널과 시즌",
      length: pageContext.length,
      limit: PAGE_CONTEXT_MAX_LENGTH,
    });
  }

  for (const field of LONG_INSTRUCTIONS) {
    const value = instructions?.[field.key];
    if (value && value.length > field.limit) {
      over.push({
        key: field.key,
        label: labels?.[field.key] ?? field.label,
        length: value.length,
        limit: field.limit,
      });
    }
  }

  return over;
}
