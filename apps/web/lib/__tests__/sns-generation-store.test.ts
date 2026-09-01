import { describe, expect, it } from "vitest";
import { bindGenerationRequestStore, type GenerationRequestAdminWriter } from "../sns-generation-store-core";

describe("비용 요청 admin 저장소", () => {
  it("본문에 위조 user_id 가 섞여도 로그인 사용자로만 저장한다", async () => {
    const inserted: unknown[] = [];
    const writer: GenerationRequestAdminWriter = {
      create: async (row) => { inserted.push(row); return { id: "request-1" }; },
      complete: async () => undefined,
    };
    const store = bindGenerationRequestStore("session-user", writer);
    const input = Object.assign({
      projectId: "project-1",
      cardIndex: 1,
      modelId: "gpt-image-2",
      mode: "i2i" as const,
      size: { mode: "pixel" as const, pixel: { width: 1088, height: 1360 } },
      requestedImages: 1 as const,
      unitCostUsd: 0.178,
    }, { user_id: "attacker", userId: "attacker" });

    await store.create(input);

    expect(inserted).toEqual([{
      user_id: "session-user",
      project_id: "project-1",
      card_index: 1,
      model_id: "gpt-image-2",
      mode: "i2i",
      size: { mode: "pixel", pixel: { width: 1088, height: 1360 } },
      requested_images: 1,
      unit_cost_usd: 0.178,
    }]);
  });
});
