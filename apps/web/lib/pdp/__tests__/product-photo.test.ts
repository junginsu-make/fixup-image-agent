import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

const { isFalStorageUrl } = await import("../fal-storage-url");
const { prepareProductPhoto, PRODUCT_PHOTO_MAX_EDGE } = await import("../product-photo");

const jpeg = (width: number, height: number, orientation?: number) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 80 } } }).jpeg({ quality: 90 });
  return (orientation ? image.withMetadata({ orientation }) : image).toBuffer();
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
    const prepared = await prepareProductPhoto(bytes, true);
    expect(prepared.ok && prepared.bytes.equals(bytes)).toBe(true);
  });

  it("긴 변이 3840 을 넘으면 맞출 때만 3840 으로", async () => {
    const bytes = await jpeg(4032, 3024);
    const fitted = await prepareProductPhoto(bytes, true);
    expect(fitted.ok && Math.max(fitted.width, fitted.height)).toBe(PRODUCT_PHOTO_MAX_EDGE);
    const kept = await prepareProductPhoto(bytes, false);
    expect(kept.ok && kept.bytes.equals(bytes)).toBe(true);
  });

  it("회전 정보가 있으면 바로 세워 굽는다 — 모델이 누운 사진으로 읽지 않게", async () => {
    const bytes = await jpeg(300, 200, 6);
    const prepared = await prepareProductPhoto(bytes, false);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect([prepared.width, prepared.height]).toEqual([200, 300]);
    expect((await sharp(prepared.bytes).metadata()).orientation ?? 1).toBe(1);
  });

  it("그림이 아니면 400", async () => {
    const prepared = await prepareProductPhoto(Buffer.from("hello"), true);
    expect(prepared).toMatchObject({ ok: false, status: 400 });
  });

  it("20MB 를 넘으면 413", async () => {
    const prepared = await prepareProductPhoto(Buffer.alloc(20 * 1024 * 1024 + 1), true);
    expect(prepared).toMatchObject({ ok: false, status: 413 });
  });
});
