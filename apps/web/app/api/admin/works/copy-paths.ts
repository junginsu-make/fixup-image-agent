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
  if (!tool || !rest.length || rest.some((part) => !part)) return null;
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
