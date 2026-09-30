import { readAttachments, type GrammarReader } from "@fixup/poster-core";
import { createPosterAttachmentReader } from "../poster/providers";
import { describePhoto, type EasyPhoto } from "../../app/easy/photo-roles";

/**
 * 붙인 사진을 **이미지 만들기 기획이 쓰는 그 기계로** 읽는다(설계 §2-3 ⓐ).
 *
 * 새로 만들면 두 벌이 되고 하나는 곧 낡는다. 한 장씩 읽는 것도, 실패한 장만
 * 비우는 것도 `readAttachments` 가 이미 한다.
 *
 * **눈은 읽을 것이 있을 때 만든다.** 먼저 만들면 열쇠가 없는 곳에서 읽을 것이
 * 없어도 터진다.
 *
 * 주소 서명이 비어 읽을 수 없는 사진은 설명 없이 ⓑ2 로 간다 — 말이 쓰임을
 * 안 말했으면 묻는다(설계 §2-3).
 */
export async function readEasyPhotos(
  photos: readonly EasyPhoto[],
  reader?: GrammarReader,
): Promise<Record<string, string>> {
  const readable = photos.filter((photo) => Boolean(photo.url));
  if (!readable.length) return {};

  const { reads } = await readAttachments(
    readable.map((photo) => ({ id: photo.id, title: photo.title ?? "사진", url: photo.url! })),
    reader ?? createPosterAttachmentReader(),
  );
  return Object.fromEntries(Object.entries(reads).map(([id, read]) => [id, describePhoto(read)]));
}
