import "server-only";

import type { SnsFlowState } from "../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../app/api/sns/projects/project-service";
import {
  getLocalDatabase,
  getLocalSnsProject,
  isLocalStoreEnabled,
  localStoreRoot,
  removeLocalReferenceFiles,
  removeLocalSnsProject,
  saveLocalSnsFlow,
} from "./local-store";
import { createSupabaseServerClient } from "./supabase/server";
import { snsCardPathsToRemove } from "./sns/thumbnail";

export interface SnsFlowStore {
  get(projectId: string): Promise<SnsProjectRecord | undefined>;
  save(projectId: string, flow: SnsFlowState, status: SnsProjectRecord["status"]): Promise<SnsProjectRecord>;
  /**
   * 작업과 그 카드, 만들어 둔 그림 파일까지 지운다.
   *
   * **비용 기록은 남긴다.** 작업을 지웠다고 돈이 안 나간 것이 되지 않는다.
   * 그걸 지울 수 있으면 장부를 믿을 수 없다.
   *
   * 없는 것을 지우라고 하면 false 를 준다 — 두 번 눌러도 오류가 아니다.
   */
  remove(projectId: string): Promise<boolean>;
}

/**
 * 이 작업이 만들어 둔 그림들의 저장 경로. **미리보기도 함께 모은다.**
 *
 * 행이 사라지면 미리보기의 자리를 아는 근거가 없어진다 — 라이브러리·갤러리·
 * 포스터에서 세 번 반복해 잡힌 실수라 규칙을 한 곳에 두고 쓴다.
 */
function assetPathsOf(project: SnsProjectRecord): string[] {
  return snsCardPathsToRemove(project.data.flow?.cards ?? []);
}

/** 시험이 「삭제가 이 규칙을 부른다」를 확인할 수 있게 연다. */
export const assetPathsOfForTest = assetPathsOf;

export async function snsFlowStoreForUser(userId: string): Promise<SnsFlowStore> {
  if (isLocalStoreEnabled()) {
    const database = getLocalDatabase();
    return {
      get: (projectId) => getLocalSnsProject(database, userId, projectId),
      save: (projectId, flow, status) => saveLocalSnsFlow(database, userId, projectId, flow, status),
      async remove(projectId) {
        const project = await getLocalSnsProject(database, userId, projectId);
        if (!project) return false;
        // 행을 먼저 지우고 파일을 나중에 지운다. 파일이 먼저 사라지면 목록에는
        // 남아 있는데 미리보기만 깨진 상태가 된다.
        const removed = await removeLocalSnsProject(database, userId, projectId);
        if (removed) await removeLocalReferenceFiles(localStoreRoot(), assetPathsOf(project));
        return removed;
      },
    };
  }

  const client = await createSupabaseServerClient();
  const getProject = async (projectId: string): Promise<SnsProjectRecord | undefined> => {
    const { data, error } = await client.from("sns_projects")
      .select("id,user_id,candidate_id,title,status,ratio,language,model_id,card_count_mode,card_count,tone_note,data,created_at,updated_at")
      .eq("id", projectId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    return {
      id: data.id, userId: data.user_id, candidateId: data.candidate_id ?? undefined,
      title: data.title, status: data.status, ratio: data.ratio, language: data.language,
      modelId: data.model_id, cardCountMode: data.card_count_mode,
      cardCount: data.card_count ?? undefined, toneNote: data.tone_note ?? undefined,
      data: data.data, slotPlan: data.data.slotPlan,
      createdAt: data.created_at, updatedAt: data.updated_at,
    } as SnsProjectRecord;
  };
  return {
    get: getProject,
    async save(projectId, flow, status) {
      const project = await getProject(projectId);
      if (!project) throw new Error("SNS 프로젝트를 찾을 수 없습니다.");
      const data = { ...project.data, flow };
      const result = await client.from("sns_projects").update({ data, status, updated_at: new Date().toISOString() }).eq("id", projectId);
      if (result.error) throw new Error(result.error.message);
      return { ...project, data, status, updatedAt: new Date().toISOString() };
    },
    async remove(projectId) {
      const project = await getProject(projectId);
      if (!project) return false;
      // 카드 행은 FK cascade 가 지운다. 비용 기록은 project_id 만 비워지고 남는다.
      const removed = await client.from("sns_projects").delete().eq("id", projectId);
      if (removed.error) throw new Error(removed.error.message);
      const paths = assetPathsOf(project);
      // 파일이 남아도 화면에는 안 보인다. 실패해도 삭제 자체는 끝난 것이다.
      if (paths.length) await client.storage.from("library").remove(paths);
      return true;
    },
  };
}
