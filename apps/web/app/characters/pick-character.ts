/**
 * 목록에서 캐릭터 하나를 고른다.
 *
 * **새 질의를 쓰지 않는다.** `listCharacters` 가 이미 팀 범위·각도 짝짓기·
 * 서명 주소까지 다 해 준다. 단건용 질의를 따로 만들면 그 규칙이 두 군데로
 * 갈리고, 언젠가 한쪽만 고쳐진다 — 이 저장소가 반복해서 당한 방식이다.
 *
 * 캐릭터는 한 사람당 많아야 수십 개라(설계 주석) 목록을 받아 거르는 값이
 * 싸다. 수백 개가 되면 그때 단건 질의를 만든다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 값으로 잰다.
 */
export function pickCharacter<T extends { id: string }>(
  characters: readonly T[] | null | undefined,
  id: string,
): T | null {
  if (!id) return null;
  return (characters ?? []).find((character) => character.id === id) ?? null;
}
