import sharp from "sharp";

/**
 * 「1080×1920」을 고르면 **정말 1080×1920 이 나오게** 한다(2026-09-23 사용자 결정).
 *
 * 전에는 「9:16」과 「1080×1920」이 코어에서 둘 다 1152×2048 로 바뀌었다
 * (`redesign-core` 의 `SIZE_BY_RATIO`). 이름만 다른 같은 선택지였다.
 *
 * 그리는 모델은 픽셀 크기를 정확히 지키지 않는다 — 어떤 모델은 비율만 본다.
 * 그래서 요청은 지금처럼 하고, **다 만든 그림을 서버에서 정확한 크기로
 * 맞춘다.** 1152×2048 과 1080×1920 은 같은 9:16 이라 잘리는 곳 없이 줄어든다.
 * 모델이 모양을 조금 달리 그리면(1536×2752 는 약 0.8% 차이) 가장자리를 그만큼만
 * 잘라 맞춘다. **모양이 크게 다르면(정사각 등) 자르지 않고 원본을 둔다.**
 */

/** 이만큼 넘게 모양이 다르면 자르지 않는다. 9:16 을 조금 벗어난 출력만 맞춘다. */
const MAX_ASPECT_DRIFT = 0.03;

const EXACT_SIZES: Record<string, { width: number; height: number }> = {
  "1080×1920": { width: 1080, height: 1920 },
  "1080x1920": { width: 1080, height: 1920 },
};

/** 이 비율이 정확한 출력 크기를 요구하면 그 크기, 아니면 `null`. */
export function exactOutputSize(ratio: string | undefined | null): { width: number; height: number } | null {
  return EXACT_SIZES[String(ratio ?? "").trim()] ?? null;
}

/**
 * data URL 그림을 정확한 크기로 맞춘다.
 *
 * - **화질을 깎지 않는다**: 가장 선명한 축소 필터(lanczos3), PNG 는 무손실,
 *   JPEG·WEBP 는 품질 95. 형식은 바꾸지 않는다
 * - 비율이 조금 다르면 가운데를 기준으로 가장자리를 아주 조금 잘라 맞춘다
 * - 이미 그 크기면 손대지 않는다 — 다시 압축할 이유가 없다
 * - **어떤 경우에도 던지지 않는다.** 그림이 아니거나, 깨졌거나, 모양이 크게
 *   다르면 원본을 그대로 돌려준다. 값은 이미 나갔다 — 크기 맞추기 때문에 만든
 *   결과를 잃으면 안 된다(독립 리뷰)
 */
export async function fitDataUrlToSize(dataUrl: string, size: { width: number; height: number }): Promise<string> {
  const matched = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!matched) return dataUrl;
  const input = Buffer.from(matched[2]!, "base64");

  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return dataUrl;
    if (meta.width === size.width && meta.height === size.height) return dataUrl;

    const drift = Math.abs(meta.width / meta.height - size.width / size.height) / (size.width / size.height);
    if (drift > MAX_ASPECT_DRIFT) {
      console.warn(`[redesign:exact-size] 모양이 달라 맞추지 않음 ${meta.width}x${meta.height} → ${size.width}x${size.height}`);
      return dataUrl;
    }

    const resized = sharp(input).resize(size.width, size.height, { fit: "cover", position: "centre", kernel: "lanczos3" });
    const format = meta.format === "jpeg" ? "jpeg" : meta.format === "webp" ? "webp" : "png";
    const output =
      format === "jpeg"
        ? await resized.jpeg({ quality: 95, mozjpeg: true }).toBuffer()
        : format === "webp"
          ? await resized.webp({ quality: 95 }).toBuffer()
          : await resized.png().toBuffer();
    const outMime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    return `data:${outMime};base64,${output.toString("base64")}`;
  } catch (error) {
    console.error("[redesign:exact-size] 크기를 맞추지 못해 원본을 둡니다", error);
    return dataUrl;
  }
}
