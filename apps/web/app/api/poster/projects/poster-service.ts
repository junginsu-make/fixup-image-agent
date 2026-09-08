import {
  estimatePosterCost,
  EMPTY_SLOTS,
  type PosterProjectInput,
  type PosterProjectRecord,
  type PosterProjectStore,
} from "@fixup/poster-core";
import { masterById } from "../../../../lib/ad/specs";
import { isAdExportEnabled } from "../../../../lib/ad/feature";

export class PosterValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "PosterValidationError";
  }
}

/**
 * 광고 마스터 id 를 픽셀로 바꾼다.
 *
 * 설계 §10 3-b. **셋 중 하나라도 아니면 아무것도 안 싣는다** — 그러면
 * `generate/route.ts` 가 첨부 파일을 재는 지금 경로로 그대로 떨어진다.
 *
 * - 값이 없다 (일반 사용자)
 * - 기능 스위치가 꺼져 있다 (계약 5). `/ad` 와 `/api/ad/export` 가 404 를 주는
 *   것과 결이 같다 — 꺼진 상태에서 광고 필드에 반응하면 스위치가 새어 나간다
 *
 * **모르는 id 는 조용히 버리지 않고 거절한다.** 버리면 `data.adMaster` 가 없는
 * 광고 프로젝트가 되고, `ratio` 는 `match-source` 라 생성이 **첨부 파일을 재서**
 * 엉뚱한 크기의 마스터를 만든다. 화면은 사용자가 고른 마스터에 맞춰 파생 계획을
 * 세웠는데 나온 그림은 다른 크기다 — 파생이 실패하고 **그때는 이미 과금된
 * 뒤다.** §4.4 가 막으려던 바로 그 일이다.
 *
 * `adMasterId` 는 사용자가 타이핑하는 값이 아니다. 화면이 `AD_MASTERS` 에서
 * 골라 보낸다. 모르는 id 가 왔다는 것은 배포가 어긋났거나 요청을 손으로 만든
 * 것이고, 둘 다 **시끄럽게 실패하는 편이 낫다.**
 *
 * **기존 사용자는 여기 안 닿는다** — 광고와 무관한 요청은 `adMasterId` 를 아예
 * 안 보낸다.
 */
function adMasterFor(adMasterId: string | undefined): { adMaster?: { width: number; height: number } } {
  if (!adMasterId || !isAdExportEnabled()) return {};
  const master = masterById(adMasterId);
  if (!master) throw new PosterValidationError(["모르는 광고 마스터입니다."]);
  return { adMaster: { width: master.width, height: master.height } };
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
          // 그림 느낌만 바꿔도 되는 사람 (설계 §4-3).
          restyledIds: input.restyledIds,
          look: input.look,
          userInstruction: input.userInstruction,
          // 고른 차례와 그림 지시. 옛 작업에는 없고, 읽는 쪽이 그때 만들어 준다.
          attachmentOrder: input.attachmentOrder,
          attachmentIntent: input.attachmentIntent,
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
