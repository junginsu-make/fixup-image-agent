import {
  estimatePosterCost,
  EMPTY_SLOTS,
  type PosterProjectInput,
  type PosterProjectRecord,
  type PosterProjectStore,
} from "@fixup/poster-core";
import { AD_MASTERS } from "../../../../lib/ad/specs";
import { isAdExportEnabled } from "../../../../lib/ad/batch";

/**
 * 광고 마스터 id 를 픽셀로 바꾼다.
 *
 * 설계 §10 3-b. **셋 중 하나라도 아니면 아무것도 안 싣는다** — 그러면
 * `generate/route.ts` 가 첨부 파일을 재는 지금 경로로 그대로 떨어진다.
 *
 * - 값이 없다 (일반 사용자)
 * - 기능 스위치가 꺼져 있다 (계약 5). **3단계는 돈이 나가는 단계라 끌 수
 *   있어야 할 필요가 2단계보다 크다**
 * - 모르는 id 다. 실으면 크기 없이 생성을 부르게 된다
 */
function adMasterFor(adMasterId: string | undefined): { adMaster?: { width: number; height: number } } {
  if (!adMasterId || !isAdExportEnabled()) return {};
  const master = AD_MASTERS.find((entry) => entry.id === adMasterId);
  if (!master) return {};
  return { adMaster: { width: master.width, height: master.height } };
}

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
          look: input.look,
          userInstruction: input.userInstruction,
          slots: input.slots ?? EMPTY_SLOTS,
          ...adMasterFor(input.adMasterId),
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
