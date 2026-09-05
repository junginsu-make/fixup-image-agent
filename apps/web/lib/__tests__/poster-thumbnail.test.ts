import { describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";

/**
 * 포스터 결과 목록에 걸 사본.
 *
 * 목록은 변형 세 장을 한꺼번에 깔면서 **원본을 그대로** 내려받는다. 한 장이
 * 2~4MB 라 목록 한 번이 10MB 를 넘는다. 사본은 원본과 별개 파일이라 원본에는
 * 아무 영향이 없고, 확대·내려받기는 계속 원본을 쓴다.
 */

vi.mock("server-only", () => ({}));

const { makePosterThumbnail } = await import("../poster/thumbnail");
const { posterThumbPath, posterThumbUrl, posterAssetPath } = await import("../poster/supabase-store-core");

async function photoPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 11;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 24; };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      pixels[at] = Math.min(255, Math.round((x / width) * 200) + noise());
      pixels[at + 1] = Math.min(255, Math.round((y / height) * 180) + noise());
      pixels[at + 2] = Math.min(255, Math.round(((x + y) / (width + height)) * 220) + noise());
      pixels[at + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe("makePosterThumbnail", () => {
  it("세로로 긴 포스터도 가로를 지킨다 — 목록은 가로만 제약한다", async () => {
    const thumb = await makePosterThumbnail(await photoPng(1232, 2192));

    const meta = await sharp(thumb!).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1822);
  });

  it("가로 1024 짜리는 줄이지 않고 형식만 바꾼다", async () => {
    const original = await photoPng(1024, 1536);

    const thumb = await makePosterThumbnail(original);

    const meta = await sharp(thumb!).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1536]);
    expect(thumb!.length).toBeLessThan(original.length / 3);
  });

  it("작은 그림을 늘리지 않는다", async () => {
    const thumb = await makePosterThumbnail(await photoPng(400, 600));

    if (thumb) expect((await sharp(thumb).metadata()).width).toBeLessThanOrEqual(400);
  });

  it("사본이 더 크면 두지 않는다", async () => {
    const already = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#3a7fd5" } })
      .webp({ quality: 88 }).toBuffer();

    expect(await makePosterThumbnail(already)).toBeNull();
  });

  it("그림이 아니면 null 이다 — 사본 때문에 결과물을 잃지 않는다", async () => {
    expect(await makePosterThumbnail(Buffer.from("그림 아님"))).toBeNull();
  });

  it("품질을 낮게 깎지 않는다 — 줄지 않는 사본은 압축 자국이 1:1 로 보인다", async () => {
    const original = await photoPng(1024, 1536);
    const floor = await sharp(original).resize(1024, null, { withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();

    const thumb = await makePosterThumbnail(original);

    expect(thumb!.length).toBeGreaterThan(floor.length);
  });

  it("색 프로파일을 잃지 않는다 — 픽셀이 같아도 색이 달라진다", async () => {
    const original = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#c04030" },
    }).withMetadata({ icc: "p3" }).png().toBuffer();

    const thumb = await makePosterThumbnail(original);

    expect((await sharp(thumb!).metadata()).icc).toBeDefined();
  });

  it("너무 큰 그림은 손대지 않는다 — 메모리를 지키는 쪽이 먼저다", async () => {
    const huge = await sharp({
      create: { width: 4000, height: 4000, channels: 3, background: "#123456" },
    }).png().toBuffer();

    expect(await makePosterThumbnail(huge)).toBeNull();
  });
});

describe("사본의 자리와 주소", () => {
  it("원본 이름 규칙을 건드리지 않는다", () => {
    // 원본이 `.png` 인 채로 남아야 이미 쌓인 결과가 그대로 열린다.
    expect(posterAssetPath("u1", "p1", 0)).toBe("u1/poster/p1/0.png");
    expect(posterThumbPath("u1", "p1", 0)).toBe("u1/poster/p1/0.thumb.webp");
  });

  it("주소에 사본을 달라는 표시를 붙인다", () => {
    expect(posterThumbUrl("p1", 2)).toBe("/api/poster/projects/p1/images/2/file?size=thumb");
  });
});
