import "server-only";

import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "../image-encoding";

/**
 * 카드 목록·결과판에 걸 미리보기.
 *
 * 결과판은 카드 열 장을 한꺼번에 깔면서 **원본을 그대로** 내려받는다. 한 장이
 * 2~4MB 라 작업 하나를 여는 데 20~40MB 가 오간다.
 *
 * **줄이지 않는다. 형식만 바꾼다.**
 *
 * 라이브러리·갤러리·포스터에서는 크기를 줄였는데, 그때마다 "얼마까지 줄여야
 * 안 흐려지는가" 가 문제가 됐다 — 두 번은 실제로 흐려지는 회귀를 냈다. 카드는
 * 이미 화면에 뜨는 크기(1088~2048)로 만들어지므로 줄일 이유가 없고, 형식만
 * 바꿔도 90% 넘게 준다. 해상도 손실이 **0** 이라 그 논쟁 자체가 사라진다.
 *
 * 품질은 88 이다. 줄지 않으니 압축 자국이 1:1 로 보이는데, 글자가 많은 그림이라
 * 그 자국이 곧바로 눈에 띈다.
 *
 * **못 만들면 `null` 이다.** 미리보기 하나 때문에 결과물을 잃지 않는다.
 */
const PREVIEW_QUALITY = 88;

export async function makeSnsPreview(bytes: Buffer): Promise<Buffer | null> {
  try {
    const preview = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();
    // 저장 인코딩과 같은 규칙 — 작아질 때만 둔다.
    return preview.length < bytes.length ? preview : null;
  } catch (error) {
    console.error(`[sns] 미리보기를 만들지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// 경로 규칙은 서버 전용이 아니다 — 로컬 저장소처럼 `server-only` 를 못 쓰는
// 쪽에서도 같은 규칙을 써야 해서 따로 두고 여기서 다시 내보낸다.
export { snsCardPathsToRemove, snsPreviewPath } from "./preview-path";
