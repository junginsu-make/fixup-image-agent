import { objectPlacement, type Box, type Placement } from "./layout-rules";

/**
 * 투명 캔버스에 오브젝트를 얹어 배너를 만든다.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §3.1 · §6
 *
 * **모델이 못 만드는 비율을 여기서 만든다.** 비즈보드는 3.99:1, 스마트채널은
 * 4.69:1 이라 `gpt-image-2` 의 3:1 상한을 넘는다. **캔버스를 우리가 만들면 그
 * 상한이 상관없어진다.**
 *
 * **`compose.ts` 를 안 쓴다.** 그 함수는 「흰 카드 한 장」을 전제한다
 * (`:258` 이 `background: "#FFFFFF"` 고정). 고치면 카드뉴스가 함께 바뀌므로
 * 계약 1 위반이다. 광고 배너는 투명 캔버스이고 슬롯도 단순해서 여기서 직접
 * 만드는 편이 낫다(설계 §2.2).
 */

/** 오브젝트가 비어 있을 때의 말. 시험이 이 문자열로 잡는다. */
export const EMPTY_OBJECT = "배경을 지운 그림이 비어 있습니다";

/**
 * 오브젝트에 보이는 픽셀이 있는가.
 *
 * **`trim` 은 방어가 안 된다.** 완전히 투명한 800×600 을 `trim({threshold:1})`
 * 에 넣으면 **800×600 이 그대로 나온다** — 던지지도, 0×0 이 되지도 않는다
 * (실측). 그래서 배경 제거가 통째로 실패해도 파이프라인 어디에서도 신호가 안
 * 나고, 그 결과는 픽셀·형식·알파·용량 검사를 **전부 통과한다**(설계 §6.2).
 */
/**
 * 이 파일이 다루는 바이트는 **외부 URL 에서 받은 것**이다(fal 이 돌려준 결과).
 * 저장소가 sharp 를 부르는 다른 자리는 전부 이 상한을 건다 — `check.ts:34`,
 * `export.ts:34`, `batch.ts`. 여기만 빼면 관례가 깨진 자리가 하필 **유일한
 * 외부 입구**가 된다.
 */
const MAX_INPUT_PIXELS = 40_000_000;

async function hasVisiblePixels(
  sharpLib: (
    input: Buffer,
    options?: { limitInputPixels: number },
  ) => { stats(): Promise<{ channels: Array<{ max: number }> }> },
  bytes: Buffer,
): Promise<boolean> {
  const stats = await sharpLib(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).stats();
  const alpha = stats.channels[stats.channels.length - 1];
  // 알파가 없으면 불투명한 그림이다. 있으면 최댓값이 0 보다 커야 뭔가 보인다.
  return stats.channels.length < 4 || (alpha?.max ?? 0) > 0;
}

/**
 * 배너 한 장.
 *
 * 오브젝트를 오른쪽에 세로 가운데로 놓고 왼쪽을 비운다 — 광고주가 글자를 얹을
 * 자리다. 어디에 얼마나 크게 놓을지는 `layout-rules.ts` 가 정한다(순수 함수).
 */
export interface AssembledBanner {
  bytes: Buffer;
  /**
   * 오브젝트를 어디에 얼마나 크게 놓았는가.
   *
   * **부르는 쪽이 이것으로 「너무 작다」를 판단한다**(설계 §5.4②). 안 돌려주면
   * `isTooSmall` 을 부를 자리가 없어 **폭 6% 짜리 조각이 「검증 통과」로 나간다.**
   */
  placement: Placement;
}

export async function assembleBanner(canvas: Box, object: Buffer): Promise<AssembledBanner> {
  // sharp 를 여기서만 부르려고 동적으로 들인다 — `batch.ts` 가 쓰는 방식이다.
  const { default: sharp } = await import("sharp");

  if (!(await hasVisiblePixels(sharp, object))) throw new Error(EMPTY_OBJECT);

  // 여백을 잘라 실제 피사체 크기로 잰다. 안 자르면 투명 여백까지 크기로 세어
  // 오브젝트가 실제보다 작게 놓인다.
  const trimmed = await sharp(object, { limitInputPixels: MAX_INPUT_PIXELS }).trim().png().toBuffer();
  const meta = await sharp(trimmed, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error(EMPTY_OBJECT);

  const place = objectPlacement(canvas, { width: meta.width, height: meta.height });
  const scaled = await sharp(trimmed, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(place.width, place.height, { fit: "fill" })
    .png()
    .toBuffer();

  const bytes = await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      // **투명이다.** `compose.ts` 가 흰색으로 고정한 그 자리다.
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left: place.left, top: place.top }])
    .png()
    .toBuffer();

  return { bytes, placement: place };
}
