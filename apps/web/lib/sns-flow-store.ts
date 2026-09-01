import "server-only";

import type { SnsFlowState } from "../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../app/api/sns/projects/project-service";
import {
  getLocalDatabase,
  getLocalSnsProject,
  isLocalStoreEnabled,
  saveLocalSnsFlow,
} from "./local-store";
import { createSupabaseServerClient } from "./supabase/server";

export interface SnsFlowStore {
  get(projectId: string): Promise<SnsProjectRecord | undefined>;
  save(projectId: string, flow: SnsFlowState, status: SnsProjectRecord["status"]): Promise<SnsProjectRecord>;
}

export async function snsFlowStoreForUser(userId: string): Promise<SnsFlowStore> {
  if (isLocalStoreEnabled()) {
    const database = getLocalDatabase();
    return {
      get: (projectId) => getLocalSnsProject(database, userId, projectId),
      save: (projectId, flow, status) => saveLocalSnsFlow(database, userId, projectId, flow, status),
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
  };
}
