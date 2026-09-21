/**
 * **안 쓰인 참조를 말한다**(N-9, 설계 §6.2·§1 불변조건 7).
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * 리디자인은 참조를 `MAX_REFERENCE_IMAGES` 장에서 자른다. 그 자체는 맞다 —
 * 모델이 받을 수 있는 장수가 정해져 있고, 자르는 차례에도 까닭이 있다
 * (`referencesWithCharacter`: 인물이 먼저, 원본 자리는 최소 한 장 남긴다).
 *
 * **문제는 안 알리는 것이다.** 사용자가 각도를 넷 고르고 원본이 세 장이면
 * 각도 하나가 말없이 빠진다. 결과가 왜 다른지 알 길이 없다.
 *
 * 설계 §1 불변 조건 7: 「**참조를 조용히 버리거나**, 검사하지 못한 결과를
 * 통과로 표시하지 않는다」.
 * 설계 §6.2: 「단건·배치·대표 이미지·**리디자인** 생성/수정은 같은 검증
 * 계약을 사용한다」.
 *
 * ── 상세페이지와 왜 다르게 다루나 ──────────────────────────
 *
 * 상세페이지는 한도를 넘으면 **거절한다**(`assertReferenceBudget`). 거기서는
 * 사용자가 각도와 참조를 하나씩 고르므로, 줄이라고 말하면 줄일 수 있다.
 *
 * 리디자인은 **원본 상세페이지가 조각으로 여러 장 나온다.** 그것을 줄이라고
 * 하면 리디자인 자체를 못 한다. 그래서 자르되 **무엇이 빠졌는지 말한다** —
 * 계약의 본뜻(조용히 버리지 않는다)은 같고 다루는 방식만 도메인에 맞춘다.
 */

export interface ReferenceBudgetInput {
  /** 사용자가 고른 인물 각도 장수. */
  characterCount: number;
  /** 실제로 붙은 인물 각도 장수. */
  attachedCharacterCount: number;
  /** 원본 상세페이지 조각 장수. */
  originalCount: number;
  /** 실제로 붙은 전체 장수. */
  attachedCount: number;
}

/**
 * 안 쓰인 참조가 있으면 그 사실을 말한다. 없으면 빈 문자열.
 *
 * **셈이 아니라 말을 준다.** 숫자만 주면 부르는 쪽마다 다른 문장을 짓고,
 * 그러다 한 곳이 「3장 중 1장」을 「1장 중 3장」으로 적는다.
 */
export function referenceBudgetNotice(input: ReferenceBudgetInput): string {
  const 빠진인물 = Math.max(0, input.characterCount - input.attachedCharacterCount);
  const 붙은원본 = Math.max(0, input.attachedCount - input.attachedCharacterCount);
  const 빠진원본 = Math.max(0, input.originalCount - 붙은원본);

  if (빠진인물 === 0 && 빠진원본 === 0) return "";

  const 조각: string[] = [];
  if (빠진인물 > 0) 조각.push(`고른 인물 각도 ${input.characterCount}장 가운데 ${input.attachedCharacterCount}장만 썼습니다`);
  if (빠진원본 > 0) 조각.push(`원본 ${input.originalCount}장 가운데 ${붙은원본}장만 썼습니다`);

  return `${조각.join(". ")}. 한 번에 붙일 수 있는 참고 이미지 수가 정해져 있어 나머지는 이번 생성에 쓰이지 않았습니다.`;
}
