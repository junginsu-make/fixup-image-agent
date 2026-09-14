/**
 * 라이브러리 낱장에서 **캐릭터의 각도를 찾아낸다.**
 *
 * 캐릭터를 만들면 각도마다 참고 이미지가 한 줄씩 쌓인다. 제목이 그 줄을
 * 캐릭터로 알아보는 **유일한 손잡이**다(`lib/character-library.ts` 머리말).
 *
 *     「예천 들기름 모델 (캐릭터) · 정면」
 *      └ 이름 ────────┘            └ 각도 ┘
 *
 * 전에는 이 규약이 화면 두 곳에 따로 적혀 있었고(카드뉴스·이미지 만들기),
 * 둘 다 **정면만** 집어 갔다. 각도를 만들어 둬도 고를 수가 없었다
 * (2026-09-11 사용자 지적). 한 자리로 모으고, 각도를 낱낱이 돌려준다.
 *
 * **서버 것(`lib/character-library.ts`)을 가져다 쓰지 않는다.** 그쪽은
 * `@fixup/pdp-core` 를 지나는데, 그러면 상세페이지 엔진이 통째로 화면
 * 꾸러미에 실린다. 제목에서 이름과 각도를 **글자로 갈라** 읽는다.
 */

/** 제목에서 이름과 각도를 가르는 자리. 양쪽에 공백이 있는 가운뎃점이다. */
const MARK = " (캐릭터) · ";

export interface CharacterRowImage {
  id: string;
  title: string | null;
  url: string | null;
}

export interface CharacterAngleRow<T extends CharacterRowImage> {
  /** 「정면」처럼 사람이 읽는 각도 이름. 제목에 적힌 그대로다. */
  angle: string;
  image: T;
}

export interface CharacterRowGroup<T extends CharacterRowImage> {
  name: string;
  angles: Array<CharacterAngleRow<T>>;
}

/** 이 줄이 캐릭터의 한 각도인가. */
export function isCharacterRow(title: string | null | undefined): boolean {
  return typeof title === "string" && title.includes(MARK);
}

/**
 * 각도를 늘어놓는 차례.
 *
 * 목록이 들어오는 차례는 만든 시각이라, 그대로 두면 뒷모습이 맨 앞에 온다.
 * **정면이 먼저여야** 무엇을 고르는지 한눈에 안다. 모르는 이름은 뒤로 민다 —
 * 조용히 감추면 그 장을 잃는다.
 */
const ORDER = ["정면", "왼쪽 45°", "오른쪽 45°", "왼쪽", "오른쪽", "뒷면", "다각도 한 장"];

function rank(angle: string): number {
  const at = ORDER.indexOf(angle);
  return at < 0 ? ORDER.length : at;
}

/**
 * 라이브러리 낱장을 캐릭터별로 묶는다. 캐릭터가 아닌 줄은 버린다.
 *
 * 이름 차례는 **처음 나온 차례**를 지킨다. 목록이 최근 것부터 오므로 최근에
 * 만든 캐릭터가 앞에 온다.
 */
export function groupCharacterRows<T extends CharacterRowImage>(images: T[]): Array<CharacterRowGroup<T>> {
  const byName = new Map<string, Array<CharacterAngleRow<T>>>();

  for (const image of images) {
    const title = image.title ?? "";
    const at = title.indexOf(MARK);
    if (at < 0) continue;

    const name = title.slice(0, at).trim();
    const angle = title.slice(at + MARK.length).trim();
    if (!name || !angle) continue;

    const rows = byName.get(name) ?? [];
    rows.push({ angle, image });
    byName.set(name, rows);
  }

  return [...byName.entries()].map(([name, angles]) => ({
    name,
    angles: [...angles].sort((left, right) => rank(left.angle) - rank(right.angle)),
  }));
}

/** 캐릭터 줄을 뺀 나머지. 캐릭터 칸이 따로 있을 때 낱장에서 겹쳐 보이지 않게 한다. */
export function withoutCharacterRows<T extends CharacterRowImage>(images: T[]): T[] {
  return images.filter((image) => !isCharacterRow(image.title));
}
