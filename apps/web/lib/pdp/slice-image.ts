import "server-only";
import { planReferenceSlices } from "./reference-slices";

/**
 * 세로로 긴 레퍼런스를 **읽을 수 있는 조각들로** 만든다.
 *
 * 기획에 그대로 보내면 모델이 긴 변 기준으로 줄여서 폭 100픽셀짜리 띠가 된다.
 * 조각으로 나누면 각 조각이 제 폭을 지킨 채 들어간다.
 *
 * **서버에서 한다.** 화면에서 줄여 보내면 이미 뭉개진 것을 받게 되고, 화면 쪽
 * 캔버스 코드는 시험으로 잴 수도 없다.
 */

/** 조각 하나의 최대 폭. 이보다 크면 읽는 값은 그대로인데 몸통만 커진다. */
const MAX_SLICE_WIDTH = 1024;

export interface ReferenceSlice {
  imageBase64: string;
  mimeType: string;
}

/**
 * 실패하면 원본 한 장을 그대로 돌려준다.
 *
 * 곁다리 처리 때문에 기획이 통째로 막히면 안 된다 — 잘린 그림이 없는 것보다
 * 뭉개진 그림이라도 있는 편이 낫다.
 */
export async function sliceTallReference(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<ReferenceSlice[]> {
  const whole = [{ imageBase64: input.imageBase64, mimeType: input.mimeType }];

  try {
    const { default: sharp } = await import("sharp");
    const source = Buffer.from(input.imageBase64, "base64");
    const meta = await sharp(source).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return whole;

    const regions = planReferenceSlices(width, height);

    const slices = await Promise.all(
      regions.map(async (region) => {
        const cropped = sharp(source)
          .extract({ left: 0, top: region.top, width, height: region.height })
          .resize({ width: Math.min(width, MAX_SLICE_WIDTH), withoutEnlargement: true })
          // 디자인을 읽는 용도라 색 경계와 글자 획이 살아야 한다. JPEG 품질을
          // 낮게 잡으면 서체 인상이 뭉개져 읽는 의미가 없어진다.
          .jpeg({ quality: 88 });
        return {
          imageBase64: (await cropped.toBuffer()).toString("base64"),
          mimeType: "image/jpeg",
        };
      }),
    );

    return slices.length ? slices : whole;
  } catch (error) {
    console.warn("[pdp] 레퍼런스를 조각내지 못해 원본으로 보냅니다", error);
    return whole;
  }
}

/**
 * 페이지 값 안의 디자인 레퍼런스를 조각으로 나눠 채워 넣는다.
 *
 * 두 이미지 라우트가 같은 것을 해야 한다 — 한쪽만 조각을 보내면 「한 장만 다시
 * 만들면 디자인이 달라진다」가 된다. 이 저장소가 이미 겪은 일이다.
 */
export async function withSlicedStyleReference<
  T extends { styleReference?: { imageBase64: string; mimeType: string } },
>(page: T | undefined): Promise<T | undefined> {
  if (!page?.styleReference?.imageBase64?.trim()) return page;
  return {
    ...page,
    styleReference: {
      ...page.styleReference,
      slices: await sliceTallReference(page.styleReference),
    },
  };
}
