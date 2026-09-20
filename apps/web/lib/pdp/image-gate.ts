import "server-only";
import sharp from "sharp";
import { sniffImageMime } from "../image-encoding";
import { STYLE_REFERENCE_MAX_PIXELS } from "./reference-limits";

/**
 * **낯선 바이트를 받는 문.**
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 레퍼런스를 올리는 길(`/api/pdp/style-references`)에는 문지기가 없었다.
 * `await req.json()` 한 줄로 받아 base64 를 그대로 창고에 올린다. 딱지가
 * `image/png` 면 글자 몇 개라도 PNG 로 저장되고, 목록에 깨진 칸으로 남는다.
 *
 * 더 나쁜 것은 크기다. **16383×16383 단색 PNG 는 수백 KB 로 눌린다.** 펼치면
 * 1GB 가 넘는다. 작은 파일 한 장으로 서버를 넘어뜨릴 수 있다는 뜻이다.
 *
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·**MIME
 * signature·이미지 픽셀**을 제한한다.」
 *
 * 상한의 근거와 실측은 `reference-limits.ts` 에 적어 두었다. 화면도 같은 값을
 * 읽는다 — §12 의 「정책 상수와 UI 에서 일치」다.
 */

/**
 * 우리가 바이트로 알아볼 수 있는 종류. 모르는 것은 그림으로 치지 않는다.
 *
 * 화면의 `accept` 와 같은 셋이다. GIF·SVG 는 여기서 막힌다(실측 확인).
 *
 * **움직이는 PNG(APNG)는 통과한다.** 첫 여덟 바이트가 규격상 표준 PNG 와 같아
 * 시그니처로 못 가른다 — `image-encoding.ts` 의 `isAnimatedPng` 가 그래서 따로
 * 있는데, 이 길은 그 인코딩을 안 탄다. 위험하지는 않다: 바이트 상한 안이고
 * libvips 가 프레임을 못 읽어 증폭이 없다. 다만 **원본은 움직이고, 사본과
 * 조각은 첫 장만 보인다.** 막을 일은 아니라 적어만 둔다.
 */
const KNOWN = ["image/png", "image/jpeg", "image/webp"] as const;

export type ImageGateFailure = "not_an_image" | "too_many_pixels" | "unreadable";

export type ImageGateResult =
  | { ok: true; mimeType: string; width: number; height: number }
  | { ok: false; reason: ImageGateFailure; message: string };

const MESSAGE: Record<ImageGateFailure, string> = {
  not_an_image: "이미지 파일만 올릴 수 있습니다. PNG, JPEG, WebP 를 지원합니다.",
  too_many_pixels: `이미지가 너무 큽니다. ${STYLE_REFERENCE_MAX_PIXELS / 1_000_000}백만 화소 이하로 줄여서 올려 주세요.`,
  unreadable: "이미지를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.",
};

/**
 * 이 바이트를 창고에 넣어도 되는가.
 *
 * **딱지를 믿지 않는다.** 화면이 알려 준 `mimeType` 은 확장자에서 온 값이라,
 * `.png` 라는 이름의 JPEG 이 `image/png` 로 저장된다 — 브라우저가 못 여는
 * 파일이 된다. `lib/image-encoding.ts` 가 이미 같은 이유로 바이트를 본다.
 */
export async function inspectUploadedImage(bytes: Buffer): Promise<ImageGateResult> {
  // 빈 글자를 기본값으로 줘서 **못 알아본 경우**를 가려낸다.
  const mimeType = sniffImageMime(bytes, "");
  if (!KNOWN.includes(mimeType as (typeof KNOWN)[number])) {
    return { ok: false, reason: "not_an_image", message: MESSAGE.not_an_image };
  }

  try {
    /*
      **`limitInputPixels` 를 끄고 우리가 센다.**

      처음에는 상한을 걸고 그 아래에 손으로 세는 줄을 함께 뒀다. 리뷰가 잡았다
      — **그 줄에 영영 닿지 않는다.** `metadata()` 가 머리말만 보고 먼저
      던지기 때문이다. 그래서 413 을 정하는 유일한 근거가 libvips 의 영어 오류
      문구였고, 문구가 바뀌거나 로캘이 끼면 413 이 조용히 400 으로 바뀐다.

      실측(2026-09-20, sharp 0.35.4 / libvips 8.18.6):

        8000×5000(40.0MP)  limit=40MP  → 통과
        8000×5001(40.0MP)  limit=40MP  → 던짐
        같은 둘             limit=false → 둘 다 통과
        39.7MP metadata 만              → 0ms, RSS +0MB

      머리말만 읽으므로 상한을 꺼도 화소를 펼치지 않는다. 판정은 아래 한 줄이
      한다 — 라이브러리 안쪽 동작이 바뀌어도 우리 답은 안 바뀐다.
    */
    const meta = await sharp(bytes, { limitInputPixels: false }).metadata();
    if (!meta.width || !meta.height) {
      return { ok: false, reason: "unreadable", message: MESSAGE.unreadable };
    }
    if (meta.width * meta.height > STYLE_REFERENCE_MAX_PIXELS) {
      return { ok: false, reason: "too_many_pixels", message: MESSAGE.too_many_pixels };
    }
    return { ok: true, mimeType, width: meta.width, height: meta.height };
  } catch {
    // 머리말을 못 읽었다. 화소 상한은 위에서 우리가 이미 갈랐다.
    return { ok: false, reason: "unreadable", message: MESSAGE.unreadable };
  }
}
