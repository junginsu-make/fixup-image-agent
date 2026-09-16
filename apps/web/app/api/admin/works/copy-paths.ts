/**
 * 복사본의 그림이 놓일 자리.
 *
 * 저장 경로 규약은 `{user_id}/{도구}/{작업}/{남은 이름}` 이다
 * (`docs/DEPLOY.md`). 버킷 정책이 **첫 칸으로 소유자를 판정**하므로 복사할 때
 * 첫 칸을 새 소유자로, 작업 칸을 새 작업 id 로 바꿔야 한다.
 *
 * 원본 경로를 그대로 물려받으면 두 가지가 깨진다.
 *
 *   1. 관리자 작업인데 그림의 첫 칸이 남의 id 라 소유 판정이 어긋난다
 *   2. **원래 회원이 자기 작업을 지우면 복사본의 그림이 같이 사라진다** —
 *      관리자는 자기 작업인데 그림만 빈 것을 보게 된다
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 문자열 규칙이라 시험에서 값으로
 * 잰다 — `grid-thumbnail-path.ts` 가 같은 이유로 갈라져 있다.
 */

/**
 * 규약을 벗어난 경로는 `null` 이다.
 *
 * 조용히 엉뚱한 자리에 쓰는 것보다 **그 한 장을 못 옮겼다고 알리는 편**이
 * 낫다. 부르는 쪽은 그 칸을 비우고 나머지를 옮긴다.
 */
/**
 * 이 칸을 경로에 써도 되나.
 *
 * 빈 칸, **위로 올라가는 칸**(`.`·`..`), 역슬래시를 막는다.
 *
 * 지금은 경로를 서버가 조립하므로 사용자가 `..` 를 넣을 길이 없다. 그래도
 * 거르는 까닭은, 이 함수가 만든 문자열이 그대로 저장소 주소가 되고 업로드가
 * `upsert: true` 이기 때문이다 — 언젠가 경로를 받아 쓰는 자리가 하나 생기면
 * 그날 남의 파일을 조용히 덮어쓴다. 막는 값이 싸서 미리 막는다.
 *
 * **칸 전체가 점일 때만 막는다.** `0.thumb.webp` 는 정상적인 이름이다.
 */
function usablePart(part: string): boolean {
  return Boolean(part) && part !== "." && part !== ".." && !part.includes("\\");
}

export function copiedAssetPath(
  originalPath: string,
  newOwnerId: string,
  newProjectId: string,
): string | null {
  if (!newOwnerId || !newProjectId) return null;
  const parts = originalPath.split("/");
  // `{소유자}/{도구}/{작업}/{남은 이름}` — 적어도 넷이어야 한다.
  if (parts.length < 4) return null;
  const [, tool, , ...rest] = parts;
  if (!usablePart(tool ?? "") || !rest.length || !rest.every(usablePart)) return null;
  return [newOwnerId, tool, newProjectId, ...rest].join("/");
}

/** 파일 한 장을 어디서 어디로 옮기나. */
export interface AssetMove {
  from: string;
  to: string;
}

/** 카드뉴스 카드 한 장이 들고 있는 그림 자리. */
type SnsCard = { assetPath?: string | null; thumbPath?: string | null };

/**
 * 카드뉴스 복사 계획.
 *
 * **원본을 건드리지 않는다.** 복사인데 원본이 바뀌면 그게 사고다.
 *
 * 규약을 벗어난 경로(`copiedAssetPath` 가 `null` 을 주는 것)는 **옮기지 않고
 * 그 칸을 비운다.** 화면은 그림 없는 카드로 그린다 — 조용히 엉뚱한 자리를
 * 가리키게 두는 것보다 낫다.
 */
export function snsCopyPlan(
  data: Record<string, unknown>,
  newOwnerId: string,
  newProjectId: string,
): { data: Record<string, unknown>; moves: AssetMove[] } {
  const flow = data.flow as { cards?: SnsCard[] } | undefined;
  const cards = flow?.cards ?? [];
  const moves: AssetMove[] = [];

  const nextCards = cards.map((card) => {
    const asset = card.assetPath
      ? copiedAssetPath(card.assetPath, newOwnerId, newProjectId) : null;
    const thumb = card.thumbPath
      ? copiedAssetPath(card.thumbPath, newOwnerId, newProjectId) : null;
    if (card.assetPath && asset) moves.push({ from: card.assetPath, to: asset });
    if (card.thumbPath && thumb) moves.push({ from: card.thumbPath, to: thumb });
    return { ...card, assetPath: asset, thumbPath: thumb };
  });

  return {
    data: flow ? { ...data, flow: { ...flow, cards: nextCards } } : { ...data },
    moves,
  };
}

/** 포스터 변형 한 줄이 들고 있는 것 중 복사에 쓰는 칸. */
type PosterImageRow = {
  variant_index: number;
  selected?: boolean;
  width?: number | null;
  height?: number | null;
  review?: unknown;
  asset_path: string;
  thumb_path?: string | null;
};

/**
 * 포스터 복사 계획.
 *
 * **`id`·`created_at` 은 옮겨 적지 않는다.** id 는 새로 받아야 하고 만든 시각은
 * 복사한 때가 맞다.
 *
 * **생성 요청은 새로 만든 것을 가리킨다.** 남의 장부에 달린 줄을 가리키면 안
 * 되는데, 그 칸은 `not null` 이다(`202608310004_poster.sql:47`). 처음엔 통째로
 * 뺐다가 insert 가 23502 로 **무조건** 실패하는 것을 리뷰에서 잡았다 — 그리고
 * 그때는 행과 파일이 이미 올라간 뒤였다. 원칙은 지키고 값은 채운다: 복사한
 * 사람 소유의 **비용 0** 짜리 요청 행을 하나 만들어 그것을 가리킨다.
 *
 * 규약을 벗어난 경로의 행은 **아예 싣지 않는다.** 그림 없는 변형 행을 남기면
 * 목록에 빈 칸이 생긴다.
 */
export function posterCopyPlan(
  rows: PosterImageRow[],
  newOwnerId: string,
  newProjectId: string,
  newRequestId: string,
): { rows: Array<Record<string, unknown>>; moves: AssetMove[] } {
  const moves: AssetMove[] = [];
  const next: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const asset = copiedAssetPath(row.asset_path, newOwnerId, newProjectId);
    if (!asset) continue;
    const thumb = row.thumb_path
      ? copiedAssetPath(row.thumb_path, newOwnerId, newProjectId) : null;

    moves.push({ from: row.asset_path, to: asset });
    if (row.thumb_path && thumb) moves.push({ from: row.thumb_path, to: thumb });

    next.push({
      user_id: newOwnerId,
      project_id: newProjectId,
      generation_request_id: newRequestId,
      variant_index: row.variant_index,
      selected: row.selected ?? false,
      width: row.width ?? null,
      height: row.height ?? null,
      review: row.review ?? null,
      asset_path: asset,
      thumb_path: thumb,
    });
  }

  return { rows: next, moves };
}

/**
 * 복사한 캐릭터의 그림이 놓일 자리.
 *
 * **캐릭터는 칸이 하나 적다** — `{소유자}/{캐릭터}/{각도}.{확장자}` 다
 * (`lib/characters.ts` 의 `viewStoragePath`). 작업물은 도구 칸이 하나 더 있어
 * `copiedAssetPath` 를 그대로 쓸 수 없다.
 *
 * 규칙은 같다: **첫 칸을 복사한 사람으로, 둘째 칸을 새 캐릭터 id 로.**
 * 버킷 정책이 첫 칸으로 소유자를 판정하기 때문이다.
 */
export function copiedCharacterAssetPath(
  originalPath: string,
  newOwnerId: string,
  newCharacterId: string,
): string | null {
  if (!newOwnerId || !newCharacterId) return null;
  const parts = originalPath.split("/");
  // `{소유자}/{캐릭터}/{남은 이름}` — 적어도 셋이어야 한다.
  if (parts.length < 3) return null;
  const rest = parts.slice(2);
  if (!rest.length || !rest.every(usablePart)) return null;
  return [newOwnerId, newCharacterId, ...rest].join("/");
}

/**
 * 라이브러리 작업(상세페이지·리디자인)의 그림 자리.
 *
 * **캐릭터와 모양이 같다** — `{소유자}/{묶음}/{남은 이름}` 이다
 * (`lib/server-library.ts` 가 `${userId}/${itemId}/${position}.${ext}` 로 쓴다).
 * 같은 규칙을 두 번 적지 않는다. 이름을 따로 두는 것은, 어느 날 한쪽 규약이
 * 바뀌어도 **부르는 쪽을 안 건드리고** 여기만 갈라 놓을 수 있게 하려는 것이다.
 */
export function copiedLibraryAssetPath(
  originalPath: string,
  newOwnerId: string,
  newItemId: string,
): string | null {
  return copiedCharacterAssetPath(originalPath, newOwnerId, newItemId);
}
