import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import {
  TEAM_SCOPED_TABLES,
  normalizeTeamName,
  teamNameError,
  type TeamMemberRow,
  type TeamRole,
  type TeamWithMembers,
  type UnassignedRow,
} from "./core";
import type { TeamCredit } from "./credit";

/**
 * 팀 편성 — 저장소를 만지는 쪽.
 *
 * 전부 서버 권한으로 한다. `teams`·`team_members` 는 회원에게 권한을
 * 회수해 두었다 — 브라우저가 PostgREST 로 직접 긁으면 남의 팀 구성과 이름이
 * 그대로 새 나간다. 누가 부를 수 있는지는 부르는 쪽(서버 액션)이 정한다.
 *
 * ── 로컬 확인 모드에는 이 저장소가 없다 ─────────────────────────
 *
 * 로컬은 **Supabase 환경변수를 비워 두고** 돈다(`lib/dev-auth.ts`). 그러면
 * `createSupabaseAdminClient()` 가 던진다.
 *
 * 셸(`studio-layout`)이 모든 화면에서 `myMembership()` 을 부르므로, 여기서
 * 안 막으면 **로컬로 띄운 순간 라이브러리·카드뉴스·이미지가 전부 500** 이
 * 된다. 팀과 아무 상관 없는 화면까지 못 쓰게 된다.
 *
 * 그래서 읽는 자리는 「팀 없음」으로 답하고, 쓰는 자리는 사람이 읽을 수 있는
 * 말로 막는다. 조용히 성공한 척하면 로컬에서 팀을 만든 줄 알게 된다.
 */

/** 로컬 확인 모드인가. 그때는 팀 저장소가 아예 없다. */
function noTeamStore(): boolean {
  return isLocalStoreEnabled();
}

const TEAM_COLUMNS = "id,name,monthly_quota,created_at";

interface TeamDbRow {
  id: string;
  name: string;
  monthly_quota: number;
  created_at: string;
}

/* ── 읽기 ─────────────────────────────────────────────────────── */

/**
 * 팀과 팀원을 한 번에 읽는다.
 *
 * 팀마다 팀원을 따로 물으면 팀이 열이면 질의가 열한 번이다. 두 번으로 끝낸다.
 */
export async function listTeams(): Promise<TeamWithMembers[]> {
  if (noTeamStore()) return [];
  const admin = createSupabaseAdminClient();

  const { data: teamRows, error } = await admin
    .from("teams")
    .select(TEAM_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const teams = ((teamRows ?? []) as TeamDbRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    monthlyQuota: row.monthly_quota,
    createdAt: row.created_at,
    members: [] as TeamMemberRow[],
  }));
  if (!teams.length) return teams;

  const { data: memberRows } = await admin
    .from("team_members")
    .select("user_id,team_id,role,joined_at")
    .in("team_id", teams.map((team) => team.id));
  const members = (memberRows ?? []) as Array<{
    user_id: string; team_id: string; role: TeamRole; joined_at: string;
  }>;

  // 메일 주소는 따로 읽는다. `profiles(email)` 로 붙여 오면 한 번에 끝나지만,
  // 그 임베드의 타입이 배열로 잡혀 코드마다 캐스팅이 붙는다 — 질의 하나를
  // 더 던지는 편이 싸다.
  const emails = await emailsOf(members.map((row) => row.user_id));

  const byTeam = new Map(teams.map((team) => [team.id, team]));
  for (const row of members) {
    byTeam.get(row.team_id)?.members.push({
      userId: row.user_id,
      // 프로필이 사라진 회원이 남아 있을 수 있다. 그 한 줄 때문에 팀 목록이
      // 통째로 비면, 무엇이 없어졌는지도 모른다.
      email: emails.get(row.user_id) ?? "(알 수 없음)",
      role: row.role,
      joinedAt: row.joined_at,
    });
  }

  // 팀장을 맨 위에, 그다음 들어온 순서. 팀장이 어디 있는지 눈으로 찾지 않게.
  for (const team of teams) {
    team.members.sort((a, b) =>
      a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === "leader" ? -1 : 1);
  }
  return teams;
}

async function emailsOf(userIds: readonly string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const { data } = await createSupabaseAdminClient()
    .from("profiles").select("id,email").in("id", [...userIds]);
  return new Map(((data ?? []) as Array<{ id: string; email: string }>)
    .map((row) => [row.id, row.email]));
}

/**
 * 아직 어느 팀에도 없는 회원.
 *
 * **감추지 않고 드러낸다.** 소속 없는 사람이 목록 아래에 묻히면 새로 가입한
 * 회원이 영영 팀에 못 들어간다.
 */
export async function listUnassigned(): Promise<UnassignedRow[]> {
  if (noTeamStore()) return [];
  const admin = createSupabaseAdminClient();

  const { data: assigned } = await admin.from("team_members").select("user_id");
  const taken = new Set(((assigned ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,email,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((profiles ?? []) as Array<{ id: string; email: string; created_at: string }>)
    .filter((row) => !taken.has(row.id))
    .map((row) => ({ userId: row.id, email: row.email, createdAt: row.created_at }));
}

/**
 * 이 사람이 어느 팀의 무엇인가.
 *
 * 화면이 무엇을 낼지가 여기서 갈린다 — 운영자는 전부, 팀장은 자기 팀,
 * 소속 없는 사람은 「아직 팀이 없습니다」.
 *
 * **못 읽은 것을 「소속 없음」으로 돌려주지 않는다.** 예전에는 오류를 버리고
 * `null` 을 줬는데, 그 `null` 은 두 가지 서로 다른 사실을 한 값으로 뭉갠 것이다
 * — 「이 사람은 팀이 없다」와 「지금은 알 수 없다」. 부르는 쪽은 앞의 뜻으로
 * 읽으므로, 조회가 한 번 흔들리면 **문지기가 열린 채로 실패한다**:
 * `assignMemberAction` 의 검사가 남의 팀 사람을 「아직 팀이 없는 사람」으로
 * 보고 통과시킨다. 읽기 범위 쪽도 조용히 개인 것만 보여 주어, 팀 자료가
 * 사라진 것처럼 보인다.
 *
 * 같은 실수를 `lib/access/core.ts` 의 `ownerFilter` 가 이미 겪었다 — 「값이
 * 비었다」와 「조건이 없다」를 한 값으로 두면 질의에 그대로 흘러 들어간다.
 * 모르면 던진다. 부르는 쪽이 그 사실을 알아야 한다.
 */
export async function myMembership(
  userId: string,
): Promise<{ teamId: string; role: TeamRole } | null> {
  if (noTeamStore()) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from("team_members").select("team_id,role").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { team_id: string; role: TeamRole };
  return { teamId: row.team_id, role: row.role };
}

/**
 * 이 사람의 팀 ID. 읽기 범위를 만들 때 쓴다.
 *
 * 캐시를 안 씌운다. 요청 하나에 한 번씩만 부르는 자리들이라 값이 없고,
 * React 의 `cache` 는 RSC 조건에서만 나와서 라우트 시험이 통째로 못 뜬다.
 */
export async function teamIdOf(userId: string): Promise<string | null> {
  const mine = await myMembership(userId);
  return mine?.teamId ?? null;
}

/** 한 팀만 읽는다. 팀장 화면이 쓴다 — 남의 팀 이름까지 내려보내지 않는다. */
export async function getTeam(teamId: string): Promise<TeamWithMembers | null> {
  const teams = await listTeams();
  return teams.find((team) => team.id === teamId) ?? null;
}

/** 활성 회원 수. 배정률을 재는 분모다. */
export async function countActiveMembers(): Promise<number> {
  if (noTeamStore()) return 0;
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  return count ?? 0;
}

/**
 * 이 사람들이 만들어 둔 것이 각각 몇 건인가.
 *
 * 배정 전에 화면이 「작업물 N건이 팀에 함께 들어갑니다」를 보여주려고 센다.
 * **지난 초안이 팀에 공개되는 일은 놀랄 만한 일이라, 누르고 나서 알면 늦다.**
 *
 * 사람마다 여섯 번 물으면 후보가 스물이면 백스무 번이다. 표마다 한 번씩
 * 여섯 번만 묻고 세는 것은 여기서 한다.
 */
export async function countWorkFor(
  userIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (noTeamStore() || !userIds.length) return counts;

  const admin = createSupabaseAdminClient();
  const ids = [...userIds];
  await Promise.all(
    TEAM_SCOPED_TABLES.map(async (table) => {
      const { data } = await admin
        .from(table)
        .select("user_id")
        .in("user_id", ids)
        .is("team_id", null);
      for (const row of (data ?? []) as Array<{ user_id: string }>) {
        counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
      }
    }),
  );
  return counts;
}

/* ── 쓰기 ─────────────────────────────────────────────────────── */

export async function createTeam(name: string, createdBy: string): Promise<string> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const problem = teamNameError(name);
  if (problem) throw new Error(problem);

  const { data, error } = await createSupabaseAdminClient()
    .from("teams")
    .insert({ name: normalizeTeamName(name), created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const problem = teamNameError(name);
  if (problem) throw new Error(problem);

  const { error } = await createSupabaseAdminClient()
    .from("teams")
    .update({ name: normalizeTeamName(name), updated_at: new Date().toISOString() })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
}

/**
 * 팀을 접는다. **지우지 않는다.**
 *
 * 팀을 지우면 그 안의 작업물이 통째로 안 보이게 되는데, 되돌릴 길이 없으면
 * 그건 사고다. 행은 남기고 목록에서만 뺀다.
 *
 * 팀원의 작업물은 **개인 것으로 돌려놓는다.** 접힌 팀에 매달아 두면 그 사람도
 * 못 보고 팀장도 못 보는 것이 된다 — 아무도 못 보는 작업물을 만들지 않는다.
 */
export async function archiveTeam(teamId: string): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const { requireAdmin } = await import("../membership/server");
  const actor = await requireAdmin();
  const { error } = await createSupabaseAdminClient().rpc("archive_team_v2", { p_actor: actor.user.id, p_team: teamId });
  if (error) throw new Error(error.message);
}

/** Membership and work ownership move in one audited database transaction. */
async function changeMembership(userId: string, action: "assign" | "remove" | "role", teamId: string | null, role: TeamRole) {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const { requireActiveMember } = await import("../membership/server");
  const actor = await requireActiveMember();
  const { error } = await createSupabaseAdminClient().rpc("change_team_membership_v2", {
    p_actor: actor.user.id, p_target: userId, p_action: action, p_team: teamId, p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function assignMember(userId: string, teamId: string, role: TeamRole = "member"): Promise<void> {
  await changeMembership(userId, "assign", teamId, role);
}

export async function removeMember(userId: string): Promise<void> {
  await changeMembership(userId, "remove", null, "member");
}

export async function setMemberRole(userId: string, role: TeamRole): Promise<void> {
  await changeMembership(userId, "role", null, role);
}

/* ── 크레딧 ───────────────────────────────────────────────────── */

/**
 * 이 팀의 이번 달 크레딧 상황.
 *
 * 쓴 것과 잡아 둔 것을 **함께 센다.** 예약만 하고 아직 안 끝난 것을 빼고
 * 세면, 화면에는 남았다고 뜨는데 만들면 막힌다. DB 의 `team_units_used()` 와
 * 같은 규칙이라야 두 숫자가 안 갈린다.
 */
export async function teamCredit(teamId: string): Promise<TeamCredit> {
  if (noTeamStore()) return { quota: 0, teamUsed: 0, members: [] };
  const admin = createSupabaseAdminClient();

  const [{ data: teamRow }, members] = await Promise.all([
    admin.from("teams").select("monthly_quota").eq("id", teamId).maybeSingle(),
    (async () => {
      const teams = await listTeams();
      return teams.find((team) => team.id === teamId)?.members ?? [];
    })(),
  ]);
  if (!members.length) {
    return { quota: (teamRow as { monthly_quota: number } | null)?.monthly_quota ?? 0, teamUsed: 0, members: [] };
  }

  const userIds = members.map((row) => row.userId);
  const periodStart = seoulPeriodStart();

  /**
   * **두 벌을 따로 센다.**
   *
   *   - 사람별(`user_id`): 개인 상한과 비교할 값이다. 예약 함수도 팀을 안 가리고
   *     이 사람의 이벤트를 전부 더해 개인 상한과 비교한다.
   *   - 팀별(`team_id`): DB 의 `team_units_used()` 와 같은 기준이다. 지금 팀원이
   *     아닌 사람이 이 팀에서 쓴 것도 여기 들어간다.
   *
   * 예전에는 사람별 하나로 둘 다 대신했다. `generation_events.team_id` 는 배정
   * 때 소급 갱신되지 않으므로, 달 중간에 사람이 빠지면 화면과 DB 가 갈렸다.
   */
  const [{ data: events }, { data: teamEvents }, { data: profiles }] = await Promise.all([
    admin
      .from("generation_events")
      .select("user_id,status,requested_units,consumed_units,expires_at")
      .in("user_id", userIds)
      .eq("period_start", periodStart),
    admin
      .from("generation_events")
      .select("user_id,status,requested_units,consumed_units,expires_at")
      .eq("team_id", teamId)
      .eq("period_start", periodStart),
    admin.from("profiles").select("id,monthly_quota").in("id", userIds),
  ]);

  const now = Date.now();
  type EventRow = {
    user_id: string; status: string; requested_units: number;
    consumed_units: number | null; expires_at: string | null;
  };
  /** DB 의 `team_units_used()` 와 같은 셈. 여기가 갈리면 화면이 거짓말을 한다. */
  const amountOf = (row: EventRow): number => (
    row.status === "succeeded"
      ? (row.consumed_units ?? 0)
      : row.status === "reserved" && row.expires_at && Date.parse(row.expires_at) > now
        ? row.requested_units
        : 0
  );

  const used = new Map<string, number>();
  for (const row of (events ?? []) as EventRow[]) {
    const amount = amountOf(row);
    if (amount) used.set(row.user_id, (used.get(row.user_id) ?? 0) + amount);
  }

  const usedInTeam = new Map<string, number>();
  let teamUsed = 0;
  for (const row of (teamEvents ?? []) as EventRow[]) {
    const amount = amountOf(row);
    if (!amount) continue;
    teamUsed += amount;
    usedInTeam.set(row.user_id, (usedInTeam.get(row.user_id) ?? 0) + amount);
  }

  const quotas = new Map(
    ((profiles ?? []) as Array<{ id: string; monthly_quota: number }>)
      .map((row) => [row.id, row.monthly_quota]),
  );

  return {
    quota: (teamRow as { monthly_quota: number } | null)?.monthly_quota ?? 0,
    teamUsed,
    members: members.map((row) => ({
      userId: row.userId,
      email: row.email,
      role: row.role,
      used: used.get(row.userId) ?? 0,
      usedInTeam: usedInTeam.get(row.userId) ?? 0,
      personalQuota: quotas.get(row.userId) ?? 0,
    })),
  };
}

/**
 * 정산이 도는 달의 첫날.
 *
 * DB 는 `date_trunc('month', now() at time zone 'Asia/Seoul')` 를 쓴다.
 * 서버가 어느 시간대에 있든 같은 날을 가리켜야 한다 — UTC 로 재면 매달 1일
 * 오전 아홉 시간 동안 지난달을 센다.
 */
function seoulPeriodStart(): string {
  const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${seoul.getUTCFullYear()}-${String(seoul.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** 팀 한도를 정한다. 0 은 「안 정했다」로 남는다. */
export async function setTeamQuota(teamId: string, quota: number): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const { requireAdmin } = await import("../membership/server");
  const actor = await requireAdmin();
  const { error } = await createSupabaseAdminClient().rpc("set_usage_quota_v2", {
    p_actor: actor.user.id, p_kind: "team", p_target: teamId, p_quota: quota, p_reason: "관리자 팀 한도 변경",
  });
  if (error) throw new Error(error.message);
}

/** 팀원 한 사람의 개인 상한. 팀 잔량 안에서의 천장이다. */
export async function setPersonalQuota(userId: string, quota: number): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const { requireAdmin } = await import("../membership/server");
  const actor = await requireAdmin();
  const { error } = await createSupabaseAdminClient().rpc("set_usage_quota_v2", {
    p_actor: actor.user.id, p_kind: "personal", p_target: userId, p_quota: quota, p_reason: "관리자 개인 한도 변경",
  });
  if (error) throw new Error(error.message);
}

/**
 * 이 회원들이 각각 어느 팀인가.
 *
 * 관리자 화면이 명단 옆에 팀을 붙이려고 부른다. 사람마다 한 번씩 물으면
 * 50명이면 50번이라, 한 번에 묻고 표로 돌려준다.
 */
export async function teamsOf(
  userIds: readonly string[],
): Promise<Map<string, { teamId: string; teamName: string; role: TeamRole }>> {
  const result = new Map<string, { teamId: string; teamName: string; role: TeamRole }>();
  if (noTeamStore() || !userIds.length) return result;

  const admin = createSupabaseAdminClient();
  const { data: memberRows } = await admin
    .from("team_members")
    .select("user_id,team_id,role")
    .in("user_id", [...userIds]);

  const members = (memberRows ?? []) as Array<{ user_id: string; team_id: string; role: TeamRole }>;
  if (!members.length) return result;

  // 팀 이름은 따로 읽는다. 접힌 팀은 이름을 안 붙인다 — 목록에서 뺀 팀을
  // 관리자 화면에만 살려 두면 두 화면이 다른 말을 한다.
  const { data: teamRows } = await admin
    .from("teams")
    .select("id,name")
    .in("id", [...new Set(members.map((row) => row.team_id))])
    .is("deleted_at", null);
  const names = new Map(
    ((teamRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );

  for (const row of members) {
    const teamName = names.get(row.team_id);
    if (!teamName) continue;
    result.set(row.user_id, { teamId: row.team_id, teamName, role: row.role });
  }
  return result;
}
