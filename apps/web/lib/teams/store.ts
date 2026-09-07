import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import {
  TEAM_SCOPED_TABLES,
  canDemote,
  canRemove,
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
 */
export async function myMembership(
  userId: string,
): Promise<{ teamId: string; role: TeamRole } | null> {
  if (noTeamStore()) return null;
  const { data } = await createSupabaseAdminClient()
    .from("team_members").select("team_id,role").eq("user_id", userId).maybeSingle();
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
  const admin = createSupabaseAdminClient();

  const { data: members } = await admin
    .from("team_members").select("user_id").eq("team_id", teamId);
  for (const row of (members ?? []) as Array<{ user_id: string }>) {
    await clearWorkTeam(row.user_id, teamId);
  }

  const removed = await admin.from("team_members").delete().eq("team_id", teamId);
  if (removed.error) throw new Error(removed.error.message);

  const { error } = await admin
    .from("teams")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
}

/** 이 회원이 만든 것에 팀을 단다. 배정과 함께 움직인다. */
async function stampWorkTeam(userId: string, teamId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  for (const table of TEAM_SCOPED_TABLES) {
    // 이미 다른 팀에 있는 것은 안 건드린다 — 한 사람은 한 팀이라 지금은
    // 있을 수 없지만, 규칙이 넓어지는 날 조용히 남의 팀 것을 끌어오면 안 된다.
    const { error } = await admin
      .from(table)
      .update({ team_id: teamId })
      .eq("user_id", userId)
      .is("team_id", null);
    if (error) throw new Error(error.message);
  }
}

/** 팀에서 뺄 때 되돌린다. 그 팀에 매달린 것만 푼다. */
async function clearWorkTeam(userId: string, teamId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  for (const table of TEAM_SCOPED_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ team_id: null })
      .eq("user_id", userId)
      .eq("team_id", teamId);
    if (error) throw new Error(error.message);
  }
}

/**
 * 팀에 넣는다. **만들어 둔 것도 함께 간다.**
 *
 * 회원 줄을 먼저 넣고 작업물에 도장을 찍는다. 순서가 중요하다 — 도장을 먼저
 * 찍고 회원 줄에서 실패하면, 아무 팀에도 없는 사람의 작업물에 팀이 붙어
 * 그 사람도 못 보고 팀장도 못 보는 것이 된다.
 */
export async function assignMember(
  userId: string,
  teamId: string,
  role: TeamRole = "member",
): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("team_members")
    .upsert({ user_id: userId, team_id: teamId, role }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await stampWorkTeam(userId, teamId);
}

/** 팀에서 뺀다. 작업물은 개인 것으로 돌아간다. */
export async function removeMember(userId: string): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const admin = createSupabaseAdminClient();

  const { data: current } = await admin
    .from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (!current) return;

  const teamId = (current as { team_id: string }).team_id;
  const members = await membersOf(teamId);
  if (!canRemove(members, userId)) {
    throw new Error("마지막 팀장은 뺄 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요.");
  }

  // 작업물을 먼저 푼다. 회원 줄을 먼저 지우면 어느 팀에서 풀어야 할지
  // 알 수 없어, 팀이 붙은 채 남는다.
  await clearWorkTeam(userId, teamId);
  const { error } = await admin.from("team_members").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setMemberRole(userId: string, role: TeamRole): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const admin = createSupabaseAdminClient();

  const { data: current } = await admin
    .from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (!current) throw new Error("팀에 속한 회원이 아닙니다.");

  if (role === "member") {
    const members = await membersOf((current as { team_id: string }).team_id);
    if (!canDemote(members, userId)) {
      throw new Error("마지막 팀장은 내릴 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요.");
    }
  }

  const { error } = await admin.from("team_members").update({ role }).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function membersOf(teamId: string): Promise<Array<{ userId: string; role: TeamRole }>> {
  const { data } = await createSupabaseAdminClient()
    .from("team_members").select("user_id,role").eq("team_id", teamId);
  return ((data ?? []) as Array<{ user_id: string; role: TeamRole }>)
    .map((row) => ({ userId: row.user_id, role: row.role }));
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
  if (noTeamStore()) return { quota: 0, members: [] };
  const admin = createSupabaseAdminClient();

  const [{ data: teamRow }, members] = await Promise.all([
    admin.from("teams").select("monthly_quota").eq("id", teamId).maybeSingle(),
    (async () => {
      const teams = await listTeams();
      return teams.find((team) => team.id === teamId)?.members ?? [];
    })(),
  ]);
  if (!members.length) {
    return { quota: (teamRow as { monthly_quota: number } | null)?.monthly_quota ?? 0, members: [] };
  }

  const userIds = members.map((row) => row.userId);
  const periodStart = seoulPeriodStart();

  const [{ data: events }, { data: profiles }] = await Promise.all([
    admin
      .from("generation_events")
      .select("user_id,status,requested_units,consumed_units,expires_at")
      .in("user_id", userIds)
      .eq("period_start", periodStart),
    admin.from("profiles").select("id,monthly_quota").in("id", userIds),
  ]);

  const now = Date.now();
  const used = new Map<string, number>();
  for (const row of (events ?? []) as Array<{
    user_id: string; status: string; requested_units: number;
    consumed_units: number | null; expires_at: string | null;
  }>) {
    const amount =
      row.status === "succeeded"
        ? (row.consumed_units ?? 0)
        : row.status === "reserved" && row.expires_at && Date.parse(row.expires_at) > now
          ? row.requested_units
          : 0;
    if (amount) used.set(row.user_id, (used.get(row.user_id) ?? 0) + amount);
  }

  const quotas = new Map(
    ((profiles ?? []) as Array<{ id: string; monthly_quota: number }>)
      .map((row) => [row.id, row.monthly_quota]),
  );

  return {
    quota: (teamRow as { monthly_quota: number } | null)?.monthly_quota ?? 0,
    members: members.map((row) => ({
      userId: row.userId,
      email: row.email,
      role: row.role,
      used: used.get(row.userId) ?? 0,
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
  const { error } = await createSupabaseAdminClient()
    .from("teams")
    .update({ monthly_quota: quota, updated_at: new Date().toISOString() })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
}

/** 팀원 한 사람의 개인 상한. 팀 잔량 안에서의 천장이다. */
export async function setPersonalQuota(userId: string, quota: number): Promise<void> {
  if (noTeamStore()) throw new Error("로컬 확인 모드에는 팀 저장소가 없습니다.");
  const { error } = await createSupabaseAdminClient()
    .from("profiles")
    .update({ monthly_quota: quota, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
