import type {
  GenerationRequestComplete,
  GenerationRequestCreate,
  GenerationRequestStore,
} from "../../../packages/sns-core/src/generate";

export interface AdminGenerationRequestCreateRow {
  user_id: string;
  project_id: string;
  card_index: number;
  model_id: string;
  mode: GenerationRequestCreate["mode"];
  size: GenerationRequestCreate["size"];
  requested_images: 1;
  unit_cost_usd: number;
}

export interface AdminGenerationRequestCompleteRow {
  fal_request_id: string | null;
  returned_images: number;
  cost_usd: number;
}

export interface GenerationRequestAdminWriter {
  create(row: AdminGenerationRequestCreateRow): Promise<{ id: string }>;
  complete(id: string, row: AdminGenerationRequestCompleteRow): Promise<void>;
}

/** admin writer를 로그인 사용자에게 먼저 묶어 이후 입력에서 user_id를 받지 않는다. */
export function bindGenerationRequestStore(
  authenticatedUserId: string,
  writer: GenerationRequestAdminWriter,
): GenerationRequestStore {
  return {
    async create(row) {
      const saved = await writer.create({
        user_id: authenticatedUserId,
        project_id: row.projectId,
        card_index: row.cardIndex,
        model_id: row.modelId,
        mode: row.mode,
        size: row.size,
        requested_images: 1,
        unit_cost_usd: row.unitCostUsd,
      });
      return { id: saved.id, ...row };
    },
    complete(id: string, patch: GenerationRequestComplete) {
      return writer.complete(id, {
        fal_request_id: patch.falRequestId ?? null,
        returned_images: patch.returnedImages,
        cost_usd: patch.costUsd,
      });
    },
  };
}
