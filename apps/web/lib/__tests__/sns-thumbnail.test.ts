import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

const { makeSnsPreview, snsPreviewPath, snsCardPathsToRemove } = await import("../sns/thumbnail");

async function photoPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 5;
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

describe("makeSnsPreview", () => {
  it("크기를 그대로 둔다 — 줄이지 않으니 흐려질 일이 없다", async () => {
    const preview = await makeSnsPreview(await photoPng(1152, 2048));

    const meta = await sharp(preview!).metadata();
    expect([meta.width, meta.height]).toEqual([1152, 2048]);
  });

  it("가로로 넓은 카드도 그대로 둔다", async () => {
    const preview = await makeSnsPreview(await photoPng(2048, 1152));

    const meta = await sharp(preview!).metadata();
    expect([meta.width, meta.height]).toEqual([2048, 1152]);
  });

  it("형식만 바꿔도 크게 준다", async () => {
    const original = await photoPng(1088, 1360);

    const preview = await makeSnsPreview(original);

    expect((await sharp(preview!).metadata()).format).toBe("webp");
    expect(preview!.length).toBeLessThan(original.length / 3);
  });

  it("품질을 낮게 깎지 않는다 — 줄지 않는 미리보기는 자국이 1:1 로 보인다", async () => {
    const original = await photoPng(1088, 1360);
    const floor = await sharp(original).webp({ quality: 80 }).toBuffer();

    expect((await makeSnsPreview(original))!.length).toBeGreaterThan(floor.length);
  });

  it("색 프로파일을 잃지 않는다", async () => {
    const original = await sharp({
      create: { width: 1088, height: 1088, channels: 3, background: "#c04030" },
    }).withMetadata({ icc: "p3" }).png().toBuffer();

    expect((await sharp((await makeSnsPreview(original))!).metadata()).icc).toBeDefined();
  });

  it("미리보기가 더 크면 두지 않는다", async () => {
    const already = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#3a7fd5" } })
      .webp({ quality: 88 }).toBuffer();

    expect(await makeSnsPreview(already)).toBeNull();
  });

  it("너무 큰 그림은 손대지 않는다", async () => {
    const huge = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "#123456" } })
      .png().toBuffer();

    expect(await makeSnsPreview(huge)).toBeNull();
  });

  it("그림이 아니면 null 이다", async () => {
    expect(await makeSnsPreview(Buffer.from("그림 아님"))).toBeNull();
  });
});

describe("snsPreviewPath", () => {
  it("원본 이름 규칙을 건드리지 않는다", () => {
    expect(snsPreviewPath("u1", "p1", 3)).toBe("u1/sns/p1/3.thumb.webp");
  });
});

describe("snsCardPathsToRemove", () => {
  it("원본과 미리보기를 함께 모은다", () => {
    expect(snsCardPathsToRemove([
      { assetPath: "u/sns/p/1.png", thumbPath: "u/sns/p/1.thumb.webp" },
      { assetPath: "u/sns/p/2.png", thumbPath: null },
      { assetPath: null, thumbPath: null },
    ])).toEqual(["u/sns/p/1.png", "u/sns/p/1.thumb.webp", "u/sns/p/2.png"]);
  });
});

describe("삭제가 규칙을 실제로 부른다", () => {
  it("작업을 지울 때 모으는 경로에 미리보기가 들어간다", async () => {
    // 규칙 자체는 위에서 검사한다. 여기서는 **삭제 경로가 그 규칙을 부르는지**
    // 를 본다 — 안 부르면 규칙이 아무리 옳아도 파일이 그대로 남는다.
    const { assetPathsOfForTest } = await import("../sns-flow-store");

    expect(assetPathsOfForTest({
      data: { flow: { cards: [
        { assetPath: "u/sns/p/1.png", thumbPath: "u/sns/p/1.thumb.webp" },
        { assetPath: "u/sns/p/2.png" },
      ] } },
    } as never)).toEqual(["u/sns/p/1.png", "u/sns/p/1.thumb.webp", "u/sns/p/2.png"]);
  });
});
