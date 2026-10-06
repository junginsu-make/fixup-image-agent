import { orderFromLegacyLists, restoreAttachments, type OrderedAttachment, type StoredAttachmentData } from "@fixup/shared";

/**
 * 고칠 때 다시 붙일 **지킬 대상**을 원래 작업에서 되살린다.
 *
 * 고칠 그림에도 제품·인물이 있지만 이미 한 번 그려진 것이다. 그것만 보고 고치면
 * 고칠 때마다 조금씩 달라진다. 그래서 원본 사진을 함께 붙인다(`edit-job.ts`).
 *
 * 만들기(`generate/route.ts`)와 같은 규칙으로 차례·사람·그림 느낌을 가른다 —
 * 두 길이 다르게 읽으면 같은 작업에서 사람이 물건이 된다.
 *
 * **순수 함수로 뽑는다** — 라우트 안에 두면 시험이 못 간다.
 */
export function editAttachmentInputs(
  data: StoredAttachmentData,
  preserved: ReadonlyArray<{ id: string }>,
  /** 올린 것만 들어 있다. 따라 만들 그림은 안 올렸으니 여기 없다. */
  urls: Record<string, string>,
) {
  const urlsOf = (ids: readonly string[]) => preserved
    .filter((reference) => ids.includes(reference.id))
    .map((reference) => urls[reference.id])
    .filter((url): url is string => Boolean(url));
  return {
    // 올린 것만 되살아난다 — 따라 만들 그림은 여기서 저절로 빠진다.
    attachments: restoreAttachments(data, urls),
    preservedUrls: urlsOf(preserved.map((reference) => reference.id)),
    personUrls: urlsOf(data.personIds ?? []),
    restyledUrls: urlsOf(data.restyledIds ?? []),
  };
}

/**
 * 고치면서 **새로 붙인 사진**을 맨 앞 지킬 대상(제품)으로 더한다
 * (2026-10-06 「쉽게」 이미지 고치기 — 「로고를 이 사진의 로고로 바꿔줘」).
 *
 * **새것이 먼저다.** 모델 한도에 걸리면 `buildPosterEditJob` 이 뒤에서부터 자르는데,
 * 사용자가 방금 붙인 것이 이번 고치기의 핵심이다. 원래 작업의 원본 사진은 보조다.
 *
 * **차례가 없는 옛 작업**은 첨부가 비어 오고 대신 두 목록이 온다. 거기에 새것만
 * 붙이면 `keptAttachments` 가 첨부만 보고 두 목록을 버린다 — 그래서 목록으로
 * 차례를 먼저 만든다(`buildPosterJob` 과 같은 규칙).
 *
 * 붙인 것이 없으면 받은 그대로 돌려준다 — 포스터 「이 장만 고치기」는 그대로다.
 */
export function withAddedAttachments<T extends ReturnType<typeof editAttachmentInputs>>(
  inputs: T,
  addedUrls: readonly string[],
): T {
  if (!addedUrls.length) return inputs;
  const kept: OrderedAttachment[] = inputs.attachments.length
    ? inputs.attachments
    : orderFromLegacyLists([], inputs.preservedUrls, inputs.personUrls, inputs.restyledUrls);
  return {
    ...inputs,
    attachments: [...addedUrls.map((url): OrderedAttachment => ({ url, role: "preserve_product" })), ...kept],
  };
}
