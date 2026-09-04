import "server-only";

// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
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

/** 미리보기가 놓일 자리. **원본 이름 규칙은 건드리지 않는다.** */
export function snsPreviewPath(userId: string, projectId: string, cardIndex: number): string {
  return `${userId}/sns/${projectId}/${cardIndex}.thumb.webp`;
}

/**
 * 지울 경로를 모은다. 회원 삭제와 관리자 삭제가 **같은 답**을 내야 한다.
 *
 * 행이 사라지면 미리보기의 자리를 아는 근거가 없어진다 — 라이브러리·갤러리·
 * 포스터에서 세 번 반복해 잡힌 실수다.
 */
export function snsCardPathsToRemove(
  cards: Array<{ assetPath?: string | null; thumbPath?: string | null }>,
): string[] {
  return cards.flatMap((card) =>
    [card.assetPath, card.thumbPath].filter(Boolean) as string[]);
}
