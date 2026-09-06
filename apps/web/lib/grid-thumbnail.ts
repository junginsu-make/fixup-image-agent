// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "./image-encoding";

/**
 * 격자 목록에 거는 작은 사본.
 *
 * 참고 이미지는 **공용 창고**라 한 화면에 400장까지 뜬다. 캐릭터는 한 사람에
 * 각도 셋이라 사람 수만큼 곱해진다. 둘 다 칸이 작은 격자라 512px 이면 넉넉하다.
 *
 * **가로만 묶는다.** 격자는 열로 배치해 제약이 가로뿐이고, 긴 변을 묶으면
 * 세로로 긴 그림의 가로가 깎여 흐려진다 — 앞선 작업에서 두 번 겪은 일이다.
 *
 * **원본은 절대 건드리지 않는다.** 참고 이미지는 화면에만 뜨는 것이 아니라
 * fal 에 참고로 실려 나가고, 캐릭터는 다각도 생성의 바탕이 된다. 거기에 사본을
 * 물리면 생성 품질이 조용히 깎인다. 사본은 별개 파일이고 목록에서만 쓴다.
 *
 * **못 만들면 `null` 이다.** 사본 하나 때문에 원본을 잃지 않는다.
 */
const GRID_WIDTH = 512;
const GRID_QUALITY = 78;

export async function makeGridThumbnail(bytes: Buffer): Promise<Buffer | null> {
  try {
    const thumbnail = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      .resize(GRID_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: GRID_QUALITY })
      .toBuffer();
    // 저장 인코딩과 같은 규칙 — 작아질 때만 둔다.
    return thumbnail.length < bytes.length ? thumbnail : null;
  } catch (error) {
    console.error(`[grid-thumb] 사본을 만들지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// 경로 규칙은 서버 전용이 아니다 — 그것을 쓰는 쪽이 `server-only` 를 못 쓰는
// 자리에도 있어서 따로 두고 여기서 다시 내보낸다.
export { gridPathsToRemove, gridThumbPath } from "./grid-thumbnail-path";
