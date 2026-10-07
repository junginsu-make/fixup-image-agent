import { carriedKindOf, type CarriedCharacter } from "@fixup/shared";
import { applyCarriedCharacters, type WithCarried } from "./carried-characters";
import { characterReferenceTitle } from "./character-library";
import { posterReferencesByIds } from "./poster/references";
import type { ReferenceViewer } from "./reference-images";
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
 * 첨부의 캐릭터 각도를 서버가 찾은 정보로 채운다(카드뉴스). **찾다 실패해도 만들기를 막지
 * 않는다** — 그때는 정보 없이(지금처럼 사람으로) 간다. 화면이 보낸 정보는 어느 경우든 버린다.
 *
 * 일반 카드뉴스는 캐릭터 번호를 보낸다. **쉽게 카드뉴스는 안 보낸다** — 그때는 사람으로
 * 지킬 그림의 제목으로 찾는다(이미지 만들기와 같은 방법, 사용자 결정 2026-10-07).
 */
export async function withCarriedCharacters<T extends { id: string; kind: string; subject?: string; characterId?: string; character?: unknown }>(
  member: { userId: string; profile: { role: ReferenceViewer["role"] } },
  attachments: T[],
): Promise<WithCarried<T>[]> {
  try {
    const found = await carriedCharactersById(member.userId, attachments.map((attachment) => attachment.characterId ?? ""));
    const untitled = attachments
      .filter((attachment) => attachment.kind === "keep_identity" && attachment.subject === "person" && !attachment.characterId)
      .map((attachment) => attachment.id);
    const byAttachment = new Map(Object.entries(await carriedCharactersForPosterPeople(member, untitled)));
    return applyCarriedCharacters(attachments, found, byAttachment);
  } catch (error) {
    console.error("[carried-characters] 캐릭터 정보를 찾지 못해 정보 없이 만듭니다", error instanceof Error ? error.message : String(error));
    return applyCarriedCharacters(attachments, new Map());
  }
}

/**
 * 라이브러리 그림 → **그것이 어느 캐릭터의 각도인가**를 제목으로 찾는다(이미지 만들기).
 *
 * 이미지 만들기 화면은 캐릭터 번호를 안 들고 다니고 제목으로 알아본다(`characterIdByTitle`).
 * 서버도 같은 방법이다. 캐릭터 이름은 겹치지 않게 저장되므로(2026-10-07 #274) 제목이 곧
 * 그 캐릭터다. 볼 수 있는 캐릭터(최근 100개)만 본다. **찾다 실패해도 만들기를 막지 않는다.**
 *
 * @returns 그림 번호 → 캐릭터 번호와 종류·그림체·생김새. 캐릭터가 아닌 그림은 없다.
 */
export async function carriedCharactersForReferences(
  userId: string,
  references: Array<{ id: string; title?: string | null }>,
): Promise<Record<string, CarriedCharacter & { characterId: string }>> {
  if (!references.length) return {};
  try {
    const characters = await listCharacters(userId, await teamIdOf(userId));
    const byTitle = new Map<string, CarriedCharacter & { characterId: string }>();
    for (const character of characters) {
      const carried = {
        characterId: character.id,
        kind: carriedKindOf(character.kind),
        look: character.look,
        identity: character.identityPrompt,
      };
      for (const view of character.views) {
        const title = characterReferenceTitle(character.name, view.angle);
        if (!byTitle.has(title)) byTitle.set(title, carried);
      }
    }
    return Object.fromEntries(references.flatMap((reference) => {
      const found = reference.title ? byTitle.get(reference.title) : undefined;
      return found ? [[reference.id, found]] : [];
    }));
  } catch (error) {
    console.error("[carried-characters] 그림 제목으로 캐릭터를 찾지 못해 정보 없이 만듭니다", error instanceof Error ? error.message : String(error));
    return {};
  }
}

/**
 * 이미지 만들기 작업을 만들 때 — **사람으로 지킬 그림**이 캐릭터의 각도인지 찾는다.
 *
 * 거드는 일이라 **어떤 실패도 만들기를 막지 않는다**(2026-10-07): 조회가 먼저 터지면
 * 원래 400 이어야 할 입력 거절이 500 이 됐다. 사람 그림이 없으면 아예 묻지 않는다.
 */
export async function carriedCharactersForPosterPeople(
  member: { userId: string; profile: { role: ReferenceViewer["role"] } },
  personIds: string[],
): Promise<Record<string, CarriedCharacter & { characterId: string }>> {
  if (!personIds.length) return {};
  try {
    const viewer = { userId: member.userId, role: member.profile.role, teamId: await teamIdOf(member.userId) };
    return await carriedCharactersForReferences(member.userId, await posterReferencesByIds(viewer, personIds));
  } catch (error) {
    console.error("[carried-characters] 사람 그림을 읽지 못해 캐릭터 정보 없이 만듭니다", error instanceof Error ? error.message : String(error));
    return {};
  }
}
