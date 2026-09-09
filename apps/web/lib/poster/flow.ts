import {
  buildPosterJob,
  posterImageRows,
  type PosterImageStore,
  type PosterJobInput,
  type PosterRequestStore,
} from "@fixup/poster-core";
import type { FalQueueClient } from "../fal/queue";

/**
 * 포스터 한 번 생성.
 *
 * 카드뉴스에서 돈으로 배운 순서를 그대로 따른다:
 *
 *   1. 제출한다 (한 번만)
 *   2. **request_id 를 장부에 먼저 적는다** — 여기서 죽어도 어디에 돈이
 *      나갔는지 찾을 수 있다
 *   3. 상태를 물어본다 (과금이 아니다)
 *   4. 결과가 오면 **비용부터 확정한다** — 저장이 실패해도 돈은 이미 나갔다
 *   5. 그다음 이미지를 저장한다
 *
 * 모델 호출에 시간 제한을 두지 않는다. GPT Image 2 가 133~140초 걸리는데
 * 2분 제한 때문에 세 장을 통째로 잃은 적이 있다.
 */

export interface PosterFlowDependencies {
  queue: FalQueueClient;
  requests: PosterRequestStore;
  images: PosterImageStore;
  /**
   * fal 이 준 URL 을 우리 저장소로 옮기고 경로를 돌려준다.
   *
   * **회차를 함께 넘긴다.** `variantIndex` 는 그 요청 안의 배열 번호라서
   * 회차마다 0 부터 다시 센다. 그것만으로 자리를 정하면 다음 회차가 앞 회차의
   * 파일을 덮어쓴다.
   */
  saveImage(
    projectId: string,
    generationRequestId: string,
    variantIndex: number,
    url: string,
  ): Promise<{ assetPath: string; thumbPath: string | null }>;
}

export interface PosterSubmission {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
  estimatedUsd?: number;
  approximate?: true;
}

/**
 * **돈이 나간 뒤에 실패했다.**
 *
 * `queue.submitJob` 이 성공하면 fal 작업은 이미 만들어졌고 과금도 끝났다.
 * 그 뒤의 실패(장부 쓰기 등)를 보통 오류와 같이 다루면, 부르는 쪽이
 * 「실패했으니 되돌려도 되겠지」로 판단해 **사용자가 곧바로 두 번째 작업을
 * 만든다.** 그래서 갈래를 나눈다.
 *
 * `falRequestId` 를 실어 보낸다 — 지금까지 이 값은 예외와 함께 사라졌고,
 * 그러면 「돈은 나갔는데 장부에 없는 요청」을 나중에 찾을 길이 없다.
 */
export class PosterChargedError extends Error {
  constructor(readonly falRequestId: string, readonly cause: unknown) {
    super("제출은 됐는데 장부에 적지 못했습니다.");
    this.name = "PosterChargedError";
  }
}

export async function submitPoster(
  job: PosterJobInput & { parentImageId?: string; editInstruction?: string },
  dependencies: PosterFlowDependencies,
): Promise<PosterSubmission> {
  const built = buildPosterJob(job);
  if (built.rejected) throw new Error(built.rejected);

  const { requestId } = await dependencies.queue.submitJob(built.endpoint, built.input);

  // ─── 이 줄부터는 돈이 이미 나갔다 ───

  // 제출과 저장 사이에서 죽으면 돈이 어디로 갔는지 못 찾는다. 바로 적는다.
  let id: string;
  try {
    ({ id } = await dependencies.requests.create({
      projectId: job.projectId,
      parentImageId: job.parentImageId ?? null,
      editInstruction: job.editInstruction ?? null,
      modelId: job.modelId,
      ratioId: job.ratioId,
      mode: built.mode,
      size: built.size,
      requestedImages: job.variants,
      unitCostUsd: built.estimate.unitUsd ?? null,
      costApproximate: built.estimate.approximate === true,
    }));
  } catch (cause) {
    // **과금 뒤의 실패임을 부르는 쪽이 알아야 한다.** 모르면 「실패했으니
    // 되돌려도 되겠지」로 판단해 사용자가 곧바로 두 번째 작업을 만든다.
    throw new PosterChargedError(requestId, cause);
  }

  return {
    requestRowId: id,
    falRequestId: requestId,
    endpoint: built.endpoint,
    estimatedUsd: built.estimate.totalUsd,
    approximate: built.estimate.approximate,
  };
}

export interface PosterCollectInput {
  projectId: string;
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
  unitCostUsd: number;
}

export async function collectPoster(
  input: PosterCollectInput,
  dependencies: PosterFlowDependencies,
): Promise<{ done: boolean; images?: unknown[] }> {
  const status = await dependencies.queue.jobStatus(input.endpoint, input.falRequestId);
  if (status !== "completed") return { done: false };

  const result = await dependencies.queue.jobResult(input.endpoint, input.falRequestId);

  // 돈은 이미 나갔다. 저장이 실패해도 장부에서 사라지면 안 된다.
  await dependencies.requests.complete(input.requestRowId, {
    falRequestId: input.falRequestId,
    returnedImages: result.images.length,
    costUsd: Number((input.unitCostUsd * result.images.length).toFixed(4)),
  });

  const paths: string[] = [];
  const thumbPaths: Array<string | null> = [];
  for (const [index, image] of result.images.entries()) {
    const saved = await dependencies.saveImage(input.projectId, input.requestRowId, index, image.url);
    paths.push(saved.assetPath);
    thumbPaths.push(saved.thumbPath);
  }

  const rows = posterImageRows({
    projectId: input.projectId,
    generationRequestId: input.requestRowId,
    images: result.images,
    paths,
    thumbPaths,
  });
  return { done: true, images: await dependencies.images.add(rows) };
}
