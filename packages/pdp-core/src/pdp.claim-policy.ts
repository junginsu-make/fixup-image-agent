export type BannedClaimCategory = "guarantee" | "medical" | "credential";

export interface BannedClaimHit {
  category: BannedClaimCategory;
  matched: string;
}

const CLAIM_PATTERNS: ReadonlyArray<{
  category: BannedClaimCategory;
  patterns: readonly RegExp[];
}> = [
  {
    category: "guarantee",
    patterns: [
      // '보장' 한 단어만 보면 "30일 환불 보장" 같은 정당한 상거래 문구까지 막는다.
      // 무엇을 보장하는지가 걸린다 — 수익·성과 쪽일 때만 금지 분류다.
      /(?:수익|매출|소득|성과|연봉).{0,15}(?:보장|확정)/giu,
      // 효능을 보장하는 것도 금지 분류다. 다만 '환불 보장'·'품질 보장' 은 아니다.
      /(?:효과|효능|개선|감소|완화|치료).{0,15}(?:보장|확정)/giu,
      /(?:수익|매출|소득|월\s*[\d,]+\s*만?\s*원?).{0,15}(?:보장|확정)/giu,
      /(?:보장|확정).{0,15}(?:수익|매출|소득)/giu,
      /\d+\s*(?:개월|주|일).{0,10}퇴사(?:\s*(?:가능|확정))?/giu,
      /\bguarante(?:e|ed|es|eing)\b/giu,
      /(?:income|revenue|profit|earnings).{0,24}(?:certain|guaranteed)/giu,
    ],
  },
  {
    category: "medical",
    patterns: [
      /(?:아토피|탈모|체지방|질환|통증).{0,12}(?:개선|감소|완화|치료|효과)/giu,
      /(?:개선|감소|완화|치료).{0,12}(?:아토피|탈모|체지방|질환|통증)/giu,
      /(?:eczema|hair\s*loss|body\s*fat|disease|pain).{0,24}(?:improv\w*|reduc\w*|relief|treat\w*|cur\w*|effect)/giu,
      /(?:improv\w*|reduc\w*|relief|treat\w*|cur\w*).{0,24}(?:eczema|hair\s*loss|body\s*fat|disease|pain)/giu,
    ],
  },
  {
    category: "credential",
    patterns: [
      // 접두사를 선택으로 두면 "3등분", "2등급" 까지 순위 주장으로 잡힌다.
      // 접두사가 있거나, 뒤에 다른 한글이 붙지 않은 '숫자+위/등' 만 순위로 본다.
      /(?:국내|업계|세계|전국|국내외)\s*\d*\s*(?:위|등)/giu,
      /\d+\s*(?:위|등)(?![가-힣])/giu,
      /식약처.{0,8}인증|인증.{0,8}식약처/giu,
      /특허\s*(?:출원|등록|기술)/giu,
      /(?:어워드|대회).{0,8}수상|수상.{0,8}(?:어워드|대회)/giu,
      /\b(?:no\.?\s*1|number\s*one|#\s*1)\b/giu,
      /\bpatent(?:ed|\s*pending)?\b/giu,
      /\baward[-\s]?winning\b/giu,
    ],
  },
];

/** 금지 분류에 걸리는 표현을 전부 찾는다. 빈 배열이면 깨끗하다. */
export function scanBannedClaims(text: string): BannedClaimHit[] {
  const hits: BannedClaimHit[] = [];
  for (const group of CLAIM_PATTERNS) {
    for (const pattern of group.patterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const matched = match[0]?.trim();
        if (matched) hits.push({ category: group.category, matched });
      }
    }
  }
  return hits;
}

/**
 * 숫자·기간·비율·가격 같은 검증 가능한 표지가 있는가.
 *
 * 맨숫자를 전부 표지로 보면 "20대 여성", "3인용 매트" 같은 장면 묘사까지
 * 근거를 요구하게 되고, 근거가 없으면 그 문구가 통째로 강등돼 사라진다.
 * 설계 §3-6 이 든 것도 숫자·기간·비율·순위·가격이지 임의의 숫자가 아니다.
 * 그래서 **단위가 붙은 숫자**만 표지로 본다.
 */
const NUMBER_WITH_UNIT =
  /\d[\d,.]*\s*(?:%|퍼센트|명|분|초|시간|일|주|개월|달|년|회|배|건|권|편|점|원|만\s*원|억|천|kg|km|cm|ml|g)/u;

export function containsFactualMarker(text: string): boolean {
  if (NUMBER_WITH_UNIT.test(text)) return true;
  if (/(?:무료|유료|가격|구독료|원\s*(?:대|부터|이하|이상))/u.test(text)) return true;
  return scanBannedClaims(text).length > 0;
}
