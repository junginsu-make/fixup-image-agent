import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * 목록에 거는 작은 사본.
 *
 * 목록은 지금 표지를 **원본 그대로** 내려받는다. 한 장이 2~4MB 이고 목록은
 * 200건까지 나오므로, 목록을 한 번 여는 값이 저장 용량보다 크다.
 *
 * 작은 사본은 원본과 **별개 파일**이라 원본 품질에는 아무 영향이 없다. 그래서
 * 여기서 지킬 것은 화질이 아니라 셋이다 — 만들어 두었는가, 목록이 그걸
 * 쓰는가, 지울 때 같이 지워지는가.
 */

interface Uploaded { path: string; bytes: Buffer }

const uploads: Uploaded[] = [];
const removed: string[][] = [];
let imageRows: Array<Record<string, unknown>> = [];
let itemUpdates: Array<Record<string, unknown>> = [];
let listRows: Array<Record<string, unknown>> = [];
let imageSelectRows: Array<Record<string, unknown>> = [];
let signedPaths: string[] = [];
let failThumbnail = false;
let failImageInsert = false;
let failImageSelect = false;
/** 삭제가 0줄을 지운 상황. 남의 항목을 지우려 했을 때 운영에서 나는 답이다. */
let deleteReturnsNoRows = false;
let failThumbUpload = false;

function builderFor(table: string) {
  /** 이 핸들이 지우는 길인가. `delete()` 가 켠다. */
  let deleting = false;
  const self: Record<string, unknown> = {
    insert: (rows: unknown) => {
      if (table === "library_images") imageRows = rows as Array<Record<string, unknown>>;
      if (table === "library_images" && failImageInsert) {
        return { then: (r: (x: unknown) => unknown) => Promise.resolve(r({ error: { message: "표 쓰기 실패" } })) };
      }
      return self;
    },
    update: (patch: Record<string, unknown>) => {
      if (table === "library_items") itemUpdates.push(patch);
      return self;
    },
    select: () => self,
    // **지우는 길인지 표시해 둔다.** 삭제는 `.select("id")` 로 지운 줄을 돌려받아
    // 세는데, 여기서 목록과 같은 답을 주면 「0줄 지웠다」가 되어 실제 코드가
    // 권한 거절로 빠진다 — 시험이 진짜 동작을 못 보게 된다.
    delete: () => { deleting = true; return self; },
    order: () => self,
    limit: () => self,
    eq: () => self,
    single: async () => ({ data: { id: "item-1" }, error: null }),
    then: (resolve: (r: unknown) => unknown) =>
      Promise.resolve(resolve(
        table === "library_images" && failImageSelect
          ? { data: null, error: { message: "column does not exist" } }
          : deleting
            ? { data: deleteReturnsNoRows ? [] : [{ id: "a" }], error: null }
            : { data: table === "library_items" ? listRows : imageSelectRows, error: null },
      )),
  };
  return self;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Buffer) => {
          if (failThumbUpload && path.includes(".thumb.")) return { error: { message: "사본 업로드 실패" } };
          uploads.push({ path, bytes });
          return { error: null };
        },
        remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
        createSignedUrls: async (paths: string[]) => {
          signedPaths = paths;
          return { data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null };
        },
      }),
    },
  }),
}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../watermark", () => ({ markAsAi: async (b: Buffer) => b }));

// 썸네일이 실패해도 저장은 계속돼야 한다. 그 갈래를 여기서 켠다.
vi.mock("../image-encoding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../image-encoding")>();
  return { ...actual, makeThumbnail: async (b: Buffer) => (failThumbnail ? null : actual.makeThumbnail(b)) };
});

const { saveLibraryItem, listLibraryItems, deleteLibraryItem } = await import("../server-library");

/** 사진에 가까운 그림. 합성 무늬는 무손실 압축이 지나치게 잘 돼서 시험이 안 된다. */
async function photoPng(width = 900, height = 600): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 12345;
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

/** 이미 아주 작은 그림. 사본을 만들 이유가 없는 경우다. */
async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 4, background: "#3a7fd5" } }).png().toBuffer();
}

async function save(images: Buffer[]) {
  return saveLibraryItem({
    userId: "user-1", title: "시험", tool: "create", origin: "ai",
    images: images.map((bytes) => ({ base64: bytes.toString("base64"), mimeType: "image/png" })),
  });
}

beforeEach(() => {
  uploads.length = 0; removed.length = 0;
  imageRows = []; itemUpdates = []; listRows = []; imageSelectRows = []; signedPaths = [];
  failThumbnail = false; failImageInsert = false; failImageSelect = false; failThumbUpload = false;
  deleteReturnsNoRows = false;
});

describe("saveLibraryItem — 작은 사본", () => {
  it("원본과 함께 작은 사본을 만들어 둔다", async () => {
    const original = await photoPng();

    await save([original]);

    expect(uploads).toHaveLength(2);
    const thumb = uploads.find((u) => u.path.includes("thumb"));
    expect(thumb).toBeDefined();
    expect(thumb!.bytes.length).toBeLessThan(uploads[0]!.bytes.length);
    const meta = await sharp(thumb!.bytes).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
  });

  it("작은 사본의 자리를 표에 적어 둔다 — 안 적으면 지울 때 남는다", async () => {
    await save([await photoPng()]);

    expect(imageRows[0]!.thumb_path).toEqual(expect.stringContaining("thumb"));
    expect(itemUpdates.some((patch) => typeof patch.cover_thumb_path === "string")).toBe(true);
  });

  it("원본이 이미 더 작으면 사본을 두지 않는다", async () => {
    await save([await tinyPng()]);

    expect(uploads).toHaveLength(1);
    expect(imageRows[0]!.thumb_path).toBeNull();
  });

  it("작은 사본을 못 만들어도 저장은 계속한다", async () => {
    failThumbnail = true;

    const result = await save([await photoPng()]);

    expect(result.ok).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(imageRows[0]!.thumb_path).toBeNull();
  });

  it("저장이 중간에 엎어지면 작은 사본도 같이 지운다", async () => {
    // **`if` 로 감싸지 않는다.** 조건을 달면 실패가 안 일어났을 때 단언이
    // 한 번도 실행되지 않아, 되돌리기가 통째로 사라져도 시험이 통과한다.
    failImageInsert = true;

    const result = await save([await photoPng()]);

    expect(result.ok).toBe(false);
    // **원본과 사본을 둘 다 확인한다.** 한쪽만 보면 다른 쪽 되돌리기가
    // 통째로 사라져도 시험이 통과한다.
    expect(removed.flat().sort()).toEqual([
      "user-1/item-1/0.thumb.webp",
      "user-1/item-1/0.webp",
    ]);
  });

  it("표지는 첫 장의 원본이다", async () => {
    // 표지 경로를 검사하는 시험이 없으면, 저장이 표지를 비워 두거나 엉뚱한
    // 장을 가리켜도 아무도 모른다. 목록 카드가 통째로 비는 사고다.
    await save([await photoPng(), await photoPng(700, 500)]);

    const cover = itemUpdates.find((patch) => "cover_path" in patch);
    expect(cover!.cover_path).toBe("user-1/item-1/0.webp");
  });

  it("사본만 못 올리면 그 자리를 비워 둔다 — 없는 파일을 가리키면 표지가 아예 안 뜬다", async () => {
    failThumbUpload = true;

    const result = await save([await photoPng()]);

    expect(result.ok).toBe(true);
    expect(imageRows[0]!.thumb_path).toBeNull();
    const cover = itemUpdates.find((patch) => "cover_thumb_path" in patch);
    expect(cover!.cover_thumb_path).toBeNull();
  });
});

describe("listLibraryItems — 목록은 작은 사본을 쓴다", () => {
  it("옛 항목은 작은 사본이 없다 — 원본으로 떨어진다", async () => {
    listRows = [{
      id: "b", user_id: "user-1", title: "t", tool: "create", image_count: 1,
      cover_path: "user-1/b/0.png", cover_thumb_path: null,
      created_at: "2026-01-01",
    }];

    const items = await listLibraryItems({ userId: "user-1", role: "member" });

    expect(signedPaths).toEqual(["user-1/b/0.png"]);
    expect(items[0]!.coverUrl).toBe("signed:user-1/b/0.png");
  });
});

describe("deleteLibraryItem — 작은 사본도 함께 지운다", () => {
  it("원본과 사본을 한 번에 지운다 — 사본만 남으면 아무도 못 찾는다", async () => {
    imageSelectRows = [
      { path: "user-1/a/0.webp", thumb_path: "user-1/a/0.thumb.webp" },
      { path: "user-1/a/1.webp", thumb_path: null },
    ];

    await deleteLibraryItem({ userId: "user-1", role: "member" }, "a");

    expect(removed.flat().sort()).toEqual([
      "user-1/a/0.thumb.webp",
      "user-1/a/0.webp",
      "user-1/a/1.webp",
    ]);
  });

  it("**한 줄도 안 지웠으면 성공이라고 하지 않는다**", async () => {
    // 목록은 팀원의 작업물까지 보여 주는데 삭제는 소유자 조건이 걸린다. 조건에
    // 안 걸리면 supabase-js 는 오류 대신 빈 결과를 준다 — 세지 않으면
    // 「지웠습니다」가 뜨고 새로고침하면 되살아난다.
    deleteReturnsNoRows = true;
    imageSelectRows = [{ path: "user-1/a/0.webp", thumb_path: null }];

    const result = await deleteLibraryItem({ userId: "user-1", role: "member" }, "a");

    expect(result.ok).toBe(false);
    expect("denied" in result && result.denied).toBe(true);
    expect(removed.flat(), "못 지운 항목의 파일에 손댔다").toEqual([]);
  });
});

describe("listLibraryItems — 원본 주소와 사본 주소를 가른다", () => {
  it("사본은 목록 표시용이고 coverUrl 은 원본 그대로다", async () => {
    // **coverUrl 은 화면에만 쓰이지 않는다.** 「저장된 이미지에서 고르기」가
    // 이 주소를 받아 파일로 만들어 생성 입력으로 넘긴다. 여기에 512px 손실
    // 사본을 물리면 크레딧을 쓰는 결과물의 품질이 조용히 깎인다.
    listRows = [{
      id: "a", user_id: "user-1", title: "t", tool: "create", image_count: 1,
      cover_path: "user-1/a/0.webp", cover_thumb_path: "user-1/a/0.thumb.webp",
      created_at: "2026-01-01",
    }];

    const items = await listLibraryItems({ userId: "user-1", role: "member" });

    expect(items[0]!.coverUrl).toBe("signed:user-1/a/0.webp");
    expect(items[0]!.coverThumbUrl).toBe("signed:user-1/a/0.thumb.webp");
  });

  it("사본이 없으면 coverThumbUrl 은 비어 있다 — 화면이 원본으로 떨어진다", async () => {
    listRows = [{
      id: "b", user_id: "user-1", title: "t", tool: "create", image_count: 1,
      cover_path: "user-1/b/0.png", cover_thumb_path: null,
      created_at: "2026-01-01",
    }];

    const items = await listLibraryItems({ userId: "user-1", role: "member" });

    expect(items[0]!.coverUrl).toBe("signed:user-1/b/0.png");
    expect(items[0]!.coverThumbUrl).toBeNull();
  });

  it("두 주소를 한 번에 서명한다 — 왕복을 늘리지 않는다", async () => {
    listRows = [{
      id: "a", user_id: "user-1", title: "t", tool: "create", image_count: 1,
      cover_path: "user-1/a/0.webp", cover_thumb_path: "user-1/a/0.thumb.webp",
      created_at: "2026-01-01",
    }];

    await listLibraryItems({ userId: "user-1", role: "member" });

    expect(signedPaths.sort()).toEqual(["user-1/a/0.thumb.webp", "user-1/a/0.webp"]);
  });
});

describe("deleteLibraryItem — 못 읽으면 지우지 않는다", () => {
  it("그림 목록 질의가 실패하면 행을 지우지 않고 알린다", async () => {
    // 컬럼이 아직 없으면 질의가 400 을 낸다. 그때 조용히 넘어가면 행만
    // 사라지고 파일은 전부 남는데 화면에는 「지웠다」가 뜬다.
    failImageSelect = true;

    const result = await deleteLibraryItem({ userId: "user-1", role: "member" }, "a");

    expect(result.ok).toBe(false);
    expect(removed).toHaveLength(0);
  });
});
