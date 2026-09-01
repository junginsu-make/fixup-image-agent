import "server-only";

import { authenticateApiMember } from "./membership/api";
import { createSupabaseAdminClient } from "./supabase/admin";
import {
  createLocalSnsGenerationRequestStore,
  createLocalSubmittedGenerationRequestStore,
  getLocalDatabase,
  isLocalStoreEnabled,
} from "./local-store";
import type { SubmittedGenerationRequestStore } from "./sns/queued-flow";
import {
  bindGenerationRequestStore,
  type AdminGenerationRequestCompleteRow,
  type AdminGenerationRequestCreateRow,
  type GenerationRequestAdminWriter,
} from "./sns-generation-store-core";

function checked<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

/**
 * 비용 행 저장소를 인증 세션에 묶는다.
 * 요청 본문이나 generateCard 입력에서는 user_id를 받지 않는다.
 */
export async function authenticateSnsGenerationRequestStore() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth;

  return {
    ok: true as const,
    member: auth.member,
    requestStore: snsGenerationRequestStoreForUser(auth.member.userId),
  };
}

export function snsGenerationRequestStoreForUser(userId: string) {
  if (isLocalStoreEnabled()) {
    return createLocalSnsGenerationRequestStore(getLocalDatabase(), userId);
  }
  const admin = createSupabaseAdminClient();
  const writer: GenerationRequestAdminWriter = {
    async create(row: AdminGenerationRequestCreateRow) {
      const { data, error } = await admin.from("sns_generation_requests").insert(row).select("id").single();
      return checked(data as { id: string }, error);
    },
    async complete(id: string, row: AdminGenerationRequestCompleteRow) {
      const { error } = await admin.from("sns_generation_requests").update(row).eq("id", id);
      checked(undefined, error);
    },
  };

  return bindGenerationRequestStore(userId, writer);
}

export function snsSubmittedGenerationRequestStoreForUser(userId: string): SubmittedGenerationRequestStore {
  if (isLocalStoreEnabled()) {
    return createLocalSubmittedGenerationRequestStore(getLocalDatabase(), userId);
  }
  const admin = createSupabaseAdminClient();
  return {
    async createSubmitted(row) {
      const { data, error } = await admin.from("sns_generation_requests").insert({
        user_id: userId,
        project_id: row.projectId,
        card_index: row.cardIndex,
        fal_request_id: row.falRequestId,
        model_id: row.modelId,
        mode: row.mode,
        size: row.size,
        requested_images: 1,
        returned_images: 0,
        unit_cost_usd: row.unitCostUsd,
        cost_usd: null,
      }).select("id").single();
      return checked(data as { id: string }, error);
    },
    async complete(id, patch) {
      const { error } = await admin.from("sns_generation_requests").update({
        fal_request_id: patch.falRequestId ?? null,
        returned_images: patch.returnedImages,
        cost_usd: patch.costUsd,
      }).eq("id", id).eq("user_id", userId);
      checked(undefined, error);
    },
  };
}
