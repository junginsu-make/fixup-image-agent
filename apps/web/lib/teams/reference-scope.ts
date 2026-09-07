/**
 * 참고 이미지를 누가 보나.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────
 *
 *   팀이 안 붙은 것   **누구나 본다.** 공용 창고다
 *   내 팀 것          팀원 전원이 본다
 *   남의 팀 것        안 보인다
 *   운영자            전부 본다
 *
 * ── 왜 이렇게 갈리나 ──────────────────────────────────────────────
 *
 * 2026-09-04 에 참고 이미지를 회원 전원 공용으로 열었다(202609040010). 이유가
 * 분명했다 — 참고 이미지는 「따라 그릴 본보기」라, 한 사람이 올린 것을 남이 못
 * 쓰면 같은 그림을 사람 수만큼 다시 올려야 한다.
 *
 * 팀이 생기면 그 이유가 **팀 것에 한해서** 뒤집힌다. 팀에 묶인 본보기는 어떤
 * 브랜드를 준비 중인지가 드러나는 것이라 남의 팀에 보이면 안 된다. 하지만
 * 어디에도 안 묶인 본보기는 여전히 공용 창고다 — 좁힐 이유가 없다.
 *
 * **팀이 붙는 것은 두 순간뿐이다.** 팀에 배정될 때 그 사람이 올려 둔 것이
 * 함께 옮겨 가고(`stampWorkTeam`), 그 뒤로 올리는 것에 도장이 찍힌다
 * (`stamp_team` 트리거). 그래서 팀을 안 쓰는 동안에는 모든 줄의 팀이 비어
 * 있고, 규칙이 지금과 똑같은 답을 낸다.
 */

export interface ReferenceViewScope {
  userId: string;
  /** 이 사람의 팀. 없으면 개인이다. */
  teamId: string | null;
  /** 운영자는 전부 본다 — 신고를 확인하고 갤러리에 걸 것을 고른다. */
  isAdmin: boolean;
}

export type ReferenceVisibility =
  /** 전부. 운영자만. */
  | { kind: "all" }
  /** 팀이 안 붙은 것 전부 + 내 팀 것 + 내 것. */
  | { kind: "team"; teamId: string; userId: string }
  /** 팀이 안 붙은 것 전부 + 내 것. 소속이 없는 사람이다. */
  | { kind: "loose"; userId: string };

export function referenceVisibility(scope: ReferenceViewScope): ReferenceVisibility {
  if (scope.isAdmin) return { kind: "all" };
  if (scope.teamId) return { kind: "team", teamId: scope.teamId, userId: scope.userId };
  return { kind: "loose", userId: scope.userId };
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
  if (visibility.kind === "all") return true;
  // 어디에도 안 묶인 본보기는 공용 창고다. 이 줄이 「팀을 쓰기 전에는 지금과
  // 똑같다」를 만든다 — 팀이 없으면 모든 줄이 이쪽으로 떨어진다.
  if (row.teamId === null) return true;
  // 내 것은 늘 보인다. 팀에서 빠졌거나 손으로 팀을 고친 줄이 있어도 자기
  // 본보기가 사라지지는 않는다.
  if (row.userId === visibility.userId) return true;
  return visibility.kind === "team" && row.teamId === visibility.teamId;
}
