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
  /** fal 이 준 URL 을 우리 저장소로 옮기고 경로를 돌려준다. */
  saveImage(projectId: string, variantIndex: number, url: string): Promise<string>;
}

export interface PosterSubmission {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
  estimatedUsd?: number;
  approximate?: true;
}

export async function submitPoster(
  job: PosterJobInput & { parentImageId?: string; editInstruction?: string },
  dependencies: PosterFlowDependencies,
): Promise<PosterSubmission> {
  const built = buildPosterJob(job);
  if (built.rejected) throw new Error(built.rejected);

  const { requestId } = await dependencies.queue.submitJob(built.endpoint, built.input);

  // 제출과 저장 사이에서 죽으면 돈이 어디로 갔는지 못 찾는다. 바로 적는다.
  const { id } = await dependencies.requests.create({
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
  });

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
  for (const [index, image] of result.images.entries()) {
    paths.push(await dependencies.saveImage(input.projectId, index, image.url));
  }

  const rows = posterImageRows({
    projectId: input.projectId,
    generationRequestId: input.requestRowId,
    images: result.images,
    paths,
  });
  return { done: true, images: await dependencies.images.add(rows) };
}
