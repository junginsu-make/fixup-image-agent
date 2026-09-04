// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";

/**
 * 저장 직전에 한 번 태우는 인코딩.
 *
 * 만든 그림은 지금 PNG 로 다시 구워 저장한다. 그런데 sharp 의 기본 PNG 압축이
 * 약해서, 받은 것보다 **30~56% 커진 채로** 쌓이고 있었다. 무손실 WebP 로 바꾸면
 * 그 절반 아래가 된다 — 픽셀은 한 톨도 바뀌지 않으면서.
 *
 * 이 파일이 지키는 약속은 셋이다.
 *
 * 1. **픽셀은 바뀌지 않는다.** 글자가 많고 결이 복잡한 그림을 다루는 제품이라
 *    화질을 내주는 순간 절감은 의미가 없다. 손실 압축은 쓰지 않고, 무손실로도
 *    담을 수 없는 그림(16비트, 완전 투명 영역)은 아예 손대지 않는다.
 * 2. **작아질 때만 바꾼다.** 아니면 받은 바이트를 그대로 돌려준다. 그래서 어떤
 *    그림이 들어와도 용량이 늘어나는 일이 구조적으로 없다.
 * 3. **실패해도 그림을 잃지 않는다.** 못 줄이는 것보다 잃는 것이 훨씬 나쁘다.
 */

/**
 * 여기까지만 펼친다.
 *
 * sharp 기본값은 268MP 이고, 그것을 RGBA 로 펼치면 1GB 가 넘는다. 운영기에
 * 그만한 여유가 없다. 16383×16383 짜리 단색 PNG 는 수백 KB 로 눌리므로,
 * 작은 파일 한 장으로 서버를 넘어뜨릴 수 있다는 뜻이다.
 *
 * 실측한 최대 메모리(결이 있는 그림 기준):
 *   2.7MP(제품 실사용 최대) 48MB · 10MP 218MB · 12MP 152MB · 39.7MP 483MB
 *
 * 무손실 인코더는 그림 전체를 메모리에 올려야 해서 libvips 의 스트리밍 이점이
 * 사라진다. 40MP 로 두면 **1.5MB 짜리 파일 한 장이 483MB 를 잡아** 운영 여유를
 * 한 건에 넘긴다. 12MP 는 152MB 로, 제품이 실제로 쓰는 2.7MP 의 4.4배 여유다.
 * 넘으면 sharp 가 던지고, 아래 갈래가 원본을 그대로 돌려준다.
 */
export const MAX_INPUT_PIXELS = 12_000_000;

/** 목록에 거는 파생본의 긴 변. */
const THUMBNAIL_EDGE = 512;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface StoredImage {
  bytes: Buffer;
  /** **항상 실제 바이트로 정한 값이다.** 부르는 쪽이 준 딱지가 아니다. */
  mimeType: string;
  converted: boolean;
}

/**
 * 이 바이트가 무엇인가.
 *
 * 확장자와 content-type 은 화면이 알려준 값이라, 그대로 쓰면 `.jpg` 라는 이름의
 * PNG 가 `image/jpeg` 로 저장된다. 브라우저가 못 여는 파일이 된다. 그래서
 * **올리기 직전 실제 바이트를 보고** 정한다.
 *
 * GIF 는 여기서 판정하지 않는다. 애니메이션 방어를 이 함수에 기대면 안 되기
 * 때문이다 — APNG 는 첫 여덟 바이트가 규격상 PNG 와 완전히 같아서 시그니처로는
 * 갈라낼 수 없다. 프레임을 지키는 일은 `encodeForStorage` 의 `isAnimatedPng`
 * 가 맡는다.
 */
export function sniffImageMime(bytes: Buffer, fallback: string): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return fallback;
}

const PNG_HEADER_BYTES = 8;
const CHUNK_HEADER_BYTES = 8;
const CHUNK_CRC_BYTES = 4;

/**
 * 움직이는 PNG 인가.
 *
 * **바이트를 직접 뒤지는 수밖에 없다.** APNG 는 첫 여덟 바이트가 규격상 표준
 * PNG 와 같아 시그니처로 못 가르고, libvips 8.18.3 은 APNG 를 아예 읽지 못해
 * `pages` 를 `undefined` 로 준다. 그리고 한 장으로 줄어든 결과는 원본보다
 * 작아서 크기 가드마저 통과한다 — 세 방어가 모두 통과시킨다.
 *
 * `acTL` 은 규격상 첫 `IDAT` 앞에 와야 하므로 거기까지만 본다. 문자열을 통째로
 * 찾지 않는 것은, 그림 데이터 안에 우연히 같은 네 글자가 들어 있으면 멀쩡한
 * 그림을 못 줄이기 때문이다.
 */
function isAnimatedPng(bytes: Buffer): boolean {
  let at = PNG_HEADER_BYTES;
  while (at + CHUNK_HEADER_BYTES <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + CHUNK_HEADER_BYTES);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    at += CHUNK_HEADER_BYTES + length + CHUNK_CRC_BYTES;
  }
  return false;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 손대지 않고 돌려보낸다. */
function untouched(bytes: Buffer, fallbackMime: string): StoredImage {
  return { bytes, mimeType: sniffImageMime(bytes, fallbackMime), converted: false };
}

export type ImageEncoder = (bytes: Buffer) => Promise<Buffer>;

/**
 * 무손실 WebP.
 *
 * `keepMetadata()` 를 빼면 **ICC 프로파일이 사라진다.** 픽셀은 그대로인데
 * 색 프로파일만 없어지므로, Display P3 나 AdobeRGB 로 내보낸 그림이 sRGB 로
 * 해석되어 색이 눈에 띄게 바뀐다. 픽셀이 같다는 말과 보이는 색이 같다는 말은
 * 다르다. 실측으로 값은 거의 없다 — 1914KB 짜리에 212B 붙는다.
 */
const losslessWebp: ImageEncoder = (bytes) =>
  sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .keepMetadata()
    .webp({ lossless: true, effort: 4 })
    .toBuffer();

/**
 * 저장할 바이트를 정한다.
 *
 * PNG 만 손댄다. JPEG 는 이미 눌려 있어 무손실로 다시 구우면 커지기만 하고,
 * WebP 는 이미 목적지 형식이며, 그 밖의 형식은 sharp 를 태우면 잃는 것이
 * 생긴다. 애니메이션은 아래에서 따로 걸러낸다.
 *
 * `encode` 를 밖에서 넣을 수 있게 둔 것은 **「작을 때만 바꾼다」 규칙을
 * 시험하기 위해서다.** 실제 그림으로는 무손실 WebP 가 PNG 보다 커지는 입력을
 * 만들 수 없어서, 그 갈래가 영영 검증되지 않은 채 남는다. 그 규칙 하나가
 * 용량이 늘어나는 일을 막는 유일한 장치라 반드시 붙잡아 두어야 한다.
 */
export async function encodeForStorage(
  bytes: Buffer,
  fallbackMime: string,
  encode: ImageEncoder = losslessWebp,
): Promise<StoredImage> {
  const mimeType = sniffImageMime(bytes, fallbackMime);
  if (mimeType !== "image/png") return untouched(bytes, fallbackMime);

  try {
    // **프레임이 여럿이면 손대지 않는다.** sharp 로 구우면 첫 장만 남는데,
    // 한 장으로 줄어든 결과물은 원본보다 작아서 「작을 때만」 규칙을 그냥
    // 통과한다. 즉 이 확인이 없으면 움직이는 그림이 조용히 멈춘다.
    // 움직이는 그림은 손대지 않는다 — sharp 로 구우면 첫 장만 남는데, 그
    // 결과는 원본보다 작아서 아래 크기 가드를 그냥 통과한다.
    if (isAnimatedPng(bytes)) return untouched(bytes, fallbackMime);

    const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    // GIF 가 `image/png` 딱지를 달고 들어오는 경우를 여기서 잡는다. PNG 입력에
    // 대해서는 `pages` 가 언제나 `undefined` 라 위의 acTL 확인이 본 방어다.
    if ((meta.pages ?? 1) > 1) return untouched(bytes, fallbackMime);

    // **WebP 는 채널당 8비트뿐이다.** 16비트 그림을 넣으면 8비트로 떨어지는데,
    // 그 결과는 언제나 작아서 아래 크기 가드가 방어가 아니라 통과 도장이 된다.
    // 여기서 막지 않으면 그라데이션에 밴딩이 생긴 채 저장된다.
    if (meta.depth !== "uchar") return untouched(bytes, fallbackMime);

    // **완전히 투명한 픽셀이 하나라도 있으면 손대지 않는다.** libwebp 는
    // `exact` 가 꺼져 있으면 보이지 않는 영역의 RGB 를 버리는데, sharp 가 그
    // 옵션을 열어 주지 않는다. 지워진 색은 그림을 늘이거나 줄일 때 경계로
    // 배어 나온다.
    //
    // 알파 채널이 있다는 것만으로 포기하지는 않는다 — 채널만 있고 전부
    // 불투명한 그림이 흔하고, 그때는 잃는 것이 없다. 그래서 실제로 0 이
    // 있는지 본다. 값은 있다: 인코딩이 685ms 인 그림에서 이 확인이 75ms 다.
    if (meta.hasAlpha) {
      const alpha = (await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).stats()).channels[3];
      if (!alpha || alpha.min === 0) return untouched(bytes, fallbackMime);
    }

    const encoded = await encode(bytes);

    if (encoded.length >= bytes.length) return untouched(bytes, fallbackMime);
    return { bytes: encoded, mimeType: "image/webp", converted: true };
  } catch (error) {
    // 너무 크거나, 깨졌거나, 형식을 모른다. 어느 쪽이든 원본이 답이다.
    //
    // **한 줄 남긴다.** 이 갈래는 조용히 실패해도 화면이 멀쩡하고 시험도
    // 통과한다 — 예전과 똑같이 동작하며 절감만 0 이 된다. 로그가 없으면
    // 운영기에서 인코딩이 전량 실패해도 저장소를 눈으로 뒤지기 전에는
    // 알아챌 방법이 없다.
    console.error(`[image-encoding] ${bytes.length}바이트를 줄이지 못했습니다: ${describe(error)}`);
    return untouched(bytes, fallbackMime);
  }
}

/**
 * 목록에 걸 작은 사본.
 *
 * 원본과 별개 파일이라 원본 품질에는 영향이 없다. 목록은 지금 원본을 통째로
 * 내려받는데, 표지 한 장이 2~4MB 라 목록을 한 번 여는 값이 저장 용량보다 크다.
 *
 * **못 만들면 `null` 이다.** 썸네일 때문에 저장이 막히면 안 된다.
 */
export async function makeThumbnail(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      .resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (error) {
    console.error(`[image-encoding] 썸네일을 만들지 못했습니다: ${describe(error)}`);
    return null;
  }
}

/**
 * 내보낼 때 PNG 로 되돌린다.
 *
 * 무손실로 넣었으므로 되돌린 픽셀은 원본과 완전히 같다. 손실로 저장했다면
 * 이 되돌리기는 거짓말이 됐을 것이다.
 */
export async function toPng(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).keepMetadata().png().toBuffer();
}
