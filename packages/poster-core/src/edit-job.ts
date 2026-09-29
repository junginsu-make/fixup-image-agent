import { IMAGE_MODELS } from "@fixup/sns-core";
import { orderFromLegacyLists, type OrderedAttachment } from "@fixup/shared";
import { buildPosterEditPrompt } from "./edit-prompt";
import { buildPosterJob, type PosterJob } from "./generate";
import { promptImagesFrom } from "./prompt-images";
import type { PosterEditJob } from "./selection";

/**
 * 「이 장만 고치기」 한 번을 fal 요청으로 조립한다.
 *
 * **처음 만들기(`buildPosterJob`)는 고치지 않는다.** 처음 만들기는 잘 돌고 있고,
 * 이 문제는 다 만든 뒤 고칠 때만 난다(2026-09-29 사용자 지시). 그래서 크기·견적·
 * 장수 검사·엔드포인트는 `buildPosterJob` 을 **그대로 불러** 같은 길로 내고,
 * 프롬프트만 고치기용(`buildPosterEditPrompt`)으로 갈아 끼운다.
 *
 * 고칠 그림을 첨부 맨 앞에 두는 것이 요령이다. 그러면 `buildPosterJob` 이
 * `image_urls` 첫 칸에 고칠 그림을 놓고, 장수 검사에 한 장을 더 센다 — 프롬프트의
 * `Image 1` 과 같은 약속이다. 거기서 조립된 처음 만들기용 프롬프트는 버린다.
 */
export function buildPosterEditJob(job: PosterEditJob): PosterJob {
  /*
   * **원본 사진은 모델 한도에 맞게 줄인다 — 고칠 그림은 언제나 간다.**
   *
   * 전에는 고칠 그림 한 장만 보내서 한도에 걸릴 일이 없었다. 원본 사진을 더하자
   * 처음 만들 때는 되던 작업이 고칠 때 거절됐다(경제형 7장 한도에 사진 7장 —
   * 2026-09-29 리뷰). 고치기 화면에는 뺄 방법도 모델을 바꿀 방법도 없다.
   *
   * 처음 만들기는 「조용히 자르지 않는다」(`generate.ts`)인데 여기는 다르다. 그쪽은
   * 잘린 것이 결과에서 사라지지만, 여기는 대상이 고칠 그림에 이미 있고 사진은
   * 알아보게 돕는 보조다.
   */
  const room = (IMAGE_MODELS.find((model) => model.id === job.modelId)?.maxReferenceImages ?? Infinity) - 1;
  const kept = keptAttachments(job).slice(0, Math.max(0, room));
  const base = buildPosterJob({
    ...job,
    // 역할 값은 `buildPosterJob` 안에서만 쓰이고 그 프롬프트는 아래에서 버린다.
    // 순서와 장수만 빌린다.
    attachments: [{ url: job.editSourceUrl, role: "style" }, ...kept],
    referenceUrls: [job.editSourceUrl],
    preservedUrls: kept.map((attachment) => attachment.url),
  });
  if (base.rejected) return base;

  const prompt = buildPosterEditPrompt({
    instruction: job.editInstruction,
    images: promptImagesFrom(kept),
    slots: job.slots,
    size: base.size.width && base.size.height
      ? { width: base.size.width, height: base.size.height }
      : undefined,
    invented: job.invented,
    referenceHasText: job.referenceHasText,
  });
  return { ...base, prompt, input: { ...base.input, prompt } };
}

/**
 * 원래 작업의 첨부 중 **지킬 대상만** 남긴다.
 *
 * 따라 만들 그림은 다시 안 붙인다. 그 결은 고칠 그림에 이미 들어 있고, 붙이면
 * 「느낌만 따라 하고 사람·제품은 복사하지 마라」가 다시 따라온다.
 *
 * 옛 작업에는 차례가 없다 — 그때는 두 목록에서 만든다(`buildPosterJob` 과 같다).
 */
function keptAttachments(job: PosterEditJob): OrderedAttachment[] {
  const ordered = job.attachments?.length
    ? job.attachments
    : orderFromLegacyLists([], job.preservedUrls, job.personUrls ?? [], job.restyledUrls ?? []);
  return ordered.filter((attachment) => attachment.role !== "style");
}
