import { characterReferenceTitle } from "../../lib/character-library";

/**
 * 고른 각도를 **라이브러리의 실제 그림으로** 바꾼다.
 *
 * 참고 이미지 쪽에는 캐릭터를 가리키는 칸이 없다. 제목(`이름 (캐릭터) · 정면`)이
 * 유일한 손잡이다 — `character-library.ts` 머리말에 적힌 그대로다. 그래서 이름을
 * 손으로 짜 맞추지 않고 그 함수를 그대로 쓴다. 한쪽만 고쳐지는 날을 막는다.
 *
 * **화면 밖에서 한다.** 못 찾은 각도가 조용히 빠지면 세 장을 골랐는데 두 장만
 * 붙고 아무도 모른다.
 */

export interface LibraryLike {
  id: string;
  title: string | null;
}

export interface AngleMatch<T extends LibraryLike> {
  angle: string;
  image: T;
}

export interface AngleMatchResult<T extends LibraryLike> {
  matched: AngleMatch<T>[];
  /** 라이브러리에서 못 찾은 각도. 화면이 그대로 알린다. */
  missing: string[];
}

/**
 * 고른 차례대로 짝을 짓는다.
 *
 * 차례를 지키는 이유는 하나다 — 모델이 받는 장 차례가 사람마다 달라지면 같은
 * 선택에 다른 그림이 나온다. 정면이 맨 앞이어야 정체성 기준이 먼저 읽힌다.
 */
export function matchAngles<T extends LibraryLike>(
  images: T[],
  characterName: string,
  angles: string[],
): AngleMatchResult<T> {
  const matched: AngleMatch<T>[] = [];
  const missing: string[] = [];

  for (const angle of angles) {
    const title = characterReferenceTitle(characterName, angle);
    const image = images.find((entry) => entry.title === title);
    if (image) matched.push({ angle, image });
    else missing.push(angle);
  }

  return { matched, missing };
}

/**
 * 붙인 뒤에 할 말.
 *
 * 다 붙었으면 몇 장인지만, 못 찾은 것이 있으면 **그것부터** 말한다. 조용히
 * 빠지면 세 장을 골랐는데 두 장만 붙은 것을 아무도 모른다.
 */
export function attachMessage(
  characterName: string,
  addedCount: number,
  missing: string[],
  angleLabel: (angle: string) => string = (angle) => angle,
): string {
  if (!addedCount && missing.length) {
    return `'${characterName}' 의 장면을 라이브러리에서 찾지 못했습니다.`;
  }
  if (missing.length) {
    const names = missing.map(angleLabel).join(" · ");
    return `'${characterName}' 에서 ${addedCount}장을 넣었습니다. ${names} 은(는) 라이브러리에서 찾지 못했습니다.`;
  }
  if (!addedCount) return `'${characterName}' 의 고른 장면이 이미 다 들어 있습니다.`;
  return `'${characterName}' 에서 ${addedCount}장을 넣었습니다.`;
}

/** 캐릭터 한 명이 라이브러리에 남긴 각도들. */
export interface CharacterLike {
  id: string;
  name: string;
  views: Array<{ angle: string }>;
}

/**
 * 라이브러리 그림 → **어느 캐릭터의 각도인가.**
 *
 * 첨부를 객체로 안 들고 역할만 id 로 들고 다니는 화면(포스터)이 있다. 거기서도
 * 「이 넷은 한 사람」을 알아야 「인물은 한 명만」에 안 걸린다.
 *
 * 되짚는 손잡이는 제목뿐이다. 이름이 같은 캐릭터가 둘이면 먼저 만든 쪽으로
 * 붙는다 — 제목이 유일한 손잡이인 한 그 모호함은 여기서 못 푼다.
 */
export function characterIdByTitle(characters: CharacterLike[]): Map<string, string> {
  const byTitle = new Map<string, string>();

  for (const character of characters) {
    for (const view of character.views) {
      const title = characterReferenceTitle(character.name, view.angle);
      if (!byTitle.has(title)) byTitle.set(title, character.id);
    }
  }

  return byTitle;
}

/**
 * 라이브러리에 없는 각도를 **캐릭터 원본에서 다시 채워 달라고** 한다(2026-10-07).
 *
 * 라이브러리에서 그 그림을 지웠어도 캐릭터 원본은 남아 있다. 채웠으면 참이다 —
 * 부르는 쪽이 목록을 다시 읽고 다시 찾는다. 못 채워도 던지지 않는다. 그때는
 * 지금처럼 「찾지 못했습니다」를 말하면 된다.
 */
export async function restoreMissingAngles(characterId: string, missing: string[]): Promise<boolean> {
  try {
    const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}/library`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ angles: missing }),
    });
    const body = await response.json() as { ok?: boolean; restored?: string[] };
    return Boolean(body.ok && body.restored?.length);
  } catch {
    return false;
  }
}

/**
 * 고른 각도를 찾고, **없는 것만** 원본에서 다시 채운 뒤 다시 찾는다(2026-10-07).
 *
 * 카드뉴스·이미지 만들기가 같이 쓴다 — 두 곳에 따로 적으면 한쪽만 고쳐진다.
 *
 * **처음 찾은 것은 잃지 않는다.** 다시 읽기가 실패하면 빈 목록이 오는데, 그
 * 목록으로 전부 다시 찾으면 원래 붙던 정면까지 사라진다(2026-10-07 리뷰).
 * 못 찾았던 각도만 다시 읽은 목록에서 찾아 **고른 차례대로** 합친다.
 */
export async function matchWithRestore<T extends LibraryLike>(input: {
  images: T[];
  name: string;
  characterId: string;
  angles: string[];
  restore: (characterId: string, missing: string[]) => Promise<boolean>;
  reload: () => Promise<T[]>;
}): Promise<AngleMatchResult<T>> {
  const first = matchAngles(input.images, input.name, input.angles);
  if (!first.missing.length || !(await input.restore(input.characterId, first.missing))) return first;

  const second = matchAngles(await input.reload(), input.name, first.missing);
  const found = new Map([...first.matched, ...second.matched].map((entry) => [entry.angle, entry]));
  return {
    matched: input.angles.map((angle) => found.get(angle)).filter((entry): entry is AngleMatch<T> => Boolean(entry)),
    missing: input.angles.filter((angle) => !found.has(angle)),
  };
}
