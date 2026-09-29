import "server-only";

import sharp from "sharp";
import { MAX_INPUT_PIXELS, isAnimatedPng } from "./image-encoding";
import { AI_METADATA } from "./ai-metadata-values";

/**
 * **파일 안에 「AI 가 만들었다」를 적는다**(2026-09-29 사용자 요청).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 *
 * 인공지능기본법 제31조가 2026-01-22 부터 시행 중이다. 생성형 AI 서비스를
 * 제공하는 사업자는 **결과물이 AI 로 생성되었다는 사실을 표시**해야 하고,
 * 다운로드·공유로 서비스 밖으로 나갈 수 있으면 **파일 자체에** 표시가 들어가야
 * 한다. 조사한 내용은 `docs/ai-labeling-law.html` 에 정리해 두었다.
 *
 * 표시 방법은 둘 중 하나를 고를 수 있다.
 *
 *     사람이 인식할 수 있는 방법   화면 안 로고·문구, 그림 위 배지
 *     기계가 판독할 수 있는 방법   디지털 워터마킹, **메타데이터**
 *
 * 우리는 배지를 굽고 있다(`watermark.ts`). 그런데 **관리자가 그것을 끌 수
 * 있다.** 끄면 파일에 표시가 하나도 안 남고, 그 상태로 내려받은 그림이
 * 밖으로 나가면 요건을 못 채운다.
 *
 * 여기가 그 구멍을 메운다 — **배지를 켜든 끄든 이것은 항상 들어간다.**
 *
 * ── 왜 EXIF 인가 ───────────────────────────────────────────
 *
 * 표준으로는 IPTC 의 `DigitalSourceType`(XMP) 가 낫다. 구글·메타가 AI 라벨을
 * 붙일 때 읽는 값이 그것이다. 그런데 **이 판의 sharp 가 XMP 를 못 쓴다**
 * (0.35.4 / libvips 8.18.6 에서 실측). 무손실 WebP 도 `VP8L` 단순 컨테이너로
 * 나와서 메타데이터를 담을 자리가 아예 없고, 넣으려면 `VP8X` 확장 컨테이너로
 * 다시 조립해야 한다.
 *
 * **법이 요구하는 것은 EXIF 로도 충족된다** — 조문은 형식을 지정하지 않는다.
 * 그래서 먼저 EXIF 로 요건을 채우고, 구글 라벨이 필요해지면 그때 XMP 를
 * 얹는다. 지금 한 일을 버리지 않는다.
 *
 * ── 실패해도 그림을 돌려준다 ───────────────────────────────
 *
 * 표시를 못 넣었다고 만든 그림을 잃는 것이 훨씬 나쁘다. `watermark.ts` 와
 * 같은 판단이다.
 *
 * ── 그림을 해치면서까지 적지는 않는다 ──────────────────────
 *
 * 이 단계는 그림을 **다시 굽는다.** 그래서 손실 압축으로 들어온 그림은 손대지
 * 않는다 — 다시 구우면 2세대 손실이 쌓인다. 실측(2026-09-29):
 *
 *     q80 JPEG        383KB → 543KB (×1.42), 화소 90% 가 바뀌고 채널 최대차 50
 *     손실 WebP       387KB → 1,186KB (×3.07)
 *     16비트 PNG      depth 가 ushort → uchar (그라데이션에 밴딩)
 *
 * 세 경우 다 **표시를 포기하고 원본을 준다.** 저장 경로가 같은 이유로 같은
 * 판단을 이미 하고 있다(`image-encoding.ts` 의 깊이·형식 가드).
 *
 * 그래서 지금 표시가 들어가는 것은 **PNG 와 무손실 WebP** 다. 제품이 실제로
 * 만들어 내는 것이 PNG 라(`packages/pdp-core` 가 `"png"` 로 못 박았다) 요건은
 * 그 길에서 채워진다. 손실 형식까지 덮으려면 **다시 굽지 않고** 컨테이너에
 * 조각만 끼워야 한다(PNG 는 `eXIf` 청크, JPEG 는 `APP1` 세그먼트). 그것이
 * XMP 와 함께 갈 다음 차례다.
 */

// 값은 `ai-metadata-values.ts` 에 있다 — 서버 전용이 아닌 곳에서도 읽어야 한다.
export { AI_METADATA };

const RIFF_HEADER_BYTES = 12;
const RIFF_CHUNK_HEADER_BYTES = 8;

/**
 * 무손실 WebP 인가.
 *
 * **sharp 가 알려주지 않는다.** `metadata()` 에 손실·무손실 칸이 없어서
 * 컨테이너를 직접 봐야 한다. 규격은 셋이다(2026-09-29 실측으로 확인).
 *
 *     VP8      손실
 *     VP8L     무손실
 *     VP8X     확장 — 안에 `VP8` 또는 `VP8L` 이 들어 있다. 그것을 찾아야 한다.
 *
 * 우리가 굽는 무손실 WebP 는 `VP8L` 이고, 표시를 붙이면 `VP8X` 로 바뀐다
 * (메타데이터를 담을 자리가 확장 컨테이너에만 있다). 그래서 이미 표시가 붙은
 * 것을 다시 넣어도 무손실로 남는다.
 *
 * **모르겠으면 손실로 본다.** 잘못 무손실로 보면 손실 그림을 3배로 부풀린다.
 */
function isLosslessWebp(bytes: Buffer): boolean {
  if (bytes.length < RIFF_HEADER_BYTES + RIFF_CHUNK_HEADER_BYTES) return false;

  const 첫청크 = bytes.toString("ascii", RIFF_HEADER_BYTES, RIFF_HEADER_BYTES + 4);
  if (첫청크 === "VP8L") return true;
  if (첫청크 !== "VP8X") return false;

  // 확장 컨테이너는 청크를 걸어가며 화소가 어느 규격으로 들어 있는지 찾는다.
  let at = RIFF_HEADER_BYTES;
  while (at + RIFF_CHUNK_HEADER_BYTES <= bytes.length) {
    const type = bytes.toString("ascii", at, at + 4);
    if (type === "VP8L") return true;
    if (type === "VP8 ") return false;
    const size = bytes.readUInt32LE(at + 4);
    // RIFF 청크는 짝수 경계에 놓인다. 홀수면 한 바이트가 덧붙는다.
    at += RIFF_CHUNK_HEADER_BYTES + size + (size % 2);
  }
  return false;
}

/**
 * 만든 그림이라는 표시를 파일에 적는다.
 *
 * **`Software` 와 `ImageDescription` 을 쓴다.** 둘 다 표준 EXIF 칸이라
 * 윈도 파일 속성에서도 보이고, 지우려면 일부러 지워야 한다.
 *
 * `UserComment` 에 `DigitalSourceType` 을 함께 적는다. IPTC 표준값을 그대로
 * 넣어 두면, 나중에 XMP 로 옮길 때 값을 다시 정하지 않아도 된다.
 */
export async function stampAiMetadata(bytes: Buffer): Promise<Buffer> {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();

    /*
      **움직이는 그림은 손대지 않는다.** sharp 로 다시 구우면 첫 장만 남는다.

      **두 가지로 갈라야 한다. 한쪽만으로는 다른 쪽을 놓친다**(2026-09-29 실측).

          APNG            `pages` 가 `undefined` — libvips 가 APNG 를 아예
                          못 읽는다. 그래서 바이트에서 `acTL` 을 찾는다.
          움직이는 WebP    `pages` 가 2 로 제대로 온다. `acTL` 은 PNG 청크라
                          여기서는 안 걸린다.

      `acTL` 검사는 `image-encoding.ts` 가 쓰는 것을 그대로 가져다 쓴다 — 두 벌로
      두면 한쪽만 고쳐진다.

      **`pages` 줄은 지금 중복이다.** 움직이는 WebP 는 최상위 청크가
      `VP8X,ANIM,ANMF,ANMF` 라 화소가 `ANMF` 안에 들어 있고, 그래서 아래
      `isLosslessWebp` 가 그것을 못 찾아 「손실」로 보고 먼저 막는다. 즉 이 줄을
      빼도 결과가 같다(2026-09-29 변이 시험에서 초록으로 남았다 — 시험이 약한
      것이 아니라 아래 가드에 포섭된 것이다).

      **그래도 남긴다.** 아래 판정이 언젠가 `ANMF` 안을 보게 되면, 움직이는
      무손실 WebP 를 막는 것은 이 줄 하나가 된다. 그날 이 줄이 없으면 움직임이
      조용히 죽는다.
    */
    if (isAnimatedPng(bytes)) return bytes;
    if ((meta.pages ?? 1) > 1) return bytes;

    /*
      **원래 형식 그대로 다시 굽는다.** 형식을 바꾸면 저장 경로가 세운 규칙
      (무손실 유지·용량 가드)을 이 단계가 앞질러 간다.

      **JPEG 는 빠졌다.** 다시 구우면 2세대 손실이 쌓인다 — q95 로 구워 보니
      화소 90% 가 바뀌고 용량이 1.42배가 됐다(2026-09-29 실측). 저장 경로도
      같은 이유로 JPEG 를 안 건드린다.
    */
    const format = meta.format;
    if (format !== "png" && format !== "webp") return bytes;

    /*
      **손실 WebP 도 빼야 한다.** 여기서 무손실로 다시 구우면 3.07배가 된다
      (2026-09-29 실측). 형식 이름만으로는 못 가른다 — sharp 가 손실·무손실을
      알려주지 않아서 컨테이너를 직접 본다.
    */
    if (format === "webp" && !isLosslessWebp(bytes)) return bytes;

    /*
      **16비트 그림은 손대지 않는다.** 다시 구우면 8비트로 떨어져 그라데이션에
      밴딩이 생긴다. `image-encoding.ts` 가 바로 이것을 막는데, 그 가드는 **이
      단계 뒤에** 있다 — 여기서 먼저 떨어뜨리면 그 가드가 방어가 아니라 통과
      도장이 된다(2026-09-29 독립 검토가 찾았다).
    */
    if (meta.depth !== "uchar") return bytes;

    /*
      **`keepMetadata()` 와 `withExif()` 를 쓴다. `withMetadata({ exif })` 를
      쓰면 안 된다** — 그것은 들어온 ICC 프로파일을 **sRGB 로 갈아치운다**
      (2026-09-29 실측: Display P3 태그가 붙은 PNG 를 넣으면 화소는 그대로인데
      프로파일만 sRGB 로 바뀐다). 프로파일이 사라지는 것보다 나쁘다 — 파일이
      P3 숫자를 두고 「이것은 sRGB 다」라고 거짓 선언하게 되어 모든 뷰어가
      색을 틀리게 그린다. 태그가 없던 그림에는 480바이트 sRGB 를 새로 끼워
      넣기까지 한다.

      `keepMetadata()` 는 들어온 프로파일을 바이트 단위로 그대로 지킨다.
    */
    const withExif = image.keepMetadata().withExif({
      IFD0: {
        Software: AI_METADATA.software,
        ImageDescription: AI_METADATA.description,
      },
      IFD2: {
        // EXIF 서브 IFD. 뷰어가 「설명」으로 읽는 자리다.
        UserComment: `DigitalSourceType=${AI_METADATA.digitalSourceType}`,
      },
    });

    if (format === "png") return await withExif.png().toBuffer();
    return await withExif.webp({ lossless: true, effort: 4 }).toBuffer();
  } catch {
    // 표시를 못 넣었다고 그림을 잃을 수는 없다.
    return bytes;
  }
}

/** 파일에 그 표시가 들어 있나. 시험과 확인용. */
export async function hasAiMetadata(bytes: Buffer): Promise<boolean> {
  try {
    const { exif } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!exif) return false;
    return exif.toString("latin1").includes(AI_METADATA.software);
  } catch {
    return false;
  }
}
