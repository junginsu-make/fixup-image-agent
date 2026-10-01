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

/** 순수 도우미는 `./unique-upload` 에 있다 — 브라우저 번들(카드뉴스 화면)도 들이므로 계정 풀을 끌고 오면 안 된다. */
export { uploadUniqueReferences } from "./unique-upload";
