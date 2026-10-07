import type { CarriedCharacter } from "@fixup/shared";

/**
 * **붙은 캐릭터 각도에 그 캐릭터의 종류·그림체·생김새를 채운다**(2026-10-07 사용자 승인, ③).
 *
 * 화면은 캐릭터 번호만 믿고 보낸다. 종류·그림체·생김새는 **서버가 찾은 것**만 쓴다 —
 * 생김새는 그림 모델 프롬프트에 그대로 들어가는 글이라, 화면이 보낸 것을 믿으면 누구나
 * 아무 글이나 실을 수 있다. 다시 만들기가 저장된 값을 되보내도 여기서 새로 바뀐다.
 *
 * 순수 함수다. 서버 조회는 `carried-characters-server.ts` 가 한다.
 */

interface CarriableAttachment {
  kind: string;
  subject?: string;
  characterId?: string;
  /** 화면·저장본이 실어 온 값. 무엇이든 버린다. */
  character?: unknown;
}

export type WithCarried<T> = Omit<T, "character"> & { character?: CarriedCharacter };

/**
 * @param found 서버가 찾은 캐릭터 — 번호 → 정보. 못 찾은 번호(지웠거나 남의 것)는 없다.
 * @returns 새 목록. 받은 것은 바꾸지 않는다.
 */
export function applyCarriedCharacters<T extends CarriableAttachment>(
  attachments: readonly T[],
  found: ReadonlyMap<string, CarriedCharacter>,
): WithCarried<T>[] {
  return attachments.map((attachment): WithCarried<T> => {
    const { character: _fromClient, ...rest } = attachment;
    const isCharacterAngle = attachment.kind === "keep_identity" && attachment.subject === "person";
    const character = isCharacterAngle && attachment.characterId ? found.get(attachment.characterId) : undefined;
    return character ? { ...rest, character } : rest;
  });
}
