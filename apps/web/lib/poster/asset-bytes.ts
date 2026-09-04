import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * 저장소에서 그림 바이트를 읽는다.
 *
 * **바깥 모델에 우리 주소를 넘기지 않으려고 있다.** fal 도 검수 모델도 이
 * 서버 밖에 있어서 로그인 쿠키가 없다. `/api/.../file` 은 회원 확인을 거치므로
 * 그쪽에서 부르면 401 이다 — 그림을 못 읽은 채 일이 진행되고, 화면에는
 * 「만드는 중」만 계속 떠 있게 된다(2026-09-04 포스터 재생성).
 *
 * 바이트를 읽어 fal 에 올린 뒤 그 주소를 넘긴다. 첫 생성이 이미 그렇게 한다.
 */

/** 참고 이미지는 라이브러리 버킷에 있다. 포스터만의 버킷을 따로 두지 않는다. */
const LIBRARY_BUCKET = "library";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png",
};

function contentTypeOf(storagePath: string): string {
  return CONTENT_TYPES[path.extname(storagePath).toLowerCase()] ?? "image/png";
}

async function fromBucket(storagePath: string): Promise<Buffer> {
  const downloaded = await createSupabaseAdminClient().storage.from(LIBRARY_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) {
    throw new Error(downloaded.error?.message ?? "그림을 읽지 못했습니다.");
  }
  return Buffer.from(await downloaded.data.arrayBuffer());
}

/**
 * 참고 이미지의 바이트.
 *
 * 로컬은 라이브러리와 같은 경로 규약이다: `{user_id}/references/{id}.{ext}`.
 */
export async function referenceBytes(
  storagePath: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = contentTypeOf(storagePath);
  if (isLocalStoreEnabled()) {
    const file = path.join(localStoreRoot(), "library", ...storagePath.split("/"));
    return { bytes: await readFile(file), contentType };
  }
  return { bytes: await fromBucket(storagePath), contentType };
}

/**
 * 만들어 둔 포스터 그림의 바이트.
 *
 * 로컬에서만 참고 이미지와 자리가 다르다 — 그쪽은 `library/`, 이쪽은
 * `poster/` 아래다. 운영에서는 같은 버킷이다.
 */
export async function posterImageBytes(
  assetPath: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = contentTypeOf(assetPath);
  if (isLocalStoreEnabled()) {
    const file = path.join(localStoreRoot(), "poster", ...assetPath.split("/"));
    return { bytes: await readFile(file), contentType };
  }
  return { bytes: await fromBucket(assetPath), contentType };
}
