import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import {
  PROJECT_SCOPED_TABLES,
  normalizeProjectName,
  projectNameError,
  reorder,
  type ProjectItem,
  type ProjectRow,
} from "./projects";

/**
 * 프로젝트 — 저장소를 만지는 쪽.
 *
 * `projects` 는 회원에게 권한을 회수해 두었다. 전부 서버 권한으로 읽고 쓰고,
 * 누가 부를 수 있는지는 부르는 쪽(서버 액션)이 정한다.
 */

const COLUMNS = "id,team_id,name,position,created_at";

interface ProjectDbRow {
  id: string;
  team_id: string;
  name: string;
  position: number;
  created_at: string;
}

function toRow(row: ProjectDbRow): ProjectRow {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

/* ── 읽기 ─────────────────────────────────────────────────────── */

/**
 * 이 팀의 살아 있는 프로젝트.
 *
 * 팀이 없으면 빈 목록이다. 개인에게는 프로젝트가 없다 — 혼자 쓰는 사람에게
 * 폴더를 만들게 하면, 나눌 이유가 없는 것을 나누는 일이 된다.
 */
export async function listProjects(teamId: string | null): Promise<ProjectRow[]> {
  if (!teamId) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("projects")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectDbRow[]).map(toRow);
}

/**
 * 사이드바에 걸 목록. 몇 건이 들었는지 함께 준다.
 *
 * **비어 있음을 감추지 않는다.** 0 건인 프로젝트가 그냥 이름만 걸려 있으면,
 * 눌러서 텅 빈 화면을 본 뒤에야 비었다는 걸 안다.
 */
export async function listProjectsWithCounts(teamId: string | null): Promise<ProjectItem[]> {
  const projects = await listProjects(teamId);
  if (!projects.length) return [];

  const admin = createSupabaseAdminClient();
  const ids = projects.map((project) => project.id);
  const counts = new Map<string, number>();

  await Promise.all(
    PROJECT_SCOPED_TABLES.map(async (table) => {
      const { data } = await admin.from(table).select("project_id").in("project_id", ids);
      for (const row of (data ?? []) as Array<{ project_id: string | null }>) {
        if (row.project_id) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
      }
    }),
  );

  return projects.map((project) => ({ ...project, workCount: counts.get(project.id) ?? 0 }));
}

/* ── 쓰기 ─────────────────────────────────────────────────────── */

export async function createProject(
  teamId: string,
  name: string,
  createdBy: string,
): Promise<string> {
  const problem = projectNameError(name);
  if (problem) throw new Error(problem);

  // 새 것은 맨 아래에. 방금 만든 것이 맨 위로 튀어 올라 기존 차례를 흩뜨리면,
  // 손으로 맞춰 둔 순서를 다시 맞춰야 한다.
  const existing = await listProjects(teamId);

  const { data, error } = await createSupabaseAdminClient()
    .from("projects")
    .insert({
      team_id: teamId,
      name: normalizeProjectName(name),
      position: existing.length,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) {
    // 같은 팀 안에서 이름이 겹치면 어느 쪽에 넣었는지 알 수 없다. DB 가 막는
    // 것을 사람 말로 옮긴다 — 「duplicate key value violates unique constraint」는
    // 무엇을 고쳐야 하는지 안 알려 준다.
    if (error.message.includes("duplicate")) {
      throw new Error("같은 이름의 프로젝트가 이미 있습니다.");
    }
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const problem = projectNameError(name);
  if (problem) throw new Error(problem);

  const { error } = await createSupabaseAdminClient()
    .from("projects")
    .update({ name: normalizeProjectName(name) })
    .eq("id", projectId);
  if (error) {
    if (error.message.includes("duplicate")) {
      throw new Error("같은 이름의 프로젝트가 이미 있습니다.");
    }
    throw new Error(error.message);
  }
}

/**
 * 접는다. **지우지 않는다.**
 *
 * 프로젝트를 지우면 거기 묶인 작업물의 분류가 사라지는데, 그건 되돌릴 수
 * 없다. 행은 남기고 목록에서만 뺀다.
 *
 * 작업물은 **그대로 둔다.** `project_id` 를 안 비운다 — 실수로 접었을 때
 * 되살리면 분류가 그대로 돌아와야 한다. 접힌 프로젝트에 든 것은 목록에서
 * 「전체」로 보이므로 사라지지 않는다.
 */
export async function archiveProject(projectId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("projects")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
}

/** 한 칸 위나 아래로. 옮긴 뒤 전체에 번호를 다시 매긴다. */
export async function moveProject(
  teamId: string,
  projectId: string,
  direction: "up" | "down",
): Promise<void> {
  const projects = await listProjects(teamId);
  const plan = reorder(projects, projectId, direction);
  if (!plan.length) return;

  const admin = createSupabaseAdminClient();
  for (const row of plan) {
    const { error } = await admin
      .from("projects")
      .update({ position: row.position })
      .eq("id", row.id)
      .eq("team_id", teamId);
    if (error) throw new Error(error.message);
  }
}

/* ── 작업물을 프로젝트에 넣기 ────────────────────────────────── */

/** 팀 전체 작업물 한 줄. 세 도구가 한 목록에 섞여 나온다. */
export interface TeamWork {
  id: string;
  table: (typeof PROJECT_SCOPED_TABLES)[number];
  title: string;
  ownerId: string;
  ownerEmail: string;
  projectId: string | null;
  updatedAt: string;
}

const WORK_LABEL: Record<(typeof PROJECT_SCOPED_TABLES)[number], string> = {
  library_items: "라이브러리",
  sns_projects: "카드뉴스",
  poster_projects: "이미지",
};

export function workLabel(table: TeamWork["table"]): string {
  return WORK_LABEL[table];
}

/**
 * 이 팀의 작업물 전부.
 *
 * 세 표를 한 목록으로 합친다. 도구별로 화면을 나누면 「어느 도구로 만들었더라」
 * 를 먼저 떠올려야 프로젝트에 넣을 수 있다.
 */
export async function listTeamWorks(teamId: string | null, limit = 200): Promise<TeamWork[]> {
  if (!teamId) return [];
  const admin = createSupabaseAdminClient();

  const batches = await Promise.all(
    PROJECT_SCOPED_TABLES.map(async (table) => {
      // 라이브러리에는 `updated_at` 이 없다. 표마다 있는 시각을 쓴다.
      const timeColumn = table === "library_items" ? "created_at" : "updated_at";
      const { data } = await admin
        .from(table)
        .select(`id,user_id,title,project_id,${timeColumn}`)
        .eq("team_id", teamId)
        .order(timeColumn, { ascending: false })
        .limit(limit);

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        table,
        title: String(row.title ?? "(제목 없음)"),
        ownerId: String(row.user_id),
        ownerEmail: "",
        projectId: (row.project_id as string | null) ?? null,
        updatedAt: String(row[timeColumn] ?? ""),
      }));
    }),
  );

  const works = batches.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (!works.length) return works;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email")
    .in("id", [...new Set(works.map((work) => work.ownerId))]);
  const emails = new Map(
    ((profiles ?? []) as Array<{ id: string; email: string }>).map((row) => [row.id, row.email]),
  );

  return works.map((work) => ({ ...work, ownerEmail: emails.get(work.ownerId) ?? "(알 수 없음)" }));
}

/**
 * 작업물 하나를 프로젝트에 넣거나 뺀다.
 *
 * **같은 팀 것만 옮긴다.** 표 이름과 id 를 폼에서 받으므로, 팀을 안 보면 남의
 * 작업물 id 를 적어 보내는 것만으로 남의 것을 우리 프로젝트로 끌어올 수 있다.
 */
export async function moveWorkToProject(
  teamId: string,
  table: TeamWork["table"],
  workId: string,
  projectId: string | null,
): Promise<void> {
  if (!PROJECT_SCOPED_TABLES.includes(table)) throw new Error("옮길 수 없는 종류입니다.");

  const admin = createSupabaseAdminClient();

  // 넣으려는 프로젝트도 이 팀 것이어야 한다. 남의 팀 프로젝트 id 를 적어
  // 보내면 우리 작업물이 남의 분류로 넘어간다.
  if (projectId) {
    const { data } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!data) throw new Error("이 팀의 프로젝트가 아닙니다.");
  }

  const { error } = await admin
    .from(table)
    .update({ project_id: projectId })
    .eq("id", workId)
    .eq("team_id", teamId);
  if (error) throw new Error(error.message);
}
