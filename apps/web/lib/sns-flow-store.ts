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
import { createSupabaseAdminClient } from "./supabase/admin";
import { projectWriteDeniedResponse } from "./generation/ownership";
import { snsCardPathsToRemove } from "./sns/thumbnail";

/**
 * 읽히기는 하는데 쓸 수는 없는 작업이다.
 *
 * 팀 읽기 정책은 select 전용이라, 팀원의 작업은 목록과 상세에 뜨지만 저장과
 * 삭제는 RLS 가 막는다. 그 사실을 부르는 쪽이 403 으로 옮길 수 있게 갈래를
 * 나눠 둔다 — 보통 오류로 섞으면 「알 수 없는 오류」가 뜬다.
 */
export class SnsProjectNotWritable extends Error {
  constructor() {
    super("내가 만든 카드뉴스만 고치거나 지울 수 있습니다.");
    this.name = "SnsProjectNotWritable";
  }
}

/**
 * 쓰기가 막힌 것이면 403 응답을, 아니면 `undefined` 를 준다.
 *
 * 라우트의 `catch` 마다 같은 조건을 적지 않으려고 여기 둔다. 500 으로 흘리면
 * 사용자에게 「알 수 없는 오류」가 뜨는데, 실제로는 남의 작업이라 못 고치는
 * 것이라 답이 분명해야 한다.
 */
export function snsWriteDenied(error: unknown): Response | undefined {
  if (!(error instanceof SnsProjectNotWritable)) return projectWriteDeniedResponse(error);
  return Response.json({ ok: false, message: error.message }, { status: 403 });
}

export interface SnsFlowStore {
  get(projectId: string): Promise<SnsProjectRecord | undefined>;
  save(projectId: string, flow: SnsFlowState, status: SnsProjectRecord["status"], expectedUpdatedAt?: string): Promise<SnsProjectRecord>;
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
  return [...new Set([...snsCardPathsToRemove(project.data.flow?.cards ?? []), ...snsCardPathsToRemove(project.data.executionFlow?.cards ?? [])])];
}

/** 시험이 「삭제가 이 규칙을 부른다」를 확인할 수 있게 연다. */
export const assetPathsOfForTest = assetPathsOf;

export async function snsFlowStoreForUser(userId: string): Promise<SnsFlowStore> {
  if (isLocalStoreEnabled()) {
    const database = getLocalDatabase();
    return {
      get: (projectId) => getLocalSnsProject(database, userId, projectId),
      save: (projectId, flow, status, expectedUpdatedAt) => saveLocalSnsFlow(database, userId, projectId, flow, status, expectedUpdatedAt),
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
    async save(projectId, flow, status, expectedUpdatedAt) {
      const project = await getProject(projectId);
      if (!project) throw new Error("SNS 프로젝트를 찾을 수 없습니다.");
      if (project.userId !== userId) throw new SnsProjectNotWritable();
      /**
       * **정말 써졌는지 세어 본다.**
       *
       * `getProject` 는 팀 읽기 정책 덕에 팀원의 작업도 읽어 온다. 그런데 그
       * 정책은 select 전용이라 update 는 RLS 가 0줄로 막는다 — 그리고
       * supabase-js 는 그것을 오류로 주지 않는다.
       *
       * 그래서 예전에는 **DB 에 없는 값을 조립해서** 성공으로 돌려줬다.
       * 팀원의 카드뉴스에서 생성을 돌리면 크레딧이 예약·차감되고 fal 에
       * 실제 요청이 나간 뒤, 결과만 어디에도 안 남았다.
       */
      const result = await createSupabaseAdminClient().rpc(expectedUpdatedAt ? "save_sns_draft_checked" : "save_sns_draft_v2", {
        p_actor: userId, p_id: projectId, p_flow: flow, p_status: status,
        ...(expectedUpdatedAt ? { p_expected_updated_at: expectedUpdatedAt } : {}),
      });
      if (result.error) throw new Error(result.error.message);
      const updated = await getProject(projectId);
      if (!updated) throw new SnsProjectNotWritable();
      return updated;
    },
    async remove(projectId) {
      const project = await getProject(projectId);
      if (!project) return false;
      // 카드 행은 FK cascade 가 지운다. 비용 기록은 project_id 만 비워지고 남는다.
      // 여기도 소유자 조건을 걸고 지운 줄을 세어 본다 — 안 그러면 「지웠습니다」
      // 뒤에 새로고침하면 그대로 있다.
      const removed = await client.from("sns_projects")
        .delete().eq("id", projectId).eq("user_id", userId)
        .select("id");
      if (removed.error) throw new Error(removed.error.message);
      if (!(removed.data ?? []).length) throw new SnsProjectNotWritable();
      const paths = assetPathsOf(project);
      // 파일이 남아도 화면에는 안 보인다. 실패해도 삭제 자체는 끝난 것이다.
      if (paths.length) await client.storage.from("library").remove(paths);
      return true;
    },
  };
}
