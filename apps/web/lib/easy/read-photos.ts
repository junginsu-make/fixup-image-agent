import { readAttachments, type GrammarReader } from "@fixup/poster-core";
import { createPosterAttachmentReader } from "../poster/providers";
import { readOfPhoto, type EasyPhoto, type EasyPhotoRead } from "../../app/easy/photo-roles";

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
 *
 * **한 장씩 부르되 동시에 부른다**(2026-09-30 실측 — 한 장 15초, 세 장 36초).
 * `readAttachments` 는 받은 것을 차례로 읽는다. 사진마다 따로 넘기면 부름은
 * 여전히 한 장씩이라 사람과 연출이 섞이지 않고, 기다림은 가장 느린 한 장이 된다.
 */
export async function readEasyPhotos(
  photos: readonly EasyPhoto[],
  reader?: GrammarReader,
): Promise<Record<string, EasyPhotoRead>> {
  const readable = photos.filter((photo) => Boolean(photo.url));
  if (!readable.length) return {};

  const eye = reader ?? createPosterAttachmentReader();
  const results = await Promise.all(readable.map((photo) =>
    readAttachments([{ id: photo.id, title: photo.title ?? "사진", url: photo.url! }], eye)));
  return Object.fromEntries(results.flatMap(({ reads }) =>
    Object.entries(reads).map(([id, read]) => [id, readOfPhoto(read)])));
}
