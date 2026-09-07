"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveMember, requireAdmin } from "../../lib/membership/server";
import { canWriteTeam } from "../../lib/teams/core";
import {
  archiveTeam,
  assignMember,
  createTeam,
  myMembership,
  removeMember,
  renameTeam,
  setMemberRole,
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
import { setCurrentProject } from "../../lib/teams/current-project";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

/**
 * 팀 편성 — 누가 무엇을 할 수 있나.
 *
 *   운영자   팀 만들기·이름 바꾸기·접기, **모든 팀**의 배정
 *   팀장     **자기 팀에만** 넣고 빼기, 왕관 옮기기
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
async function requireTeamWrite(teamId: string) {
  const member = await requireActiveMember();
  const isAdmin = member.profile.role === "admin";
  const mine = isAdmin ? null : await myMembership(member.user.id);
  if (!canWriteTeam(isAdmin, mine, teamId)) {
    throw new Error("이 팀을 꾸릴 권한이 없습니다.");
  }
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
  const admin = await requireAdmin();
  await createTeam(String(formData.get("name") || ""), admin.user.id);
  revalidatePath("/team");
  redirect("/team?notice=team_created");
}

export async function renameTeamAction(formData: FormData) {
  await requireAdmin();
  await renameTeam(readId(formData, "teamId"), String(formData.get("name") || ""));
  revalidatePath("/team");
  redirect("/team?notice=team_renamed");
}

export async function archiveTeamAction(formData: FormData) {
  await requireAdmin();
  await archiveTeam(readId(formData, "teamId"));
  revalidatePath("/team");
  redirect("/team?notice=team_archived");
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
  const teamId = readId(formData, "teamId");
  await requireTeamWrite(teamId);

  const userIds = formData.getAll("userId").map((value) => {
    const id = String(value);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("올바르지 않은 회원 ID입니다.");
    return id;
  });
  if (!userIds.length) throw new Error("넣을 회원을 고르세요.");

  const role = formData.get("role") === "leader" ? "leader" : "member";
  for (const userId of userIds) {
    await assignMember(userId, teamId, role);
  }

  revalidatePath("/team");
  redirect("/team?notice=assigned");
}

export async function setMemberRoleAction(formData: FormData) {
  const userId = readId(formData, "userId");
  await requireTeamWrite(await teamOf(userId));
  const role = formData.get("role") === "leader" ? "leader" : "member";
  await setMemberRole(userId, role);
  revalidatePath("/team");
  redirect(`/team?notice=${role === "leader" ? "promoted" : "demoted"}`);
}

export async function removeMemberAction(formData: FormData) {
  const userId = readId(formData, "userId");
  await requireTeamWrite(await teamOf(userId));
  await removeMember(userId);
  revalidatePath("/team");
  redirect("/team?notice=removed");
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
  const member = await requireActiveMember();
  const teamId = readId(formData, "teamId");
  await requireTeamWrite(teamId);
  await createProject(teamId, String(formData.get("name") || ""), member.user.id);
  revalidatePath("/team");
  redirect("/team?tab=projects&notice=project_created");
}

export async function renameProjectAction(formData: FormData) {
  const projectId = readId(formData, "projectId");
  await requireProjectWrite(projectId);
  await renameProject(projectId, String(formData.get("name") || ""));
  revalidatePath("/team");
  redirect("/team?tab=projects&notice=project_renamed");
}

export async function archiveProjectAction(formData: FormData) {
  const projectId = readId(formData, "projectId");
  await requireProjectWrite(projectId);
  await archiveProject(projectId);
  // 접은 것을 고른 채로 두면 모든 화면이 텅 빈다. 「전체」로 되돌린다.
  await setCurrentProject(null);
  revalidatePath("/team");
  redirect("/team?tab=projects&notice=project_archived");
}

export async function moveProjectAction(formData: FormData) {
  const projectId = readId(formData, "projectId");
  const teamId = await requireProjectWrite(projectId);
  await moveProject(teamId, projectId, formData.get("direction") === "up" ? "up" : "down");
  revalidatePath("/team");
  redirect("/team?tab=projects");
}

/** 작업물 하나를 프로젝트에 넣거나 뺀다. */
export async function moveWorkAction(formData: FormData) {
  const teamId = readId(formData, "teamId");
  await requireTeamWrite(teamId);

  const table = String(formData.get("table") || "") as Parameters<typeof moveWorkToProject>[1];
  const workId = readId(formData, "workId");
  const raw = String(formData.get("projectId") || "");
  const projectId = raw ? readId(formData, "projectId") : null;

  await moveWorkToProject(teamId, table, workId, projectId);
  revalidatePath("/team");
  redirect("/team?tab=works&notice=work_moved");
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
