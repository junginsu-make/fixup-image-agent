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
 * **가로 1024 인 근거.** 결과 목록의 실제 그림 폭은 뷰포트에 따라 이렇다 —
 * 1440 에서 349px, 1920 에서 485px, 2560 에서 687px(셸에 최대 폭이 없다).
 * 고해상도 화면이면 그 두 배가 필요하므로 1920 까지는 1024 로 덮인다.
 * **2560·고해상도부터는 확대 보간이 걸린다** — 알려진 한계다. 더 올리면 사본이
 * 원본에 근접해 목적이 사라진다.
 *
 * 품질을 갤러리(82)보다 높게 잡는다. 포스터 원본은 비율마다 가로가 1024~2400
 * 인데(`POSTER_RATIOS`, 절반 이상이 1088), **1088 짜리는 거의 줄지 않아** 압축
 * 자국이 1:1 에 가깝게 보인다. 글자가 많은 그림이라 곧바로 눈에 띈다.
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
