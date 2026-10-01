import { createFalClient, type FalClient } from "@fal-ai/client";
import { defaultFalRouter } from "./pool/default";
import type { FalRouter } from "./route";

export interface FalUploader {
  uploadReference(bytes: Uint8Array, contentType: string): Promise<string>;
}

type FalClientFactory = (config: { credentials: string; retry: { maxRetries: number } }) => Pick<FalClient, "storage">;

/**
 * 로컬·운영 파일을 같은 fal 업로드 URL로 바꾸는 공용 계약.
 *
 * 올릴 키는 `router.uploadRoute()` 가 고른다(켜진 성한 계정, 없으면 서버 `FAL_KEY`). 올린 주소는 공개
 * 주소라 다른 계정의 생성 요청에도 그대로 쓸 수 있다.
 */
export function createFalUploader(
  router: FalRouter = defaultFalRouter(),
  factory: FalClientFactory = createFalClient,
): FalUploader {
  return {
    async uploadReference(bytes, contentType) {
      const { key } = await router.uploadRoute();
      const client = factory({ credentials: key, retry: { maxRetries: 0 } });
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: contentType });
      return client.storage.upload(blob, { lifecycle: { expiresIn: "1h" } });
    },
  };
}

/** 같은 배치의 동일 키를 한 번만 업로드하고 URL을 재사용한다. */
export async function uploadUniqueReferences<T>(
  items: T[],
  keyOf: (item: T) => string,
  upload: (item: T) => Promise<string>,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const item of items) {
    const key = keyOf(item);
    if (urls[key] === undefined) urls[key] = await upload(item);
  }
  return urls;
}
