/**
 * 참고 이미지를 누가 보나.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────
 *
 *   내 것             본다
 *   남의 것           안 본다 — 팀이 붙었든 안 붙었든
 *   운영자            전부 본다
 *
 * ── 왜 이렇게 됐나 ────────────────────────────────────────────────
 *
 * 2026-09-04 에 참고 이미지를 회원 전원 공용으로 열었다(202609040010). 내부
 * 몇 사람이 쓸 때는 「같은 본보기를 사람 수만큼 다시 올리지 않게」가 맞았다.
 * 2026-09-07 에 팀이 생기면서 팀에 묶인 것만 그 팀으로 좁혔다(202609070006).
 *
 * 2026-09-28 에 사용자가 되돌렸다.
 *
 * > 참고 이미지도 사용자별로 구분 시켜주세요. 이 시스템에 팀 시스템이 있긴하지만,
 * > 그건 지금 사용하지 않을 계획입니다.
 *
 * 유료로 공개하면 모르는 고객끼리 같은 창고를 쓰게 된다. 한 사람이 올린 제품
 * 사진·얼굴 사진이 다른 고객의 고르기 창에 파일 이름째 보인다. 관리자가 올린
 * 것도 고객에게 안 보인다 — 사용자가 「완전히 내 것만」을 골랐다.
 *
 * 팀 칸(`team_id`)은 표에 남아 있지만 **보는 범위를 넓히지 않는다.** 팀 기능을
 * 다시 켜서 공유가 필요해지면 그때 이 규칙과 DB 의 `reference_visible()` 을
 * 함께 바꾼다(202609280004).
 */

export interface ReferenceViewScope {
  userId: string;
  /** 운영자는 전부 본다 — 신고를 확인하고 갤러리에 걸 것을 고른다. */
  isAdmin: boolean;
}

export type ReferenceVisibility =
  /** 전부. 운영자만. */
  | { kind: "all" }
  /** 내가 올린 것만. */
  | { kind: "own"; userId: string };

export function referenceVisibility(scope: ReferenceViewScope): ReferenceVisibility {
  if (scope.isAdmin) return { kind: "all" };
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
  if (visibility.kind === "all") return true;
  return row.userId === visibility.userId;
}
