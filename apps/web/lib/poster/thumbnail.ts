import "server-only";

// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "../image-encoding";

/**
 * 결과 목록에 걸 사본.
 *
 * 목록은 변형 세 장을 한꺼번에 깔면서 **원본을 그대로** 내려받는다. 한 장이
 * 2~4MB 라 목록 한 번이 10MB 를 넘는다.
 *
 * **가로만 묶는다.** 목록은 열로 배치하므로 제약이 가로뿐이고, 긴 변을 묶으면
 * 세로로 긴 그림의 가로가 깎여 흐려진다. 이 제품의 결과물은 포스터라 세로가
 * 기본값이다.
 *
 * 품질을 갤러리(82)보다 높게 잡는다. 포스터 원본은 대개 가로 1024 라 사본이
 * **줄어들지 않고 형식만 바뀌는데**, 그러면 압축 자국이 1:1 로 보인다. 글자가
 * 많은 그림이라 그 자국이 곧바로 눈에 띈다.
 *
 * **못 만들면 `null` 이다.** 사본 하나 때문에 결과물을 잃지 않는다.
 */
const PREVIEW_WIDTH = 1024;
const PREVIEW_QUALITY = 88;

export async function makePosterThumbnail(bytes: Buffer): Promise<Buffer | null> {
  try {
    const preview = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      .resize(PREVIEW_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();
    // 저장 인코딩과 같은 규칙 — 작아질 때만 둔다. 이미 작은 그림은 형식만
    // 바꿔도 커질 수 있고, 그때는 사본이 자리만 차지한다.
    return preview.length < bytes.length ? preview : null;
  } catch (error) {
    console.error(`[poster] 사본을 만들지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
