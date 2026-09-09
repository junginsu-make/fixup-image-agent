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

/**
 * 이 회원이 만든 것에 팀을 단다. 배정과 함께 움직인다.
 *
 * `fromTeamId` 를 주면 **그 팀에 달려 있던 것도 함께 옮긴다.** 팀을 옮기는
 * 경우다.
 *
 * 예전에는 `team_id IS NULL` 인 것만 달았다. 주석은 「한 사람은 한 팀이라
 * 지금은 있을 수 없다」였지만, `assignMember` 가 `onConflict: "user_id"`
 * upsert 라 소속 변경이 실제로 일어난다. 그래서 옮긴 사람의 작업물이 옛 팀에
 * 그대로 남았다 — 새 팀장에게는 안 보이고 옛 팀장은 계속 보고 만질 수 있으며,
 * 그다음 「팀 없음」을 골라도 `clearWorkTeam` 은 현재 팀만 푸므로 화면으로는
 * 되돌릴 방법이 없었다.
 *
 * `fromTeamId` 가 없으면 지금까지처럼 팀 없는 것만 단다 — 규칙이 넓어지는 날
 * 조용히 남의 팀 것을 끌어오면 안 된다.
 */
async function stampWorkTeam(
  userId: string,
  teamId: string,
  fromTeamId?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  for (const table of TEAM_SCOPED_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ team_id: teamId })
      .eq("user_id", userId)
      .is("team_id", null);
    if (error) throw new Error(error.message);

    if (!fromTeamId || fromTeamId === teamId) continue;
    const moved = await admin
      .from(table)
      .update({ team_id: teamId })
      .eq("user_id", userId)
      .eq("team_id", fromTeamId);
    if (moved.error) throw new Error(moved.error.message);
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

  /**
   * **어디서 오는지 먼저 본다.**
   *
   * 두 가지가 여기에 달려 있다. 하나는 옛 팀에 남을 뻔한 작업물을 함께
   * 옮기는 것이고, 다른 하나는 **마지막 팀장 보호**다.
   *
   * `removeMember` 와 `setMemberRole` 은 `canRemove`·`canDemote` 로 「팀장 없는
   * 팀」을 막는데 이 함수만 검사가 없었다. 운영자가 고르개에서 A팀의 유일한
   * 팀장을 B팀으로 옮기면 A팀은 팀장 0명이 되어, 운영자가 손대기 전에는
   * 아무도 사람을 넣고 뺄 수 없는 굳은 팀이 됐다 — `core.ts` 가 명시적으로
   * 없애려던 상태다. 팀을 옮기는 것은 옛 팀에서 빠지는 것이므로 같은 규칙을 건다.
   *
   * **제자리에 다시 넣는 것도 같은 규칙이다.** 배정은 자리뿐 아니라 맡은 자리
   * (`role`)까지 덮어쓴다. 그래서 이미 이 팀인 사람을 `role: "member"` 로 다시
   * 보내면 `setMemberRole` 을 거치지 않고 왕관이 벗겨진다 — 혼자뿐인 팀장이
   * 자기 ID 를 그렇게 보내면 그 팀은 팀장 0명이 된다. 배정 폼과 역할 폼이
   * 서로 다른 답을 내면 안 되므로 여기서 `canDemote` 를 같이 본다.
   */
  const { data: current, error: currentError } = await admin
    .from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  // 못 읽은 것을 「소속 없음」으로 넘기면 아래 두 검사가 통째로 건너뛰어진다.
  if (currentError) throw new Error(currentError.message);
  const fromTeamId = (current as { team_id: string } | null)?.team_id;

  if (fromTeamId && fromTeamId !== teamId) {
    const members = await membersOf(fromTeamId);
    if (!canRemove(members, userId)) {
      throw new Error("마지막 팀장은 다른 팀으로 옮길 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요.");
    }
  }

  if (fromTeamId === teamId && role === "member") {
    const members = await membersOf(teamId);
    if (!canDemote(members, userId)) {
      throw new Error("마지막 팀장은 팀원으로 내릴 수 없습니다. 먼저 다른 팀원을 팀장으로 세워 주세요.");
    }
  }

  const { error } = await admin
    .from("team_members")
    .upsert({ user_id: userId, team_id: teamId, role }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await stampWorkTeam(userId, teamId, fromTeamId);
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
