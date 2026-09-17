/**
 * 참고 이미지를 지우기 전에 **누구 것인지 밝히고 묻는다.**
 *
 * 창고가 공용이라 목록에는 내 것과 남의 것이 나란히 있다. 밝히지 않으면 잘못
 * 짚기 쉽고, 지우면 그 그림을 쓰던 **다른 회원의 작업이 함께 깨진다** — 지운
 * 쪽은 그 사실을 알 길이 없다.
 *
 * 라이브러리 탭이 먼저 이렇게 했는데, 고르는 창들은 안 따라갔다
 * (2026-09-17 독립 리뷰). 화면마다 문구를 적으면 또 갈리므로 여기 하나에 둔다.
 */
export function referenceDeletePrompt(image: {
  title?: string | null;
  /** `false` 면 남의 것. `undefined` 는 「모른다」라 조용히 넘어간다. */
  mine?: boolean;
  ownerEmail?: string | null;
}): string {
  const whose = image.mine === false
    ? `\n\n${image.ownerEmail ?? "다른 회원"}이 올린 것입니다. 이 그림을 쓰던 작업이 있으면 함께 깨집니다.`
    : "";
  return `'${image.title ?? "이 이미지"}' 를 라이브러리에서 지울까요?${whose}`;
}

/**
 * 이 그림에 지우기 단추를 낼까.
 *
 * **못 할 일은 단추부터 없는 편이 낫다** — 회원이 남의 것을 누르면 서버가 막아
 * 「지우지 못했습니다」만 떴다. 관리자는 할 수 있으므로 둔다. 공용 창고에 잘못
 * 올라온 것을 내릴 사람이 아무도 없으면 그대로 남는다.
 *
 * **모르면 안 낸다.** 처음에는 `mine !== false` 로 적었는데, 그러면 주인을 안
 * 실은 화면이 열린 쪽으로 틀린다 — 새 고르는 창이 그 값을 빠뜨리는 날 이번
 * 버그가 조용히 되살아난다(2026-09-17 독립 리뷰). 같은 파일의 `canDeleteOthers`
 * 도 닫힌 쪽이 기본이다. 두 값이 **같은 방향으로** 틀려야 한다.
 *
 * 잘못 닫히면 라이브러리 탭에서 지울 수 있다. 잘못 열리면 남의 그림이 사라진다.
 */
export function canDeleteReference(
  image: { mine?: boolean },
  viewer: { isAdmin?: boolean },
): boolean {
  return image.mine === true || Boolean(viewer.isAdmin);
}
