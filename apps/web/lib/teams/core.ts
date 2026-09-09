/**
 * 팀 편성 — 값을 다루는 규칙만 모은 곳.
 *
 * DB 도 세션도 만지지 않는다. 팀에 넣고 빼는 일은 되돌리기 어려운 축에
 * 들어서, 그 판단만 따로 떼어 시험할 수 있어야 한다.
 */

export type TeamRole = "leader" | "member";

export interface TeamRow {
  id: string;
  name: string;
  monthlyQuota: number;
  createdAt: string;
}

export interface TeamMemberRow {
  userId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamWithMembers extends TeamRow {
  members: TeamMemberRow[];
}

/** 아직 어느 팀에도 없는 회원. 화면 맨 위에 올린다. */
export interface UnassignedRow {
  userId: string;
  email: string;
  createdAt: string;
}

/* ── 이름 ─────────────────────────────────────────────────────── */

export const TEAM_NAME_MAX = 60;

/**
 * 팀 이름을 다듬는다.
 *
 * 앞뒤 공백을 떼고 가운데 여러 칸을 하나로 줄인다. 「마케팅  팀」과
 * 「마케팅 팀」이 다른 팀이 되면, 목록에서 둘이 나란히 서고 어느 쪽에
 * 넣었는지 알 수 없다.
 */
export function normalizeTeamName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function teamNameError(raw: string): string | null {
  const name = normalizeTeamName(raw);
  if (!name) return "팀 이름을 적어 주세요.";
  if (name.length > TEAM_NAME_MAX) return `팀 이름은 ${TEAM_NAME_MAX}자를 넘길 수 없습니다.`;
  return null;
}

/* ── 배정 ─────────────────────────────────────────────────────── */

/**
 * 팀에 넣을 때 **그 사람이 이미 만들어 둔 것도 함께 간다.**
 *
 * 이 판단이 이 기능의 성격을 정한다. 안 가져가면 팀에 넣어도 팀장이 볼 것이
 * 하나도 없다 — 새로 만드는 것부터만 보이므로, 팀을 만든 날 화면이 텅 빈다.
 * 「팀장이 팀원의 생성물을 관리한다」는 것이 이 기능의 목적이었다.
 *
 * 되돌릴 수 있다는 것이 이 판단을 감당하게 한다. 팀에서 빼면 `team_id` 가
 * 다시 비고, 그 순간부터 개인 작업으로 돌아간다. 원본은 손대지 않는다.
 *
 * **그래도 사람에게는 미리 말한다.** 화면이 「작업물 N건이 팀에 함께
 * 들어갑니다」를 배정 전에 보여준다 — 지난 초안이 팀에 공개되는 일은
 * 놀랄 만한 일이라, 누르고 나서 알면 늦다.
 */
export const WORK_FOLLOWS_MEMBER = true;

/** 배정할 때 `team_id` 를 함께 채울 표들. 자식 표는 부모를 통해 판정한다. */
export const TEAM_SCOPED_TABLES = [
  "library_items",
  "sns_projects",
  "poster_projects",
  "reference_images",
  "reference_sets",
  "characters",
] as const;

export interface AssignPlan {
  userId: string;
  teamId: string;
  role: TeamRole;
  /** 함께 옮길 표. 비어 있으면 회원만 옮긴다. */
  tables: readonly string[];
}

export function planAssign(userId: string, teamId: string, role: TeamRole): AssignPlan {
  return {
    userId,
    teamId,
    role,
    tables: WORK_FOLLOWS_MEMBER ? TEAM_SCOPED_TABLES : [],
  };
}

/* ── 팀장 ─────────────────────────────────────────────────────── */

/**
 * 마지막 팀장을 내릴 수 있나.
 *
 * 없다. 팀장이 없는 팀은 아무도 팀원을 넣거나 뺄 수 없어 그대로 굳는다 —
 * 운영자가 손대야만 풀리는 상태를 화면이 만들면 안 된다.
 *
 * 팀장을 바꾸려면 **먼저 새 팀장을 세우고** 내린다. 순서를 강제하는 것이
 * 「팀장 없는 순간」을 없애는 가장 단순한 방법이다.
 */
export function canDemote(members: readonly { userId: string; role: TeamRole }[], userId: string): boolean {
  const target = members.find((member) => member.userId === userId);
  if (!target || target.role !== "leader") return true;
  return members.filter((member) => member.role === "leader").length > 1;
}

/**
 * 팀에서 뺄 수 있나.
 *
 * 마지막 팀장은 못 뺀다. 내리는 것과 같은 이유다 — 팀장 없는 팀이 남는다.
 */
export function canRemove(members: readonly { userId: string; role: TeamRole }[], userId: string): boolean {
  return canDemote(members, userId);
}

/* ── 요약 ─────────────────────────────────────────────────────── */

export interface AssignmentSummary {
  teams: number;
  assigned: number;
  unassigned: number;
  /** 배정률. 회원이 없으면 0 이다 — 0 으로 나누지 않는다. */
  ratio: number;
}

/**
 * 화면 맨 줄에 거는 숫자.
 *
 * 미배정을 **감추지 않고 드러낸다.** 소속 없는 사람이 목록 아래에 묻히면
 * 새로 가입한 회원이 영영 팀에 못 들어간다.
 */
export function summarize(
  teams: readonly unknown[],
  assignedCount: number,
  totalMembers: number,
): AssignmentSummary {
  const unassigned = Math.max(0, totalMembers - assignedCount);
  return {
    teams: teams.length,
    assigned: assignedCount,
    unassigned,
    ratio: totalMembers > 0 ? assignedCount / totalMembers : 0,
  };
}

/* ── 누가 팀을 꾸리나 ─────────────────────────────────────────── */

/**
 * 이 팀에 사람을 넣고 뺄 수 있나.
 *
 *   운영자   모든 팀
 *   팀장     **자기 팀만**
 *   그 밖    없음
 *
 * 팀을 만드는 것(운영자)과 팀 안을 꾸리는 것(팀장)을 가른다. 팀을 만드는
 * 일은 회사 구조를 정하는 일이고, 누가 우리 팀에 있느냐는 팀장이 매일 겪는
 * 일이다. 팀장이 사람 하나 넣으려고 운영자를 불러야 하면 이 화면은 안 쓰인다.
 *
 * **팀 ID 를 받아서 비교하는 것이 핵심이다.** 폼이 팀 ID 를 실어 보내므로,
 * 「팀장인가」만 묻고 통과시키면 남의 팀 ID 를 적는 것으로 아무 팀이나
 * 꾸릴 수 있다.
 */
export function canWriteTeam(
  isAdmin: boolean,
  mine: { teamId: string; role: TeamRole } | null,
  teamId: string,
): boolean {
  if (isAdmin) return true;
  return Boolean(mine && mine.teamId === teamId && mine.role === "leader");
}

/**
 * 이 회원을 이 팀에 넣을 수 있나.
 *
 * `canWriteTeam` 은 **넣는 자리**를 본다 — 「이 팀을 꾸릴 사람인가」. 그것만
 * 물으면 **끌어올 사람**은 아무나가 된다. 팀장이 자기 팀 ID 를 적는 것은
 * 정당한데, 그 폼에 남의 팀 사람 ID 를 실어 보내면 그 사람이 원래 팀에서
 * 빠져 이쪽으로 옮겨진다 — 배정은 `user_id` 로 덮어쓰기 때문이다
 * (`store.ts` 의 `assignMember`). 그러면 팀 도장이 없던 그 사람의 작업물이
 * 이쪽 팀 것이 되고(`stampWorkTeam`), 원래 팀의 공용 본보기는 안 보이게 된다.
 *
 * **그래서 대상이 지금 어디 있는지를 함께 본다.**
 *
 *   운영자   누구든 어느 팀으로든 — 팀 사이를 옮기는 것이 원래 운영자 몫이다
 *   팀장     **아직 팀이 없는 사람**과 **이미 우리 팀인 사람**만
 *
 * 팀장에게 옮기기를 막는 것이지 넣기를 막는 것이 아니다. 미배정 명단에서
 * 고르는 지금 화면의 쓰임새는 그대로다.
 */
export function canAssignMember(
  isAdmin: boolean,
  currentTeamId: string | null,
  teamId: string,
): boolean {
  if (isAdmin) return true;
  return currentTeamId === null || currentTeamId === teamId;
}
