/**
 * 목록에 걸 표지를 고른다.
 *
 * **사본이 있으면 사본이다.** 낱장 보기·확대·내려받기는 원본을 그대로 쓰므로
 * 여기만 작은 것으로 바꾼다. 사본이 없는 옛 작업물은 원본으로 떨어진다.
 *
 * 라이브러리를 열면 처음 보이는 자리라, 여기가 원본을 받으면 목록 한 번에
 * 수십 MB 가 오간다 — 미리보기를 만들어 둔 이유가 바로 이것이다.
 *
 * 카드뉴스는 `assetUrl`, 포스터는 `url` 로 이름이 달라 둘 다 받는다.
 */
export function coverOf(
  first: { url?: string | null; assetUrl?: string | null; thumbUrl?: string | null } | undefined,
): string | null {
  if (!first) return null;
  return first.thumbUrl ?? first.url ?? first.assetUrl ?? null;
}
