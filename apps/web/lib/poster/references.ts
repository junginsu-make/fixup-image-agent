import "server-only";

import type { PosterReferenceRecord } from "@fixup/poster-core";
import {
  listReferenceImages,
  referenceImagesByIds,
  type ReferenceImageView,
  type ReferenceViewer,
} from "../reference-images";

/**
 * 이미지 만들기가 쓰는 참고 이미지 — **라이브러리와 같은 목록이다.**
 *
 * 전에는 이미지 만들기만 저만의 질의를 썼다(`poster/supabase-store.ts` 의
 * `references`). 그 질의는 「내 것 + 내 팀 것」만 봤고, 나머지 화면
 * (카드뉴스·캐릭터·광고·상세페이지·라이브러리)은 `listReferenceImages` 로
 * 「팀이 안 붙은 것은 누구나」까지 봤다. 그래서 **같은 그림이 카드뉴스에서는
 * 보이고 이미지 만들기에서는 없었다** — 관리자도 남의 것을 여기서만 못 봤다
 * (2026-09-17 사용자 확인 요청으로 드러났다).
 *
 * 규칙을 옮겨 적지 않고 **그 함수를 그대로 부른다.** 두 벌로 적으면 언젠가
 * 한쪽만 고쳐지고, 그때 틀리는 방향은 「남의 것이 보인다」 쪽이다.
 *
 * 여기 있는 것은 **모양 맞추기뿐**이다 — 화면과 흐름이 `PosterReferenceRecord`
 * 를 기대한다(`url`·`fileName`).
 */
export function toPosterReference(image: ReferenceImageView): PosterReferenceRecord {
  return {
    id: image.id,
    storagePath: image.storagePath,
    fileName: image.storagePath.split("/").pop() ?? "",
    title: image.title,
    width: image.width,
    height: image.height,
    createdAt: image.createdAt,
    url: image.signedUrl ?? undefined,
    // 격자에 거는 작은 사본. 없으면 `null` 이다 — 원본으로 채우지 않는다.
    thumbUrl: image.thumbUrl,
  };
}

export async function posterReferences(viewer: ReferenceViewer): Promise<PosterReferenceRecord[]> {
  return (await listReferenceImages(viewer)).map(toPosterReference);
}

/** 고른 것만. **차례는 물어본 차례 그대로다** — 프롬프트의 `Image N` 이 그 차례다. */
export async function posterReferencesByIds(
  viewer: ReferenceViewer,
  ids: string[],
): Promise<PosterReferenceRecord[]> {
  return (await referenceImagesByIds(viewer, ids)).map(toPosterReference);
}
