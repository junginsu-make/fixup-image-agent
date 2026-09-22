/**
 * **이 페이지에 누가 나오는가.**
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 인물 사진을 올리고 저장 캐릭터도 고르면, 서버가 **말없이 업로드 쪽을 쓰고
 * 캐릭터를 버렸다.** 「사용자가 방금 고른 쪽」이라는 주석이 붙어 있었는데,
 * 구성안 화면에서는 **캐릭터가 더 나중에 고른 것**일 수도 있다.
 *
 * 어느 쪽이든 문제는 같다 — 사용자는 자기 선택이 무시된 것을 **이미지가 나온
 * 뒤에야** 안다. 그리고 한 장에 값이 든다.
 *
 * 설계 §6: 「인물 업로드와 저장 캐릭터가 동시에 지정되면 **명시적으로 적용
 * 대상을 선택하게 한다. 우선순위로 하나를 조용히 버리지 않는다.**」
 *
 * ── 얼굴은 여전히 하나만 보낸다 ──────────────────────────────
 *
 * 2026-07-30 실측에서 얼굴 참조가 둘이면 모델이 절충해 **제3의 인물**을
 * 만들었다. 그래서 「둘 다 쓰기」는 없다. 고르게 하는 것이 답이다.
 */

export type PersonSource = "uploaded" | "character";

/** 물어봐야 하는 상황인가. */
export function personSourceConflict(input: {
  hasUploadedPerson: boolean;
  hasCharacter: boolean;
}): boolean {
  return input.hasUploadedPerson && input.hasCharacter;
}

/**
 * 실제로 누구를 쓸 것인가.
 *
 * **고른 것이 없는 쪽을 가리키면 있는 쪽을 쓴다.** 사용자가 캐릭터를 고른 뒤
 * 그 캐릭터를 빼도 옛 선택이 남아 있을 수 있는데, 그때 아무도 안 나오면
 * 「사람이 나오는 섹션」이 통째로 빈다.
 *
 * **안 골랐으면 업로드가 이긴다.** 지금까지의 동작이다 — 이미 저장된 초안이
 * 조용히 달라지면 안 된다.
 */
export function resolvePersonSource(input: {
  hasUploadedPerson: boolean;
  hasCharacter: boolean;
  choice?: PersonSource;
}): PersonSource | "none" {
  if (!input.hasUploadedPerson && !input.hasCharacter) return "none";
  if (!input.hasUploadedPerson) return "character";
  if (!input.hasCharacter) return "uploaded";
  return input.choice ?? "uploaded";
}
