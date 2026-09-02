import {
  estimatePosterCost,
  EMPTY_SLOTS,
  type PosterProjectInput,
  type PosterProjectRecord,
  type PosterProjectStore,
} from "@fixup/poster-core";

export class PosterValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "PosterValidationError";
  }
}

/**
 * 만들기 전에 막는다. 생성 뒤에 알면 돈만 나간다.
 *
 * 비율과 모델이 안 맞는 조합(A4 인쇄용 + nano 등)은 여기서 걸러진다 —
 * fal 을 부르고 나서 알면 이미 늦다.
 */
export function createPosterService(store: PosterProjectStore) {
  return {
    list: () => store.list(),
    get: (id: string) => store.get(id),
    remove: (id: string) => store.remove(id),

    async create(input: PosterProjectInput): Promise<PosterProjectRecord> {
      const estimate = estimatePosterCost({
        modelId: input.modelId,
        ratioId: input.ratio,
        variants: input.variants,
        hasReferences: input.referenceIds.length > 0,
      });
      if (estimate.rejected) throw new PosterValidationError([estimate.rejected]);

      return store.create({
        title: input.title,
        status: "draft",
        ratio: input.ratio,
        modelId: input.modelId,
        data: {
          instruction: input.instruction,
          variants: input.variants,
          referenceIds: input.referenceIds,
          preservedIds: input.preservedIds,
          personIds: input.personIds,
          slots: input.slots ?? EMPTY_SLOTS,
        },
      });
    },

    async updateSlots(id: string, slots: PosterProjectRecord["data"]["slots"]): Promise<PosterProjectRecord> {
      const project = await store.get(id);
      if (!project) throw new PosterValidationError(["포스터 작업을 찾을 수 없습니다."]);
      return store.update(id, { data: { ...project.data, slots }, status: "ready" });
    },
  };
}
