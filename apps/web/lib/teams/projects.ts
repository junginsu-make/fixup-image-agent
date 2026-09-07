/**
 * 프로젝트 — 값을 다루는 규칙만.
 *
 * 팀 아래 **한 겹**이다. 중첩 폴더를 두지 않는다 — 지금 필요 없고, 필요해지는
 * 날이 오면 그때가 훨씬 싸게 만들 수 있는 시점이다.
 *
 * 작업물은 프로젝트 0개 또는 1개에 속한다. 태그가 아니라 분류다.
 */

export const PROJECT_NAME_MAX = 60;

export interface ProjectRow {
  id: string;
  teamId: string;
  name: string;
  position: number;
  createdAt: string;
}

/** 사이드바에 걸 한 줄. 세는 것까지 함께 준다. */
export interface ProjectItem extends ProjectRow {
  /** 이 프로젝트에 든 작업물 수. 비어 있는 것을 감추지 않으려고 함께 낸다. */
  workCount: number;
}

/** 프로젝트를 붙일 수 있는 표. 자식 표는 부모를 통해 따라간다. */
export const PROJECT_SCOPED_TABLES = [
  "library_items",
  "sns_projects",
  "poster_projects",
] as const;

export function normalizeProjectName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function projectNameError(raw: string): string | null {
  const name = normalizeProjectName(raw);
  if (!name) return "프로젝트 이름을 적어 주세요.";
  if (name.length > PROJECT_NAME_MAX) {
    return `프로젝트 이름은 ${PROJECT_NAME_MAX}자를 넘길 수 없습니다.`;
  }
  return null;
}

/* ── 지금 고른 프로젝트 ───────────────────────────────────────── */

/**
 * 쿠키에 남은 값이 지금도 쓸 수 있는가.
 *
 * **모르는 값이면 「전체」로 떨어진다.** 팀을 옮겼거나 프로젝트가 접힌 뒤에도
 * 쿠키는 남는데, 그 값을 그대로 걸면 **모든 화면이 텅 빈 채로 열린다.**
 * 화면에는 아무 표시도 없으니 「작업물이 다 사라졌다」로 보인다.
 *
 * 그래서 목록에 없는 id 는 없는 것으로 친다. 잘못 고른 결과가 「전부 보인다」
 * 쪽으로 떨어지는 것이, 「아무것도 안 보인다」 쪽으로 떨어지는 것보다 낫다.
 */
export function resolveCurrentProject(
  cookieValue: string | undefined,
  available: readonly { id: string }[],
): string | null {
  if (!cookieValue) return null;
  return available.some((project) => project.id === cookieValue) ? cookieValue : null;
}

/* ── 차례 ─────────────────────────────────────────────────────── */

/**
 * 하나를 위나 아래로 한 칸 옮긴다.
 *
 * 옮긴 뒤 **전체에 0,1,2… 를 다시 매긴다.** 두 줄만 바꿔치기하면, 손으로 만든
 * 행이나 지운 자리 때문에 `position` 이 겹쳐 있을 때 순서가 안 바뀐 것처럼
 * 보인다. 그때 사용자는 버튼이 고장 났다고 여긴다.
 *
 * 끝에서 더 밀면 그대로 둔다. 되감기지 않는다 — 맨 위에서 위를 눌렀을 때
 * 맨 아래로 가면 놀란다.
 */
export function reorder<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: "up" | "down",
): Array<{ id: string; position: number }> {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return [];

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return [];

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, position) => ({ id: item.id, position }));
}
