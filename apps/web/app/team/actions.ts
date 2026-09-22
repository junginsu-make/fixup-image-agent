"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireActiveMember, requireAdmin } from "../../lib/membership/server";
import { canAssignMember, canWriteTeam } from "../../lib/teams/core";
import {
  archiveTeam,
  assignMember,
  createTeam,
  myMembership,
  removeMember,
  renameTeam,
  setMemberRole,
  setPersonalQuota,
  setTeamQuota,
  teamIdOf,
} from "../../lib/teams/store";
import {
  archiveProject,
  createProject,
  listProjects,
  moveProject,
  moveWorkToProject,
  renameProject,
} from "../../lib/teams/project-store";
import { personalQuotaError, teamQuotaError } from "../../lib/teams/credit";
import { setCurrentProject } from "../../lib/teams/current-project";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { isCreditLedgerEnabled } from "../../lib/membership/credit-ledger";
import { isDisabledRoute } from "../../lib/access/routes";
import { failureUrl, teamFailure } from "../../lib/teams/failure";

/**
 * 팀 편성 — 누가 무엇을 할 수 있나.
 *
 *   운영자   팀 만들기·이름 바꾸기·접기, **모든 팀**의 배정, 팀 사이 옮기기
 *   팀장     **자기 팀에만** 넣고 빼기, 왕관 옮기기 — 넣는 것은 **아직 팀이
 *            없는 사람**만이다(`canAssignMember`)
 *   팀원     명단 보기만
 *
 * 팀을 만드는 것과 팀 안을 꾸리는 것을 가른 이유. 팀을 만드는 일은 회사
 * 구조를 정하는 일이라 운영자 몫이고, 누가 우리 팀에 있느냐는 팀장이 매일
 * 겪는 일이다. 팀장이 사람 하나 넣으려고 운영자를 불러야 하면 이 화면은
 * 안 쓰인다.
 *
 * 문지기를 액션마다 부른다. 화면에서 버튼을 감춘 것은 안내일 뿐이고, 폼은
 * 주소만 알면 밖에서도 부를 수 있다.
 */

/**
 * 한 번 해 보고, 실패하면 **던지지 않고** 사람 말로 돌려보낸다.
 *
 * 서버 액션이 던지면 운영에서는 「server-side exception · Digest …」만 보인다
 * (2026-09-22 「빼기」가 그랬다). 성공 주소는 `work` 가 돌려준다.
 *
 * `redirect()` 는 `try` 밖에서 부른다 — 안에서 부르면 그것이 던지는 신호를 `catch`
 * 가 잡아 버린다. 문지기(`requireAdmin` 등)가 로그인 화면으로 보내는 신호도 같아서,
 * 잡으면 `unstable_rethrow` 로 그대로 다시 던진다.
 */
async function attempt(back: string, work: () => Promise<string>): Promise<never> {
  let target: string;
  try {
    target = await work();
  } catch (cause) {
    unstable_rethrow(cause);
    target = failureUrl(back, teamFailure(cause));
  }
  revalidatePath("/team");
  redirect(target);
}

/**
 * 팀 기능이 꺼져 있으면 아무것도 바꾸지 않는다(2026-09-22 사용자 판단, `lib/access/routes.ts`).
 * 화면이 닫혀도 폼은 주소만 알면 밖에서 부를 수 있다.
 */
function requireTeamOpen() {
  if (isDisabledRoute("/team")) throw new Error("팀 기능은 지금 꺼 두었습니다.");
}

function readId(formData: FormData, field: string) {
  const value = String(formData.get(field) || "");
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("올바르지 않은 ID입니다.");
  return value;
}

/**
 * 이 팀을 꾸릴 수 있는 사람인가.
 *
 * 팀장은 **자기 팀만**이다. 팀 ID 를 폼에서 받으므로, 확인 없이 통과시키면
 * 남의 팀 ID 를 적어 보내는 것으로 아무 팀이나 꾸릴 수 있게 된다.
 */
async function requireTeamWrite(teamId: string): Promise<{ isAdmin: boolean }> {
  requireTeamOpen();
  const member = await requireActiveMember();
  const isAdmin = member.profile.role === "admin";
  const mine = isAdmin ? null : await myMembership(member.user.id);
  if (!canWriteTeam(isAdmin, mine, teamId)) {
    throw new Error("이 팀을 꾸릴 권한이 없습니다.");
  }
  // 운영자인지를 돌려준다. 배정은 넣는 자리뿐 아니라 **끌어올 사람**도
  // 봐야 하는데(`canAssignMember`), 그 판단이 운영자에게만 열려 있다.
  // 부르는 쪽에서 프로필을 다시 읽으면 두 곳이 서로 다른 답을 낼 수 있다.
  return { isAdmin };
}

/** 이 프로젝트가 어느 팀 것인가. 팀장 확인의 기준이 된다. */
async function teamOfProject(projectId: string): Promise<string> {
  const { data } = await createSupabaseAdminClient()
    .from("projects").select("team_id").eq("id", projectId).maybeSingle();
  if (!data) throw new Error("프로젝트를 찾을 수 없습니다.");
  return (data as { team_id: string }).team_id;
}

/** 이 회원이 지금 속한 팀. 팀장이 남을 건드리려 할 때 그 팀을 알아내는 데 쓴다. */
async function teamOf(userId: string) {
  const mine = await myMembership(userId);
  if (!mine) throw new Error("팀에 속한 회원이 아닙니다.");
  return mine.teamId;
}

/* ── 팀 자체 — 운영자만 ────────────────────────────────────────── */

export async function createTeamAction(formData: FormData) {
  await attempt("/team", async () => {
    requireTeamOpen();
    const admin = await requireAdmin();
    await createTeam(String(formData.get("name") || ""), admin.user.id);
    return "/team?notice=team_created";
  });
}

export async function renameTeamAction(formData: FormData) {
  await attempt("/team", async () => {
    requireTeamOpen();
    await requireAdmin();
    await renameTeam(readId(formData, "teamId"), String(formData.get("name") || ""));
    return "/team?notice=team_renamed";
  });
}

export async function archiveTeamAction(formData: FormData) {
  await attempt("/team", async () => {
    requireTeamOpen();
    await requireAdmin();
    await archiveTeam(readId(formData, "teamId"));
    return "/team?notice=team_archived";
  });
}

/* ── 팀 안 — 운영자와 그 팀의 팀장 ─────────────────────────────── */

/**
 * 여러 명을 한 번에 넣는다.
 *
 * 체크 상자가 같은 이름(`userId`)으로 여럿 보낸다. 한 명씩 넣게 하면 미배정
 * 열 명을 넣는 데 창을 열 번 열어야 한다 — 그러면 아무도 안 쓴다.
 *
 * **한 명이 실패하면 거기서 멈춘다.** 나머지를 밀어붙이면 어디까지 들어갔는지
 * 모르는 채로 화면이 성공이라고 말한다.
 */
export async function assignMemberAction(formData: FormData) {
  await attempt("/team", () => assignMembers(formData));
}

async function assignMembers(formData: FormData): Promise<string> {
  const teamId = readId(formData, "teamId");
  const { isAdmin } = await requireTeamWrite(teamId);

  const userIds = formData.getAll("userId").map((value) => {
    const id = String(value);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("올바르지 않은 회원 ID입니다.");
    return id;
  });
  if (!userIds.length) throw new Error("넣을 회원을 고르세요.");

  /**
   * **넣기 전에 전원을 먼저 본다.**
   *
   * 문지기는 팀 ID 만 봤다(`requireTeamWrite`). 회원 ID 는 폼이 실어 보내므로,
   * 여기서 안 보면 팀장이 남의 팀 사람 ID 를 적어 그 사람을 이쪽으로 끌어올
   * 수 있다 — 배정은 `user_id` 로 덮어쓴다.
   *
   * 넣으면서 하나씩 보면 안 된다. 세 명 중 둘째에서 막히면 첫째는 이미
   * 옮겨진 뒤라, 권한이 없는 편성이 절반만 남는다.
   *
   * **운영자는 아예 안 묻는다.** 어느 팀 사람이든 옮길 수 있어 답이 이미
   * 정해져 있는데, 고른 사람 수만큼 조회를 돌 이유가 없다.
   */
  if (!isAdmin) {
    for (const userId of userIds) {
      const current = await myMembership(userId);
      if (!canAssignMember(false, current?.teamId ?? null, teamId)) {
        throw new Error("이미 다른 팀에 속한 회원이 있습니다. 팀을 옮기는 것은 운영자에게 부탁해 주세요.");
      }
    }
  }

  const role = formData.get("role") === "leader" ? "leader" : "member";
  for (const userId of userIds) {
    await assignMember(userId, teamId, role);
  }
  return "/team?notice=assigned";
}

export async function setMemberRoleAction(formData: FormData) {
  await attempt("/team", async () => {
    const userId = readId(formData, "userId");
    await requireTeamWrite(await teamOf(userId));
    const role = formData.get("role") === "leader" ? "leader" : "member";
    await setMemberRole(userId, role);
    return `/team?notice=${role === "leader" ? "promoted" : "demoted"}`;
  });
}

export async function removeMemberAction(formData: FormData) {
  await attempt("/team", async () => {
    const userId = readId(formData, "userId");
    await requireTeamWrite(await teamOf(userId));
    // 혼자인 팀이면 빼는 대신 팀을 접는다(`leaveOutcome`). 무엇을 했는지 그대로 말한다.
    return (await removeMember(userId)) === "archived" ? "/team?notice=team_archived" : "/team?notice=removed";
  });
}

/* ── 프로젝트 — 운영자와 그 팀의 팀장 ──────────────────────────── */

/**
 * 프로젝트를 만질 수 있는 사람.
 *
 * 팀원을 넣고 빼는 것과 같은 기준이다. 팀 안을 꾸리는 일이라 팀장 몫이고,
 * 팀원이 폴더를 마음대로 접으면 남의 분류가 사라진다.
 */
async function requireProjectWrite(projectId: string): Promise<string> {
  const teamId = await teamOfProject(projectId);
  await requireTeamWrite(teamId);
  return teamId;
}

export async function createProjectAction(formData: FormData) {
  await attempt("/team?tab=projects", async () => {
    const member = await requireActiveMember();
    const teamId = readId(formData, "teamId");
    await requireTeamWrite(teamId);
    await createProject(teamId, String(formData.get("name") || ""), member.user.id);
    return "/team?tab=projects&notice=project_created";
  });
}

export async function renameProjectAction(formData: FormData) {
  await attempt("/team?tab=projects", async () => {
    const projectId = readId(formData, "projectId");
    await requireProjectWrite(projectId);
    await renameProject(projectId, String(formData.get("name") || ""));
    return "/team?tab=projects&notice=project_renamed";
  });
}

export async function archiveProjectAction(formData: FormData) {
  await attempt("/team?tab=projects", async () => {
    const projectId = readId(formData, "projectId");
    await requireProjectWrite(projectId);
    await archiveProject(projectId);
    // 접은 것을 고른 채로 두면 모든 화면이 텅 빈다. 「전체」로 되돌린다.
    await setCurrentProject(null);
    return "/team?tab=projects&notice=project_archived";
  });
}

export async function moveProjectAction(formData: FormData) {
  await attempt("/team?tab=projects", async () => {
    const projectId = readId(formData, "projectId");
    const teamId = await requireProjectWrite(projectId);
    await moveProject(teamId, projectId, formData.get("direction") === "up" ? "up" : "down");
    return "/team?tab=projects";
  });
}

/** 작업물 하나를 프로젝트에 넣거나 뺀다. */
export async function moveWorkAction(formData: FormData) {
  await attempt("/team?tab=works", async () => {
    const teamId = readId(formData, "teamId");
    await requireTeamWrite(teamId);

    const table = String(formData.get("table") || "") as Parameters<typeof moveWorkToProject>[1];
    const workId = readId(formData, "workId");
    const raw = String(formData.get("projectId") || "");
    const projectId = raw ? readId(formData, "projectId") : null;

    await moveWorkToProject(teamId, table, workId, projectId);
    return "/team?tab=works&notice=work_moved";
  });
}

/**
 * 사이드바에서 프로젝트를 고른다.
 *
 * 고를 수 있는 것인지 확인하고 남긴다. 확인 없이 남기면 남의 팀 프로젝트
 * id 를 적어 보내는 것으로 화면이 텅 비는데, 왜 비었는지 알 길이 없다.
 */
export async function selectProjectAction(formData: FormData) {
  const member = await requireActiveMember();
  const raw = String(formData.get("projectId") || "");

  if (!raw) {
    await setCurrentProject(null);
  } else {
    const projects = await listProjects(await teamIdOf(member.user.id));
    if (!projects.some((project) => project.id === raw)) {
      throw new Error("고를 수 없는 프로젝트입니다.");
    }
    await setCurrentProject(raw);
  }

  // 화면 전부가 이 값으로 걸러진다. 하나만 되살리면 다른 화면이 옛 결과를
  // 그대로 보여 준다.
  revalidatePath("/", "layout");
  redirect(String(formData.get("back") || "/library"));
}

/* ── 크레딧 — 운영자와 그 팀의 팀장 ────────────────────────────── */

function readQuota(
  formData: FormData,
  field: string,
  check: (raw: string) => string | null,
): number {
  const raw = String(formData.get(field) || "");
  const problem = check(raw);
  if (problem) throw new Error(problem);
  return Number(raw.trim());
}

/**
 * 팀 한도를 정한다.
 *
 * **0 으로 두면 팀 한도가 아무것도 안 막는다** — 개인 상한만 본다. 그것이
 * 지금까지의 동작이라, 값을 정하기 전까지는 아무도 갑자기 막히지 않는다.
 */
export async function setTeamQuotaAction(formData: FormData) {
  // 실패해도 보던 팀으로 돌아간다. 팀이 여럿인 운영자가 어느 팀이었는지 잃지 않게.
  const seen = String(formData.get("teamId") || "");
  const back = /^[0-9a-f-]{36}$/i.test(seen) ? `/team?tab=credit&team=${seen}` : "/team?tab=credit";
  await attempt(back, async () => {
    const teamId = readId(formData, "teamId");
    await requireTeamWrite(teamId);
    await setTeamQuota(teamId, readQuota(formData, "quota", teamQuotaError));
    return `/team?tab=credit&team=${teamId}&notice=team_quota_set`;
  });
}

/**
 * 팀원 한 사람의 개인 상한.
 *
 * 팀장이 팀원의 상한을 만질 수 있다. 팀 잔량을 한 사람이 다 쓰는 것을 막는
 * 유일한 길이라, 이게 없으면 팀 한도를 정해도 나눌 방법이 없다.
 */
export async function setPersonalQuotaAction(formData: FormData) {
  await attempt("/team?tab=credit", async () => {
    const userId = readId(formData, "userId");
    const teamId = await teamOf(userId);
    await requireTeamWrite(teamId);
    // 크레딧 장부에서는 개인 상한이 아무것도 안 막는다. 저장되는 척하면 거짓말이다.
    if (isCreditLedgerEnabled()) throw new Error("개인 상한은 쓰지 않습니다. 크레딧은 관리자가 회원 관리에서 지급합니다.");
    await setPersonalQuota(userId, readQuota(formData, "quota", personalQuotaError));
    return `/team?tab=credit&team=${teamId}&notice=personal_quota_set`;
  });
}
