/**
 * 격자 한 칸에 걸 주소를 고른다.
 *
 * **사본이 있으면 사본이다.** 확대·내려받기·fal 참고 전달은 원본을 그대로
 * 쓰므로 여기만 작은 것으로 바꾼다. 사본이 없는 옛 항목은 원본으로 떨어진다.
 *
 * 왜 따로 두는가 — 같은 규칙을 화면마다 손으로 적으면 한 군데가 조용히
 * 빠진다. 실제로 불러오기 창이 그렇게 원본을 받고 있었다(2026-09-15 확인:
 * 사본 68KB · 원본 2,199KB, 32배). 화면은 멀쩡히 뜨고 느리기만 해서
 * 아무도 눈치채지 못했다.
 *
 * **원본 칸의 이름이 셋이다.** 카드뉴스는 `assetUrl`, 포스터는 `url`,
 * 참고 이미지는 `signedUrl` 이다. 셋 다 받는다 — 하나라도 빠뜨리면 사본이
 * 없는 옛 항목이 격자에서 **통째로 사라진다.** 느린 것이 아니라 안 보이는
 * 사고라, 이름을 늘릴 때는 `__tests__/grid-src.test.ts` 에 줄을 같이 더한다.
 */
export function gridSrc(
  item: {
    url?: string | null;
    assetUrl?: string | null;
    signedUrl?: string | null;
    thumbUrl?: string | null;
  } | undefined,
): string | null {
  if (!item) return null;
  return item.thumbUrl ?? item.url ?? item.assetUrl ?? item.signedUrl ?? null;
}
