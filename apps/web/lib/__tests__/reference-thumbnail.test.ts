import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * 참고 이미지·캐릭터 목록의 작은 사본.
 *
 * 참고 이미지는 **공용 창고**라 한 화면에 400장까지 뜬다. 지금 라이브러리에서
 * 가장 무거운 화면이다.
 *
 * **원본은 절대 건드리지 않는다.** 참고 이미지는 화면에만 뜨는 것이 아니라
 * fal 에 참고로 실려 나간다 — 거기에 사본을 물리면 생성 품질이 조용히 깎인다.
 */

vi.mock("server-only", () => ({}));

const { makeGridThumbnail, gridThumbPath } = await import("../grid-thumbnail");

async function photoPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 9;
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

describe("makeGridThumbnail", () => {
  it("가로를 512 로 묶는다 — 격자 칸은 작다", async () => {
    const thumb = await makeGridThumbnail(await photoPng(1600, 900));

    const meta = await sharp(thumb!).metadata();
    expect(meta.width).toBe(512);
  });

  it("세로로 긴 그림도 가로 기준이다", async () => {
    const thumb = await makeGridThumbnail(await photoPng(1024, 1536));

    const meta = await sharp(thumb!).metadata();
    expect([meta.width, meta.height]).toEqual([512, 768]);
  });

  it("작은 그림을 늘리지 않는다", async () => {
    const thumb = await makeGridThumbnail(await photoPng(300, 300));

    // `if` 로 감싸지 않는다 — 감싸면 null 이 됐을 때 아무것도 검증 안 하는
    // 시험이 되어, 확대 방지가 사라져도 통과한다.
    expect(thumb).not.toBeNull();
    expect((await sharp(thumb!).metadata()).width).toBe(300);
  });

  it("크게 줄어든다", async () => {
    const original = await photoPng(1600, 1600);

    expect((await makeGridThumbnail(original))!.length).toBeLessThan(original.length / 5);
  });

  it("색 프로파일을 잃지 않는다", async () => {
    const original = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#c04030" },
    }).withMetadata({ icc: "p3" }).png().toBuffer();

    expect((await sharp((await makeGridThumbnail(original))!).metadata()).icc).toBeDefined();
  });

  it("사본이 더 크면 두지 않는다", async () => {
    const already = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#3a7fd5" } })
      .webp({ quality: 78 }).toBuffer();

    expect(await makeGridThumbnail(already)).toBeNull();
  });

  it("요즘 폰 사진(12MP 초과)도 사본을 받는다", async () => {
    // 저장 인코딩의 12MP 상한을 그대로 쓰면 아이폰 기본(4032×3024=12.19MP)이
    // 걸린다. 그러면 격자에서 **가장 무거운 것들만 원본으로 남아** 목적을
    // 절반만 이룬다.
    const phone = await sharp({
      create: { width: 4032, height: 3024, channels: 3, background: "#3a7fd5" },
    }).png().toBuffer();

    const thumb = await makeGridThumbnail(phone);

    expect(thumb).not.toBeNull();
    expect((await sharp(thumb!).metadata()).width).toBe(512);
  });

  it("그래도 지나치게 큰 그림은 손대지 않는다", async () => {
    const huge = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#123456" } })
      .png().toBuffer();

    expect(await makeGridThumbnail(huge)).toBeNull();
  });

  it("그림이 아니면 null 이다 — 사본 때문에 원본을 잃지 않는다", async () => {
    expect(await makeGridThumbnail(Buffer.from("그림 아님"))).toBeNull();
  });
});

describe("gridThumbPath", () => {
  it("원본 이름 규칙을 건드리지 않고 덧붙인다", () => {
    expect(gridThumbPath("u1/references/abc.jpg")).toBe("u1/references/abc.thumb.webp");
    expect(gridThumbPath("u1/char-1/front.png")).toBe("u1/char-1/front.thumb.webp");
  });

  it("확장자가 없어도 만든다", () => {
    expect(gridThumbPath("u1/references/abc")).toBe("u1/references/abc.thumb.webp");
  });
});
