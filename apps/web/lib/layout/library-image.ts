import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import {
  findLocalReferenceImage,
  getLocalDatabase,
  isLocalStoreEnabled,
  localStoreRoot,
  readLocalReferenceFile,
} from "../local-store";

/**
 * 로고 칸에 놓을 그림을 라이브러리에서 그대로 가져온다.
 *
 * **AI 를 거치지 않는다.** 모델이 로고를 다시 그리면 항상 다른 로고가 된다.
 *
 * 없어졌으면 그 칸을 비운다 — 로고 하나 때문에 카드가 안 나오면 안 된다.
 */

const BUCKET = "library";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
};

export interface LibraryImage {
  bytes: Buffer;
  contentType: string;
}

function contentTypeFor(storagePath: string): string {
  const extension = storagePath.slice(storagePath.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "image/png";
}

export async function referenceImageBytes(userId: string, id: string): Promise<LibraryImage | undefined> {
  if (!id.trim()) return undefined;

  if (isLocalStoreEnabled()) {
    const found = await findLocalReferenceImage(getLocalDatabase(), userId, id);
    if (!found) return undefined;
    try {
      return {
        bytes: await readLocalReferenceFile(localStoreRoot(), found.storagePath),
        contentType: contentTypeFor(found.storagePath),
      };
    } catch {
      return undefined;
    }
  }

  const client = createSupabaseAdminClient();
  const row = await client
    .from("reference_images")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (row.error || !row.data) return undefined;

  const storagePath = (row.data as { storage_path: string }).storage_path;
  const file = await client.storage.from(BUCKET).download(storagePath);
  if (file.error || !file.data) return undefined;
  return { bytes: Buffer.from(await file.data.arrayBuffer()), contentType: contentTypeFor(storagePath) };
}

/** 비전 모델에 넘길 주소. 로컬이든 운영이든 같은 모양이어야 한다. */
export function toDataUrl(image: LibraryImage): string {
  return `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
}
