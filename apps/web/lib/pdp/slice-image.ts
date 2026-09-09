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
export interface SliceOptions {
  /**
   * 자를 것이 없을 때도 폭 상한까지 줄일 것인가.
   *
   * **기획에는 켜고 그림에는 끈다.** 기획 요청 몸통은 여러 번 나가고(재시도
   * 2회 × 심사 재작성 2회 × 내부 재시도 3회) 읽는 값은 1024px 이면 충분하다.
   * 반대로 그림은 디자인을 흉내 내는 일이라 서체 획과 색 경계가 살아야 해서
   * 원본이 그대로 가야 한다. 예전에 `shrinkForPlanning` 이 화면에서 하던
   * 구분을 서버로 옮긴 것이다.
   */
  shrinkWhole?: boolean;
}

export async function sliceTallReference(
  input: {
    imageBase64: string;
    mimeType: string;
  },
  options: SliceOptions = {},
): Promise<ReferenceSlice[]> {
  const whole = [{ imageBase64: input.imageBase64, mimeType: input.mimeType }];

  try {
    const { default: sharp } = await import("sharp");
    const source = Buffer.from(input.imageBase64, "base64");
    const meta = await sharp(source).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return whole;

    const regions = planReferenceSlices(width, height);

    /*
      자를 것이 없으면 **손대지 않는다.** 한 조각짜리도 다시 구우면 짧은
      레퍼런스가 절반 해상도 JPEG 이 되어 나간다 — 서체 획과 색 경계가
      뭉개지면 흉내가 나빠진다.

      단, 기획 쪽은 폭 상한을 지킨다. 나누는 자리는 **비율만** 보므로
      3000×4000 처럼 「짧지만 큰」 그림이 한 조각으로 판정되고, 그대로 두면
      원본 바이트가 요청마다 통째로 나간다.
    */
    if (regions.length <= 1 && (!options.shrinkWhole || width <= MAX_SLICE_WIDTH)) return whole;

    // 순서대로 자른다. 한꺼번에 돌리면 원본을 조각 수만큼 동시에 펼쳐 놓게 되어
    // 1080×15480 한 장에 200MB 가까이 튄다.
    const slices: ReferenceSlice[] = [];
    for (const region of regions) {
      const cropped = sharp(source)
        .extract({ left: 0, top: region.top, width, height: region.height })
        .resize({ width: Math.min(width, MAX_SLICE_WIDTH), withoutEnlargement: true })
        // JPEG 은 투명을 모른다. 깔개를 안 주면 sharp 가 검정 위에 얹어서
        // 투명 PNG 레퍼런스가 통째로 「어두운 페이지」로 읽힌다.
        .flatten({ background: "#ffffff" })
        // 디자인을 읽는 용도라 색 경계와 글자 획이 살아야 한다. JPEG 품질을
        // 낮게 잡으면 서체 인상이 뭉개져 읽는 의미가 없어진다.
        .jpeg({ quality: 88 });
      slices.push({
        imageBase64: (await cropped.toBuffer()).toString("base64"),
        mimeType: "image/jpeg",
      });
    }

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
>(page: T | undefined, options: SliceOptions = {}): Promise<T | undefined> {
  if (!page?.styleReference?.imageBase64?.trim()) return page;
  return {
    ...page,
    styleReference: {
      ...page.styleReference,
      slices: await sliceTallReference(page.styleReference, options),
    },
  };
}
