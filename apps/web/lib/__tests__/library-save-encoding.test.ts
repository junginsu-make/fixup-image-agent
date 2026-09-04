import { beforeEach, describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";

/**
 * 라이브러리에 넣을 때 무엇으로 저장되는가.
 *
 * 저장 형식을 바꾸는 일은 경로·content-type·표의 mime 이 **동시에** 따라가야
 * 성립한다. 셋 중 하나만 어긋나면 브라우저가 못 여는 파일이 조용히 쌓인다.
 * 그래서 셋을 한자리에서 붙잡는다.
 */

interface Uploaded { path: string; bytes: Buffer; contentType: string }

const uploads: Uploaded[] = [];
let insertedImageRows: Array<Record<string, unknown>> = [];

function builderFor(table: string) {
  const builder: Record<string, unknown> = {
    insert: (rows: unknown) => {
      if (table === "library_images") insertedImageRows = rows as Array<Record<string, unknown>>;
      return builder;
    },
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    single: async () => ({ data: { id: "item-1" }, error: null }),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
  };
  return builder;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Buffer, options: { contentType: string }) => {
          // 목록용 작은 사본은 이 시험의 대상이 아니다 — 여기서 보는 것은
          // 저장되는 **형식**이지 파생본이 아니다.
          if (!path.includes(".thumb.")) uploads.push({ path, bytes, contentType: options.contentType });
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
  }),
}));

vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));

// 표기(배지)는 이 시험의 대상이 아니다. 원본을 그대로 흘려보낸다.
vi.mock("../watermark", () => ({ markAsAi: async (bytes: Buffer) => bytes }));

const { saveLibraryItem } = await import("../server-library");

/** 결이 있는 그림. 단색은 어떤 인코더로도 잘 눌려 시험이 되지 않는다. */
async function texturedPng(width = 128, height = 128): Promise<Buffer> {
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

async function save(bytes: Buffer, mimeType: string, origin: "ai" | "upload") {
  return saveLibraryItem({
    userId: "user-1",
    title: "시험",
    tool: "create",
    origin,
    images: [{ base64: bytes.toString("base64"), mimeType }],
  });
}

beforeEach(() => {
  uploads.length = 0;
  insertedImageRows = [];
});

describe("saveLibraryItem — 저장 형식", () => {
  it("PNG 결과물을 더 작게 넣고 경로·content-type·표를 함께 맞춘다", async () => {
    const original = await texturedPng();

    const result = await save(original, "image/png", "ai");

    expect(result.ok).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.bytes.length).toBeLessThan(original.length);
    expect(uploads[0]!.path).toMatch(/\.webp$/);
    expect(uploads[0]!.contentType).toBe("image/webp");
    expect(insertedImageRows[0]!.mime_type).toBe("image/webp");
  });

  it("작아진 그림의 픽셀은 원본과 한 톨도 다르지 않다", async () => {
    const original = await texturedPng();

    await save(original, "image/png", "ai");

    const before = await sharp(original).ensureAlpha().raw().toBuffer();
    const after = await sharp(uploads[0]!.bytes).ensureAlpha().raw().toBuffer();
    expect(after.equals(before)).toBe(true);
  });

  it("사용자가 올린 PNG 도 같은 대접을 받는다", async () => {
    const original = await texturedPng();

    await save(original, "image/png", "upload");

    expect(uploads[0]!.path).toMatch(/\.webp$/);
    expect(uploads[0]!.bytes.length).toBeLessThan(original.length);
  });

  it("여러 장을 섞어 넣어도 장마다 제 형식을 따라간다", async () => {
    const png = await texturedPng();
    const jpeg = await sharp(await texturedPng()).jpeg({ quality: 90 }).toBuffer();

    await saveLibraryItem({
      userId: "user-1",
      title: "섞어 담기",
      tool: "create",
      origin: "upload",
      images: [
        { base64: png.toString("base64"), mimeType: "image/png" },
        { base64: jpeg.toString("base64"), mimeType: "image/jpeg" },
      ],
    });

    expect(uploads).toHaveLength(2);
    expect(uploads[0]!.path).toMatch(/\/0\.webp$/);
    expect(uploads[0]!.contentType).toBe("image/webp");
    expect(uploads[1]!.path).toMatch(/\/1\.jpg$/);
    expect(uploads[1]!.contentType).toBe("image/jpeg");
    expect(insertedImageRows[0]!.mime_type).toBe("image/webp");
    expect(insertedImageRows[1]!.mime_type).toBe("image/jpeg");
  });

  it("JPEG 는 원본 그대로 둔다 — 다시 구우면 커지기만 한다", async () => {
    const original = await sharp(await texturedPng()).jpeg({ quality: 90 }).toBuffer();

    await save(original, "image/jpeg", "upload");

    expect(uploads[0]!.bytes.equals(original)).toBe(true);
    expect(uploads[0]!.path).toMatch(/\.jpg$/);
    expect(uploads[0]!.contentType).toBe("image/jpeg");
  });
});
