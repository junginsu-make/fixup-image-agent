/**
 * 제목에서 강조할 낱말을 다루는 규칙.
 *
 * 화면(`EmphasisWordPicker.tsx`)과 떼어 둔다 — 보내기 직전에 서버로 갈 값을 걸러야
 * 해서 화면 밖에서도 쓴다.
 */

/**
 * 제목을 강조 단위로 쪼갠다.
 *
 * 형태소로 쪼개지 않는다. 조사가 붙은 덩어리가 **화면에 보이는 모양**이고, 모델도
 * 그 모양으로 글자를 그린다. "수분이" 를 "수분"+"이" 로 나누면 모델이 못 찾는다.
 */
export function splitHeadlineWords(headline: string): string[] {
  return headline
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

/**
 * 제목에 실제로 있는 낱말만 남긴다.
 *
 * 없는 낱말을 보내면 모델은 강조할 대상을 못 찾는다 — 조용히 무시되거나 엉뚱한
 * 곳이 강조된다. 제목은 사용자가 언제든 고치므로 예전 낱말이 남는 일이 흔하다.
 *
 * 저장된 값을 지우지는 않는다. 읽는 시점에만 걸러 낸다 — 제목을 되돌리면 강조도
 * 되살아나는 편이 덜 놀랍다.
 */
export function keepWordsPresentIn(headline: string, words: string[]): string[] {
  const available = new Set(splitHeadlineWords(headline));
  return words.filter((word) => available.has(word));
}
