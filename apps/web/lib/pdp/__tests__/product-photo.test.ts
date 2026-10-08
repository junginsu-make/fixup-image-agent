import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";

vi.mock("server-only", () => ({}));

const { isFalStorageUrl } = await import("../fal-storage-url");
const {
  HEAVY_STEP_CONCURRENCY,
  PRODUCT_PHOTO_MAX_EDGE,
  inspectProductPhoto,
  limitConcurrency,
  normalizeProductPhoto,
} = await import("../product-photo");

const jpeg = (width: number, height: number, orientation?: number) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 80 } } }).jpeg({ quality: 90 });
  return (orientation ? image.withMetadata({ orientation }) : image).toBuffer();
};

/**
 * 머리말만 큰 PNG — 1×1 PNG 의 IHDR 너비·높이를 바꾸고 CRC 를 다시 단다.
 * 화소 상한은 머리말로 가른다(`image-gate.ts`). 실제로 40백만 화소를 펼치면 시험이 무겁다.
 */
const pngHeader = async (width: number, height: number) => {
  const small = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
  const big = Buffer.from(small);
  big.writeUInt32BE(width, 16);
  big.writeUInt32BE(height, 20);
  big.writeUInt32BE(crc32(big.subarray(12, 29)) >>> 0, 29);
  return big;
};

/** 라우트와 같은 차례 — 문지기 다음에 무거운 손질. */
const prepare = async (bytes: Buffer, fit: boolean) => {
  const inspected = await inspectProductPhoto(bytes);
  return inspected.ok ? normalizeProductPhoto(bytes, inspected, fit) : inspected;
};

describe("fal 저장소 주소만 받는다", () => {
  it.each([
    ["https://v3.fal.media/files/a/b.jpg", true],
    ["https://fal.media/files/a.jpg", true],
    ["http://v3.fal.media/files/a.jpg", false],
    ["https://fal.media.evil.com/a.jpg", false],
    ["https://evilfal.media/a.jpg", false],
    ["https://user:pw@v3.fal.media/a.jpg", false],
    ["https://v3.fal.media:8443/a.jpg", false],
    ["data:image/png;base64,AAAA", false],
    ["not a url", false],
  ])("%s → %s", (value, expected) => {
    expect(isFalStorageUrl(value)).toBe(expected);
  });
});

describe("원본 손질", () => {
  it("상한 아래 원본은 바이트를 그대로 둔다", async () => {
    const bytes = await jpeg(2000, 1500);
    const prepared = await prepare(bytes, true);
    expect(prepared.ok && prepared.bytes.equals(bytes)).toBe(true);
  });

  it("긴 변이 3840 을 넘으면 맞출 때만 3840 으로", async () => {
    const bytes = await jpeg(4032, 3024);
    const fitted = await prepare(bytes, true);
    expect(fitted.ok && Math.max(fitted.width, fitted.height)).toBe(PRODUCT_PHOTO_MAX_EDGE);
    const kept = await prepare(bytes, false);
    expect(kept.ok && kept.bytes.equals(bytes)).toBe(true);
  });

  it("회전 정보가 있으면 바로 세워 굽는다 — 모델이 누운 사진으로 읽지 않게", async () => {
    const bytes = await jpeg(300, 200, 6);
    const prepared = await prepare(bytes, false);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect([prepared.width, prepared.height]).toEqual([200, 300]);
    expect((await sharp(prepared.bytes).metadata()).orientation ?? 1).toBe(1);
  });

  it("그림이 아니면 400", async () => {
    expect(await inspectProductPhoto(Buffer.from("hello"))).toMatchObject({ ok: false, status: 400 });
  });

  it("20MB 를 넘으면 413", async () => {
    expect(await inspectProductPhoto(Buffer.alloc(20 * 1024 * 1024 + 1))).toMatchObject({ ok: false, status: 413 });
  });

  it("40백만 화소를 넘으면 413 — 머리말만 보고 가른다(설계 §9.2)", async () => {
    expect(await inspectProductPhoto(await pngHeader(8000, 5000))).toMatchObject({ ok: true, width: 8000, height: 5000 });
    expect(await inspectProductPhoto(await pngHeader(8000, 5001))).toMatchObject({ ok: false, status: 413 });
  });

  it("무거운 손질에서 펼치지 못하면 400 으로 답한다 — 예외를 밖으로 던지지 않는다", async () => {
    const broken = await pngHeader(4000, 3000);
    const inspected = await inspectProductPhoto(broken);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(await normalizeProductPhoto(broken, inspected, true)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("무거운 손질은 한 번에 둘까지", () => {
  it("상한은 둘이다", () => {
    expect(HEAVY_STEP_CONCURRENCY).toBe(2);
  });

  it("다섯을 한꺼번에 맡겨도 동시에 도는 것은 둘을 넘지 않고, 모두 끝난다", async () => {
    const run = limitConcurrency(2);
    let active = 0;
    let peak = 0;
    const task = (value: number) => run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value;
    });
    expect(await Promise.all([1, 2, 3, 4, 5].map(task))).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("실패한 일도 자리를 돌려준다 — 다음 일이 영영 기다리지 않게", async () => {
    const run = limitConcurrency(1);
    await expect(run(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await run(async () => "다음")).toBe("다음");
  });
});
