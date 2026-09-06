// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import type { DerivePlan } from "./derive";
import type { AdSpec } from "./specs";

/**
 * 마스터 한 장에서 광고 규격 하나를 뽑는다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §8
 *
 * **저장 인코더와 목적이 다르다.** `image-encoding.ts` 의 `encodeForStorage` 는
 * 픽셀을 지키는 것이 목적이라 무손실이다. 여기는 **용량 상한을 지키는 것**이
 * 목적이라 품질을 깎는다. 포털이 거부하는 파일을 예쁘게 만들어 봐야 소용없다.
 *
 * **`server-only` 를 붙이지 않는다.** 같은 자리의 `grid-thumbnail.ts` 와 같다 —
 * 붙이면 시험에서 못 부르는데, 이 규칙이야말로 시험으로 지켜야 하는 것이다.
 *
 * **여기서 나온 바이트에는 AI 표기가 없다.**
 *
 * `markAsAi`(`apps/web/lib/watermark.ts:31`)가 굽는 배지는 오른쪽 아래에 있어
 * **크롭이 잘라내고 축소가 뭉갠다** — 214×214 에서 배지 높이는 5px 이하다.
 * 설계 §4.3(계약 7)은 그래서 **파생 뒤에 다시 태우기로** 결론지었다. 배지 크기가
 * 캔버스 너비에 비례하므로 그때 태우면 규격마다 알아서 맞는다.
 *
 * 그 의무는 이 함수를 부르는 쪽(2단계 내려받기)에 있다. 여기서 태우지 않는 이유는
 * 배지를 켤지가 관리자 설정이고, 이 함수는 그 설정을 모르는 자리이기 때문이다.
 */

/**
 * 낯선 바이트를 받는 문이 아니라 이미 창고에 있는 파일을 읽는 자리다.
 * `grid-thumbnail.ts` 의 `GRID_MAX_PIXELS` 와 같은 값·같은 이유.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/** 품질 탐색 범위. 40 아래로 내려가면 글자가 뭉개져 광고로 못 쓴다. */
const QUALITY_MAX = 92;
const QUALITY_MIN = 40;

export interface AdExport {
  bytes: Buffer;
  /** 실제로 쓴 품질. 상한이 빡빡할수록 낮아진다. */
  quality: number;
}

function encode(pipeline: ReturnType<typeof sharp>, spec: AdSpec, quality: number): Promise<Buffer> {
  // **메타데이터를 지운다.** sharp 는 기본으로 안 옮기므로 `keepMetadata()` 를
  // 부르지 않는 것이 곧 지우는 것이다. 200KB 예산에서 ICC·EXIF 는 사치다.
  return spec.format === "png"
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
}

export async function exportForAd(
  master: Buffer,
  spec: AdSpec,
  plan: DerivePlan,
): Promise<AdExport | { failed: string }> {
  if (plan.kind === "unsupported" || plan.kind === "upload") {
    return { failed: plan.reason };
  }

  try {
    const meta = await sharp(master, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
    if (!size.width || !size.height) return { failed: "마스터를 읽지 못했습니다." };

    /**
     * **확대를 여기서 한 번 더 막는다.**
     *
     * `planDerivation` 은 마스터 **목록**을 보고 정하는데, 실제로 들어온
     * 바이트가 그 마스터라는 보장이 없다 — 사용자가 다른 그림을 고를 수도 있고,
     * 마스터 정의가 바뀌었을 수도 있다. 계획이 아니라 **받은 바이트**를 본다.
     *
     * `derive.ts` 의 `usable` 과 같은 이유로 **크롭 결과가 아니라 원본 크기를
     * 정수로 비교한다.** 크롭 결과는 목표 비율을 정확히 갖게 되므로
     * `가로 ≥ 목표` 와 `세로 ≥ 목표` 가 서로 동치가 되어, 한쪽 조건이 도달
     * 불가능한 죽은 가지가 된다. 원본 크기끼리는 둘이 독립이다 — 1600×300 은
     * 1200×628 에 대해 가로만 충분하다.
     */
    if (size.width < spec.target.width || size.height < spec.target.height) {
      return {
        failed: `원본이 작아 ${spec.target.width}×${spec.target.height} 를 만들려면 늘려야 합니다.`
          + " 늘리면 흐려져 광고 심사에서 반려됩니다.",
      };
    }

    /**
     * **중앙에서 자른다.**
     *
     * 설계 §3.3 은 「`safeArea` 가 있으면 그 영역이 살아남는 쪽으로 치우쳐
     * 자른다」고 적었는데, **아직 구현하지 않았다.** 지금 크롭하는 셋
     * (`naver-gfa-main`·`naver-brand-pc`·`naver-brand-mobile`)에는 `safeArea` 가
     * 없고, `safeArea` 를 가진 카카오 넷은 전부 `resize` 라 치우칠 일이 없다.
     * 필요해지는 규격이 생기면 그때 붙인다.
     */
    const base = () =>
      sharp(master, { limitInputPixels: MAX_INPUT_PIXELS })
        .resize(spec.target.width, spec.target.height, { fit: "cover", position: "centre" });

    /**
     * PNG 는 품질 손잡이가 없다. 한 번 만들고 상한만 본다.
     *
     * **이 갈래는 아직 아무도 안 밟는다.** `format: "png"` 인 규격은
     * `google-rda-logo` 하나뿐인데 `supply: "upload"` 라 위에서 이미 실패로 빠진다.
     * 2단계에서 업로드받은 로고를 이 함수에 통과시키면 그때 처음 실행된다 —
     * 그 전까지는 시험이 못 덮는 코드다.
     */
    if (spec.format === "png") {
      const bytes = await encode(base(), spec, QUALITY_MAX);
      if (spec.maxBytes && bytes.length > spec.maxBytes) {
        return { failed: `${Math.round(bytes.length / 1024)}KB 로 상한 ${Math.round(spec.maxBytes / 1024)}KB 를 넘습니다.` };
      }
      return { bytes, quality: QUALITY_MAX };
    }

    /**
     * 상한 안에 드는 **가장 높은 품질**을 이분 탐색으로 찾는다.
     *
     * 상한이 없으면 탐색할 것이 없다 — 최고 품질로 한 번만 만든다.
     */
    const first = await encode(base(), spec, QUALITY_MAX);
    if (!spec.maxBytes || first.length <= spec.maxBytes) {
      return { bytes: first, quality: QUALITY_MAX };
    }

    let low = QUALITY_MIN;
    let high = QUALITY_MAX;
    let best: AdExport | null = null;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const bytes = await encode(base(), spec, mid);
      if (bytes.length <= spec.maxBytes) {
        best = { bytes, quality: mid };
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (!best) {
      // **조용히 넘기지 않는다.** 상한을 넘은 파일은 포털이 거부한다.
      // 광고 심사에서 반려되고 나서 아는 것보다 지금 아는 것이 낫다.
      return {
        failed: `품질 ${QUALITY_MIN} 까지 낮춰도 상한 ${Math.round(spec.maxBytes / 1024)}KB 안에`
          + " 못 들어갑니다. 글자가 적은 시안으로 다시 만들어 보세요.",
      };
    }
    return best;
  } catch (error) {
    return { failed: error instanceof Error ? error.message : String(error) };
  }
}
