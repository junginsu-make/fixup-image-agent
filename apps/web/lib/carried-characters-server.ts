import { carriedKindOf, type CarriedCharacter } from "@fixup/shared";
import { applyCarriedCharacters, type WithCarried } from "./carried-characters";
import { listCharacters } from "./characters";
import { teamIdOf } from "./teams/store";

/**
 * 캐릭터 번호들로 **볼 수 있는** 캐릭터를 찾아 종류·그림체·생김새를 돌려준다.
 *
 * 팀 범위는 캐릭터 목록과 같다(`listCharacters`). 남의 캐릭터·지운 캐릭터는 안 나온다.
 */
export async function carriedCharactersById(userId: string, ids: string[]): Promise<Map<string, CarriedCharacter>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const characters = await listCharacters(userId, await teamIdOf(userId), { ids: unique });
  return new Map(characters.map((character) => [character.id, {
    kind: carriedKindOf(character.kind),
    look: character.look,
    identity: character.identityPrompt,
  }]));
}

/**
 * 첨부의 캐릭터 각도를 서버가 찾은 정보로 채운다. **찾다 실패해도 만들기를 막지 않는다** —
 * 그때는 정보 없이(지금처럼 사람으로) 간다. 화면이 보낸 정보는 어느 경우든 버린다.
 */
export async function withCarriedCharacters<T extends { kind: string; subject?: string; characterId?: string; character?: unknown }>(
  userId: string,
  attachments: T[],
): Promise<WithCarried<T>[]> {
  try {
    const found = await carriedCharactersById(userId, attachments.map((attachment) => attachment.characterId ?? ""));
    return applyCarriedCharacters(attachments, found);
  } catch (error) {
    console.error("[carried-characters] 캐릭터 정보를 찾지 못해 정보 없이 만듭니다", error instanceof Error ? error.message : String(error));
    return applyCarriedCharacters(attachments, new Map());
  }
}
