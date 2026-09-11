import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";
import { makePosterThumbnail } from "./thumbnail";
import { posterAssetPath, posterThumbPath } from "./supabase-store-core";
import { createSupabaseAdminClient } from "../supabase/admin";
import { markAsAi } from "../watermark";
const LIBRARY_BUCKET = "library";
async function saveThumbnail(
  bytes: Buffer,
  target: string,
  put: (path: string, body: Buffer) => Promise<string | null>,
): Promise<string | null> {
  const thumbnail = await makePosterThumbnail(bytes);
  if (!thumbnail) return null;
  return put(target, thumbnail);
}

/**
 * 결과 한 장을 저장한다. 원본과 목록용 사본의 자리를 함께 돌려준다.
 *
 * **원본의 이름 규칙(`.png`)은 손대지 않는다** — 사본은 별개 파일이라 이미
 * 쌓인 것들이 그대로 열려야 한다.
 */
export async function savePosterResult(
  userId: string, projectId: string, generationRequestId: string, variantIndex: number, url: string,
): Promise<{ assetPath: string; thumbPath: string | null }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`결과 이미지를 내려받지 못했습니다 (${response.status}).`);
  // 만든 그림이므로 "AI 이미지" 를 파일에 새기고 저장한다.
  const bytes = await markAsAi(Buffer.from(await response.arrayBuffer()));

  if (isLocalStoreEnabled()) {
    const root = path.join(localStoreRoot(), "poster");
    const write = async (storagePath: string, body: Buffer) => {
      const target = path.join(root, ...storagePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      return storagePath;
    };
    // 운영과 같은 규칙으로 회차를 한 칸 둔다 — 두 모드가 다르면 로컬에서 확인한
    // 것이 운영에서 확인한 것이 아니게 된다.
    const assetPath = await write(`${projectId}/${generationRequestId}/${variantIndex}.png`, bytes);
    const thumbPath = await saveThumbnail(
      bytes, `${projectId}/${generationRequestId}/${variantIndex}.thumb.webp`, write,
    );
    return { assetPath, thumbPath };
  }

  const storage = createSupabaseAdminClient().storage.from(LIBRARY_BUCKET);
  const assetPath = posterAssetPath(userId, projectId, generationRequestId, variantIndex);
  const result = await storage.upload(assetPath, bytes, { contentType: "image/png", upsert: true });
  if (result.error) throw new Error(result.error.message);

  const thumbPath = await saveThumbnail(
    bytes,
    posterThumbPath(userId, projectId, generationRequestId, variantIndex),
    async (target, body) => {
      const uploaded = await storage.upload(target, body, { contentType: "image/webp", upsert: true });
      if (!uploaded.error) return target;
      // 자리를 비워 두면 원본으로 떨어진다.
      console.error(`[poster] 사본을 올리지 못했습니다: ${uploaded.error.message}`);
      return null;
    },
  );
  return { assetPath, thumbPath };
}
