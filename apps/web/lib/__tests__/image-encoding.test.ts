import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_INPUT_PIXELS, encodeForStorage, makeThumbnail, sniffImageMime, toPng } from "../image-encoding";

/**
 * 저장 직전 인코딩.
 *
 * 이 파일이 지키는 약속은 하나다 — **픽셀은 한 톨도 바뀌지 않는다.** 용량을
 * 줄이는 것이 목적이지만, 글자가 많고 결이 복잡한 그림을 다루는 제품이라
 * 화질을 내주는 순간 절감은 의미가 없다.
 */

/** 실제 sharp 로 만든다. 가짜 바이트로는 무손실을 증명할 수 없다. */
async function solidPng(width: number, height: number, colour: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer();
}

/** 결이 있는 그림. 단색만 쓰면 어떤 인코더든 통과해서 시험이 되지 않는다. */
async function texturedPng(width = 64, height = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      pixels[at] = (x * 7 + y * 3) % 256;
      pixels[at + 1] = (x * x + y) % 256;
      pixels[at + 2] = (x + y * 11) % 256;
      pixels[at + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** 알파를 자리마다 정해 넣은 결이 있는 그림. */
function withAlpha(alphaAt: (x: number, width: number) => number, width = 64, height = 64) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      pixels[at] = (x * 7 + y * 3) % 256;
      pixels[at + 1] = (x * x + y) % 256;
      pixels[at + 2] = (x + y * 11) % 256;
      pixels[at + 3] = alphaAt(x, width);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } });
}

/**
 * 진짜 APNG(ffmpeg 로 만든 5프레임).
 *
 * **이게 가장 위험한 입력이다.** 첫 여덟 바이트가 규격상 표준 PNG 와 같아
 * 시그니처로 못 가르고, libvips 8.18.3 은 APNG 를 읽지 못해 `pages` 를
 * `undefined` 로 준다 — 즉 프레임 수로도 못 가른다. 게다가 한 장으로 줄어든
 * 결과는 원본보다 작아서 크기 가드마저 통과한다. 세 방어가 전부 통과시킨다.
 */
const APNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAACGFjVEwAAAADAAAAAM7tusAAAAAaZmNUTAAAAAAAAAAQAAAAEAAAAAAAAAAAAAEABQAAaBqIGAAAAItJREFUeJzlktENAjEMQ5+lDnKb0FHKJr1NOgpscpsYNUWCwgESH/zgjzZOk9hSIwKOU76LgzznEzMsawRxj5hr8dwgj5odWPFg3xoU5D2kPvPR0kekkHrlZUckfaPwfw0GjnJhO1BN68kMRQRpLGdWKH09TtB+YKn/ccONBVbP21pQYYOKa7eUIV8AeOE0NVoMKPwAAAAaZmNUTAAAAAEAAAAQAAAAAwAAAAAAAAAMAAEABQAAYdb9jgAAADZmZEFUAAAAAnicY/xvzMCQAEJreRgWMDBsYRCG8s/qgPgLGIK/gPg+DG9BHIYFLAwkApI1AABTkws18ozPFgAAABpmY1RMAAAAAwAAABAAAAADAAAAAAAAAAwAAQAFAACMQC5nAAAANmZkQVQAAAAEeJxj/J/GwJDAcMuSYQEDCD1ncAPxf0VC+GrHGRJAfAZJhl0gPttyFgYSAckaAN1ZDA/NuPUvAAAAAElFTkSuQmCC", "base64");

/**
 * 2프레임 애니메이션 GIF. 손으로 짠 85바이트짜리다.
 *
 * 파일에서 읽지 않고 여기 둔 것은, 이 픽스처가 **막으려는 사고 그 자체**라
 * 어딘가에서 조용히 사라지면 안 되기 때문이다. sharp 로는 애니메이션 GIF 를
 * 만들 수 없어 바이트를 직접 적었다.
 */
const ANIMATED_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAZAAAACwAAAAAAQABAAACAkQBACH5BABkAAAALAAAAAABAAEAAAICTAEAOw==",
  "base64",
);

/**
 * 픽셀이 같은가. **알파를 떼지 않는다** — 투명도까지 봐야 무손실이다.
 */
async function samePixels(left: Buffer, right: Buffer): Promise<boolean> {
  const a = await sharp(left).ensureAlpha().raw().toBuffer();
  const b = await sharp(right).ensureAlpha().raw().toBuffer();
  return a.equals(b);
}

describe("samePixels — 시험 도구가 손실을 실제로 잡는지 먼저 증명한다", () => {
  // 이것이 없으면 아래 무손실 시험이 무엇을 통과시켰는지 알 수 없다.
  it("무손실 인코딩은 같다고 판정한다", async () => {
    const original = await texturedPng();
    const lossless = await sharp(original).webp({ lossless: true, effort: 4 }).toBuffer();
    expect(await samePixels(original, lossless)).toBe(true);
  });

  it("손실 인코딩(q92)은 다르다고 판정한다", async () => {
    const original = await texturedPng();
    const lossy = await sharp(original).webp({ quality: 92 }).toBuffer();
    expect(await samePixels(original, lossy)).toBe(false);
  });
});

describe("encodeForStorage", () => {
  it("PNG 를 줄이고 픽셀은 그대로 둔다", async () => {
    const original = await texturedPng(256, 256);
    const stored = await encodeForStorage(original, "image/png");

    expect(stored.converted).toBe(true);
    expect(stored.mimeType).toBe("image/webp");
    expect(stored.bytes.length).toBeLessThan(original.length);
    expect(await samePixels(original, stored.bytes)).toBe(true);
  });

  it("크기와 알파 채널을 보존한다", async () => {
    const original = await sharp({
      create: { width: 48, height: 72, channels: 4, background: { r: 10, g: 200, b: 90, alpha: 0.5 } },
    }).png().toBuffer();
    const stored = await encodeForStorage(original, "image/png");

    const before = await sharp(original).metadata();
    const after = await sharp(stored.bytes).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.hasAlpha).toBe(before.hasAlpha);
    expect(await samePixels(original, stored.bytes)).toBe(true);
  });

  it("애니메이션 GIF 는 건드리지 않는다 — 프레임을 잃기 때문이다", async () => {
    // 시그니처만 보는 방어는 여기서 뚫린다. GIF 는 PNG/JPEG/WebP 어느 것도
    // 아니라 부르는 쪽이 준 fallback 이 그대로 판정이 되고, 한 장으로 줄어든
    // 결과물은 원본보다 작아서 "작을 때만" 규칙마저 통과한다.
    expect((await sharp(ANIMATED_GIF).metadata()).pages).toBe(2);

    const stored = await encodeForStorage(ANIMATED_GIF, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(ANIMATED_GIF)).toBe(true);
  });

  it("JPEG 는 원본을 그대로 둔다 — 다시 구우면 커지기만 한다", async () => {
    const original = await sharp(await texturedPng(128, 128)).jpeg({ quality: 90 }).toBuffer();
    const stored = await encodeForStorage(original, "image/jpeg");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(original)).toBe(true);
    expect(stored.mimeType).toBe("image/jpeg");
  });

  it("mimeType 은 부르는 쪽 말이 아니라 실제 바이트로 정한다", async () => {
    // 화면이 보낸 딱지를 믿으면 `.png` 라는 이름의 WebP 가 생긴다.
    const webp = await sharp(await texturedPng()).webp({ lossless: true }).toBuffer();
    const stored = await encodeForStorage(webp, "image/png");

    expect(stored.mimeType).toBe("image/webp");
  });

  it("너무 큰 그림은 손대지 않는다 — 메모리를 지키는 쪽이 먼저다", async () => {
    const huge = await sharp({
      create: { width: 7000, height: 7000, channels: 3, background: "#123456" },
    }).png().toBuffer();
    expect(7000 * 7000).toBeGreaterThan(MAX_INPUT_PIXELS);

    const stored = await encodeForStorage(huge, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(huge)).toBe(true);
  });

  it("깨진 바이트에도 던지지 않고 원본을 돌려준다", async () => {
    const junk = Buffer.from("이것은 그림이 아니다");
    const stored = await encodeForStorage(junk, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(junk)).toBe(true);
    expect(stored.mimeType).toBe("image/png");
  });

  it("들어온 버퍼를 바꾸지 않는다", async () => {
    const original = await texturedPng();
    const copy = Buffer.from(original);
    await encodeForStorage(original, "image/png");

    expect(original.equals(copy)).toBe(true);
  });

  it("PNG 가 아닌 형식은 손대지 않는다 — 정지 GIF 도 마찬가지다", async () => {
    // 프레임이 하나뿐이라 `pages` 확인에 안 걸리고, WebP 로 구우면 실제로
    // 작아져서 「작을 때만」 규칙에도 안 걸린다. 두 방어가 모두 통과시키므로
    // **PNG 만 손댄다는 약속이 여기서 유일한 방어다.**
    const stillGif = await sharp(await texturedPng(96, 96)).gif().toBuffer();
    expect((await sharp(stillGif).metadata()).pages ?? 1).toBe(1);
    const wouldShrink = await sharp(stillGif).webp({ lossless: true, effort: 4 }).toBuffer();
    expect(wouldShrink.length).toBeLessThan(stillGif.length);

    const stored = await encodeForStorage(stillGif, "image/gif");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(stillGif)).toBe(true);
  });

  it("APNG 는 손대지 않는다 — 시그니처로도 프레임 수로도 못 가른다", async () => {
    // sharp 가 APNG 를 못 읽으므로 `pages` 는 무용지물이다. 바이트에서 acTL
    // 청크를 직접 찾는 수밖에 없다.
    expect(APNG.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect((await sharp(APNG).metadata()).pages).toBeUndefined();

    const stored = await encodeForStorage(APNG, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(APNG)).toBe(true);
  });

  it("16비트 PNG 는 손대지 않는다 — WebP 는 8비트뿐이다", async () => {
    // 채널당 16비트를 WebP 로 담을 방법이 없어 8비트로 떨어진다. 그런데 그
    // 결과는 **언제나 작아서** 「작을 때만」 규칙이 방어가 아니라 통과 도장이
    // 된다. 여기서 막지 않으면 그라데이션에 밴딩이 생긴 채로 저장된다.
    const deep = await sharp(await texturedPng(64, 64)).toColourspace("rgb16").png().toBuffer();
    expect((await sharp(deep).metadata()).depth).toBe("ushort");

    const stored = await encodeForStorage(deep, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(deep)).toBe(true);
  });

  it("완전 투명한 픽셀이 있으면 손대지 않는다 — 그 아래 RGB 가 지워진다", async () => {
    // libwebp 는 `exact` 가 꺼져 있으면 보이지 않는 영역의 RGB 를 버린다.
    // sharp 가 그 옵션을 열어 주지 않아 우리 쪽에서 걸러내는 수밖에 없다.
    // 지워진 색은 그림을 늘이거나 줄일 때 경계로 배어 나온다.
    const holed = await withAlpha((x, width) => (x < width / 2 ? 0 : 255)).png().toBuffer();

    const stored = await encodeForStorage(holed, "image/png");

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(holed)).toBe(true);
  });

  it("알파 채널이 있어도 전부 불투명하면 줄인다 — 절감을 괜히 버리지 않는다", async () => {
    const opaque = await withAlpha(() => 255).png().toBuffer();
    expect((await sharp(opaque).metadata()).hasAlpha).toBe(true);

    const stored = await encodeForStorage(opaque, "image/png");

    expect(stored.converted).toBe(true);
    expect(await samePixels(opaque, stored.bytes)).toBe(true);
  });

  it("색 프로파일(ICC)을 잃지 않는다 — 픽셀이 같아도 색이 달라진다", async () => {
    const original = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#c04030" },
    }).withMetadata({ icc: "p3" }).png().toBuffer();
    expect((await sharp(original).metadata()).icc).toBeDefined();

    const stored = await encodeForStorage(original, "image/png");

    expect(stored.converted).toBe(true);
    expect((await sharp(stored.bytes).metadata()).icc).toBeDefined();
  });
});

/**
 * 「작을 때만 바꾼다」.
 *
 * 이 규칙이 용량이 늘어나는 일을 막는 **유일한** 장치다. 그런데 실제 그림으로는
 * 무손실 WebP 가 PNG 보다 커지는 입력을 만들 수 없어서, 인코더를 갈아 끼우지
 * 않으면 이 갈래가 영영 검증되지 않는다.
 */
describe("encodeForStorage — 크기 가드", () => {
  const png = async () => texturedPng(64, 64);

  it("결과가 더 크면 원본을 지킨다", async () => {
    const original = await png();
    const bloat = async () => Buffer.alloc(original.length + 1, 0x42);

    const stored = await encodeForStorage(original, "image/png", bloat);

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(original)).toBe(true);
    expect(stored.mimeType).toBe("image/png");
  });

  it("결과가 정확히 같은 크기여도 원본을 지킨다", async () => {
    const original = await png();
    const tie = async () => Buffer.alloc(original.length, 0x42);

    const stored = await encodeForStorage(original, "image/png", tie);

    expect(stored.converted).toBe(false);
    expect(stored.bytes.equals(original)).toBe(true);
  });

  it("한 바이트라도 작으면 바꾼다", async () => {
    const original = await png();
    const win = async () => Buffer.alloc(original.length - 1, 0x42);

    const stored = await encodeForStorage(original, "image/png", win);

    expect(stored.converted).toBe(true);
    expect(stored.mimeType).toBe("image/webp");
  });
});

describe("sniffImageMime", () => {
  it("바이트가 짧으면 부르는 쪽 값으로 떨어진다", () => {
    expect(sniffImageMime(Buffer.alloc(4), "image/png")).toBe("image/png");
  });

  it("PNG 시그니처가 한 바이트라도 어긋나면 PNG 가 아니다", () => {
    const almost = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00]);
    expect(sniffImageMime(almost, "image/gif")).toBe("image/gif");
  });

  it("RIFF 로 시작해도 WEBP 가 아니면 WebP 가 아니다", () => {
    // WAV 도 RIFF 로 시작한다. 앞 네 글자만 보면 소리 파일이 그림이 된다.
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]);
    expect(sniffImageMime(wav, "audio/wav")).toBe("audio/wav");
  });
});

describe("toPng", () => {
  it("무손실 WebP 를 PNG 로 되돌리면 원본과 픽셀이 같다", async () => {
    const original = await texturedPng(128, 128);
    const stored = await encodeForStorage(original, "image/png");
    const restored = await toPng(stored.bytes);

    expect((await sharp(restored).metadata()).format).toBe("png");
    expect(await samePixels(original, restored)).toBe(true);
  });
});

describe("makeThumbnail", () => {
  it("긴 변을 512 로 줄이고 비율을 지킨다", async () => {
    const thumbnail = await makeThumbnail(await solidPng(2048, 1024, "#ff8800"));

    const meta = await sharp(thumbnail!).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(256);
  });

  it("작은 그림을 늘리지 않는다", async () => {
    const thumbnail = await makeThumbnail(await solidPng(100, 60, "#00aa55"));

    const meta = await sharp(thumbnail!).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(60);
  });

  it("못 만들면 null 이다 — 썸네일 때문에 저장을 막지 않는다", async () => {
    expect(await makeThumbnail(Buffer.from("그림이 아니다"))).toBeNull();
  });
});
