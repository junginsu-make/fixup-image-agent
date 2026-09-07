/**
 * 참고 이미지를 누가 보나.
 *
 * ── 왜 좁히나 ─────────────────────────────────────────────────────
 *
 * 2026-09-04 에 참고 이미지를 **회원 전원 공용**으로 열었다. 이유가 분명했다 —
 * 참고 이미지는 「따라 그릴 본보기」라, 한 사람이 올린 것을 남이 못 쓰면 같은
 * 그림을 사람 수만큼 다시 올려야 한다.
 *
 * 팀이 생기면 그 이유가 뒤집힌다. 본보기는 **어떤 브랜드를 준비 중인지가
 * 그대로 드러나는 것**이라, 남의 팀 것이 보이면 안 된다.
 *
 * ── 설계와 다르게 한 것 ───────────────────────────────────────────
 *
 * 설계(결정 1)는 「팀이 없는 사람은 자기 것만 본다」로 못 박았다. 그대로 하면
 * **배포하는 날 전원이 서로의 본보기를 잃는다** — 지금은 팀이 하나도 없기
 * 때문이다. 팀을 만들기도 전에 잃는 것은 설계가 노린 것이 아니다.
 *
 * 그래서 **팀이 하나라도 생긴 뒤부터** 좁힌다. 팀이 없는 회사에서는 지금과
 * 똑같이 전원 공용이다. 첫 팀을 만드는 순간이 「이제 나눠 쓰겠다」고 정하는
 * 순간이고, 좁아지는 것도 그때다.
 *
 * 잃는 것은 「팀을 만들기 전에 미리 좁혀 두기」다. 그건 아무도 원하지 않는다.
 */

export interface ReferenceViewScope {
  userId: string;
  /** 이 사람의 팀. 없으면 개인이다. */
  teamId: string | null;
  /** 이 회사에 살아 있는 팀이 하나라도 있나. */
  anyTeamExists: boolean;
  /** 운영자는 전부 본다 — 신고를 확인하고 갤러리에 걸 것을 고른다. */
  isAdmin: boolean;
}

export type ReferenceVisibility =
  /** 전부. 팀을 안 쓰는 회사와 운영자. */
  | { kind: "all" }
  /** 같은 팀 것과 내 것. */
  | { kind: "team"; teamId: string; userId: string }
  /** 내 것만. 팀은 쓰는데 나는 아직 소속이 없는 경우. */
  | { kind: "own"; userId: string };

export function referenceVisibility(scope: ReferenceViewScope): ReferenceVisibility {
  if (scope.isAdmin || !scope.anyTeamExists) return { kind: "all" };
  if (scope.teamId) return { kind: "team", teamId: scope.teamId, userId: scope.userId };
  return { kind: "own", userId: scope.userId };
}

/**
 * 한 줄이 이 사람에게 보이나.
 *
 * DB 의 `reference_visible()` 과 **같은 규칙이어야 한다.** 목록은 서버 권한으로
 * 읽어 RLS 를 안 타므로, 두 곳이 갈리면 목록에는 보이는데 지우려면 막히거나
 * 그 반대가 된다.
 */
export function canSeeReference(
  visibility: ReferenceVisibility,
  row: { userId: string; teamId: string | null },
): boolean {
  switch (visibility.kind) {
    case "all":
      return true;
    case "team":
      // 내 것은 팀이 안 붙어 있어도 늘 보인다. 방금 올려 도장이 아직 안 찍힌
      // 것이 내 눈앞에서 사라지면 안 된다.
      return row.userId === visibility.userId || row.teamId === visibility.teamId;
    case "own":
      return row.userId === visibility.userId;
  }
}
