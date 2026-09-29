import { restoreAttachments, type StoredAttachmentData } from "@fixup/shared";

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
