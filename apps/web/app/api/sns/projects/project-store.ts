import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SnsProjectCreateRecord, SnsProjectRecord, SnsProjectRepository } from "./project-service";

type ProjectRow = {
  id: string;
  user_id: string;
  candidate_id: string | null;
  title: string;
  status: SnsProjectRecord["status"];
  ratio: SnsProjectRecord["ratio"];
  language: SnsProjectRecord["language"];
  model_id: SnsProjectRecord["modelId"];
  card_count_mode: SnsProjectRecord["cardCountMode"];
  card_count: number | null;
  tone_note: string | null;
  data: SnsProjectCreateRecord["data"] & { slotPlan: SnsProjectCreateRecord["slotPlan"] };
  created_at: string;
  updated_at: string;
};

const SELECT = "id,user_id,candidate_id,title,status,ratio,language,model_id,card_count_mode,card_count,tone_note,data,created_at,updated_at";

function checked<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

function record(row: ProjectRow): SnsProjectRecord {
  return {
    id: row.id,
    userId: row.user_id,
    candidateId: row.candidate_id ?? undefined,
    title: row.title,
    status: row.status,
    ratio: row.ratio,
    language: row.language,
    modelId: row.model_id,
    cardCountMode: row.card_count_mode,
    cardCount: row.card_count ?? undefined,
    toneNote: row.tone_note ?? undefined,
    data: {
      source: row.data.source,
      attachments: row.data.attachments,
      flow: row.data.flow,
      look: row.data.look,
      userInstruction: row.data.userInstruction,
    // **화이트리스트는 빠뜨린다.** 이 줄이 없으면 목록 경로로 읽은 작업에서
    // 사용자가 적은 글이 말없이 사라진다(2026-09-08 리뷰).
    attachmentIntents: row.data.attachmentIntents,
    },
    slotPlan: row.data.slotPlan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseSnsProjectRepository(client: SupabaseClient, writer: SupabaseClient = client): SnsProjectRepository {
  return {
    async create(row) {
      if (row.candidateId) {
        const { data: candidate, error: denied } = await client.from("ingest_candidates").select("id")
          .eq("id", row.candidateId).eq("user_id", row.userId).maybeSingle();
        if (denied || !candidate) throw new Error("사용할 수 없는 수집 자료입니다.");
      }
      const { data, error } = await writer.from("sns_projects").insert({
        user_id: row.userId,
        candidate_id: row.candidateId ?? null,
        title: row.title,
        ratio: row.ratio,
        language: row.language,
        model_id: row.modelId,
        card_count_mode: row.cardCountMode,
        card_count: row.cardCount ?? null,
        tone_note: row.toneNote ?? null,
        data: { ...row.data, slotPlan: row.slotPlan },
      }).select(SELECT).single();
      return record(checked(data as ProjectRow, error));
    },
    /**
     * 목록. **누가 보는지는 RLS 가 정한다** — 여기서 `user_id` 를 안 건다.
     *
     * `projectId` 를 받으면 그 갈래만 낸다. 안 받으면 「전체」다 — 안 거는
     * 쪽이 기본이라, 빠뜨렸을 때 화면이 비지 않는다.
     */
    async list(projectId?: string | null) {
      let query = client.from("sns_projects").select(SELECT).order("updated_at", { ascending: false });
      if (projectId) query = query.eq("project_id", projectId);
      const { data, error } = await query;
      return checked((data ?? []) as ProjectRow[], error).map(record);
    },
  };
}
