import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * 첫 화면 갤러리의 표시용 사본.
 *
 * 갤러리는 `next/image` 를 쓰므로 **브라우저로 나가는 양은 이미 줄어 있다.**
 * 그래도 사본이 필요한 이유는 둘이다.
 *
 * 1. next/image 는 줄이기 전에 **원본을 통째로** 받아 온다. 배포할 때마다 그
 *    캐시가 비므로, 걸어 둔 그림 수만큼 2~4MB 씩 다시 오간다.
 * 2. 크기를 못 잰 그림은 `next/image` 를 못 쓰고 원본이 그대로 브라우저까지 간다.
 *
 * 라이브러리 목록(512px)보다 크게 잡는다. 갤러리는 제품의 첫인상이고 화면에서
 * 24vw 로 뜨므로, 4K 에서 920px 까지 커진다. 512 로 줄이면 흐릿해진다.
 */

interface Uploaded { path: string; bytes: Buffer; contentType: string }

const uploads: Uploaded[] = [];
const removed: string[][] = [];
let inserted: Record<string, unknown> | null = null;
let itemRow: Record<string, unknown> | null = null;
let sourceRow: Record<string, unknown> | null = null;
let downloadedPath: string | null = null;
const conditions: Array<[string, unknown]> = [];
let failThumbUpload = false;
let failInsert = false;
let failThumbDownload = false;
let storedBytes: Buffer = Buffer.alloc(0);

function builderFor(table: string) {
  const self: Record<string, unknown> = {
    select: () => self,
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      if (failInsert) {
        return { then: (r: (x: unknown) => unknown) => Promise.resolve(r({ error: { message: "duplicate key" } })) };
      }
      return self;
    },
    update: () => self,
    delete: () => self,
    // **조건을 기록한다.** 그냥 흘려보내면 질의가 `visible` 을 보는지 아닌지
    // 시험할 방법이 없다 — 빈 결과를 주면 null 이 나오는 것만 확인될 뿐이다.
    eq: (column: string, value: unknown) => { conditions.push([column, value]); return self; },
    order: () => self,
    limit: () => self,
    maybeSingle: async () => ({ data: table === "showcase_items" ? itemRow : sourceRow, error: null }),
    // findSourceImage 는 maybeSingle 이 아니라 await query 로 받는다.
    then: (r: (x: unknown) => unknown) =>
      Promise.resolve(r({ data: table === "library_images" && sourceRow ? [sourceRow] : [], error: null })),
  };
  return self;
}

// store.ts 는 `server-only` 를 부르는데 시험 환경에는 그 꾸러미가 없다.
vi.mock("server-only", () => ({}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Buffer, o: { contentType: string }) => {
          if (failThumbUpload && path.includes("thumb")) return { error: { message: "사본 업로드 실패" } };
          uploads.push({ path, bytes, contentType: o.contentType });
          return { error: null };
        },
        remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
        download: async (path: string) => {
          if (failThumbDownload && path.includes("thumb")) return { data: null, error: { message: "없는 파일" } };
          downloadedPath = path;
          const b = new Uint8Array(storedBytes);
          return { data: { arrayBuffer: async () => b.buffer }, error: null };
        },
      }),
    },
  }),
}));
vi.mock("../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));

const { addShowcaseItem, readShowcaseImage, removeShowcaseItem } = await import("../store");
const { showcaseThumbUrl } = await import("../core");

async function photoPng(width = 1400, height = 1400): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 7;
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

beforeEach(async () => {
  uploads.length = 0; removed.length = 0; conditions.length = 0;
  failThumbUpload = false; failInsert = false; failThumbDownload = false;
  inserted = null; itemRow = null; downloadedPath = null;
  storedBytes = await photoPng();
  sourceRow = { path: "user-1/item/0.png", user_id: "user-1", position: 0 };
});

describe("addShowcaseItem — 표시용 사본", () => {
  it("원본과 함께 표시용 사본을 만들어 둔다", async () => {
    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    const thumb = uploads.find((u) => u.path.includes("thumb"));
    expect(thumb).toBeDefined();
    expect(thumb!.contentType).toBe("image/webp");
    const meta = await sharp(thumb!.bytes).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1024);
    expect(thumb!.bytes.length).toBeLessThan(storedBytes.length);
  });

  it("사본의 자리를 표에 적어 둔다", async () => {
    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    expect(inserted!.thumb_path).toEqual(expect.stringContaining("thumb"));
  });
});

describe("readShowcaseImage — 어느 것을 내보내나", () => {
  it("사본을 달라면 사본을 준다", async () => {
    itemRow = { storage_path: "showcase/x.png", thumb_path: "showcase/x.thumb.webp", mime_type: "image/png" };

    const image = await readShowcaseImage("x", "thumb");

    expect(downloadedPath).toBe("showcase/x.thumb.webp");
    expect(image!.mimeType).toBe("image/webp");
  });

  it("사본이 없으면 원본으로 떨어진다 — 옛 항목이 안 깨진다", async () => {
    itemRow = { storage_path: "showcase/y.png", thumb_path: null, mime_type: "image/png" };

    const image = await readShowcaseImage("y", "thumb");

    expect(downloadedPath).toBe("showcase/y.png");
    expect(image!.mimeType).toBe("image/png");
  });

  it("사본 파일이 사라졌으면 원본으로 떨어진다 — 첫 화면이 비면 안 된다", async () => {
    // 표에는 자리가 적혀 있는데 파일만 없어질 수 있다(손으로 지웠거나 되돌리는
    // 중이거나). 그때 404 를 내면 원본이 멀쩡한데도 첫 화면의 그림이 빈다.
    itemRow = { storage_path: "showcase/y.png", thumb_path: "showcase/y.thumb.webp", mime_type: "image/png" };
    failThumbDownload = true;

    const image = await readShowcaseImage("y", "thumb");

    expect(image).not.toBeNull();
    expect(downloadedPath).toBe("showcase/y.png");
    expect(image!.mimeType).toBe("image/png");
  });

  it("꺼 놓은 그림은 사본으로도 못 본다", async () => {
    // 목록에서만 걸러 두면 주소를 아는 사람이 계속 본다. 사본 주소도 같다.
    itemRow = null;

    expect(await readShowcaseImage("z", "thumb")).toBeNull();
  });
});

describe("removeShowcaseItem — 사본도 함께 지운다", () => {
  it("원본과 사본을 한 번에 지운다", async () => {
    itemRow = { storage_path: "showcase/x.png", thumb_path: "showcase/x.thumb.webp" };

    await removeShowcaseItem("x");

    expect(removed.flat().sort()).toEqual(["showcase/x.png", "showcase/x.thumb.webp"]);
  });
});

describe("readShowcaseImage — 안전 장치와 갈래", () => {
  beforeEach(() => {
    itemRow = { storage_path: "showcase/x.png", thumb_path: "showcase/x.thumb.webp", mime_type: "image/png" };
  });

  it("질의가 visible 을 본다 — 이 조건이 꺼 놓은 그림을 막는 전부다", async () => {
    // 결과가 null 인지만 보면 「DB 가 빈 결과를 주면 null 을 준다」를 증명할
    // 뿐이다. 조건 자체가 붙었는지를 봐야 이 방어가 사라진 것을 알아챈다.
    await readShowcaseImage("x", "thumb");

    expect(conditions).toContainEqual(["visible", true]);
  });

  it("원본을 달라면 사본이 있어도 원본을 준다", async () => {
    const image = await readShowcaseImage("x", "full");

    expect(downloadedPath).toBe("showcase/x.png");
    expect(image!.mimeType).toBe("image/png");
  });

  it("따로 말하지 않으면 원본이다", async () => {
    await readShowcaseImage("x");

    expect(downloadedPath).toBe("showcase/x.png");
  });
});

describe("표시용 사본의 경계", () => {
  it("이미 작은 그림은 사본을 두지 않는다", async () => {
    storedBytes = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#3a7fd5" } })
      .webp({ quality: 82 }).toBuffer();

    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    expect(uploads.some((u) => u.path.includes("thumb"))).toBe(false);
    expect(inserted!.thumb_path).toBeNull();
  });

  it("작은 그림을 늘리지 않는다", async () => {
    storedBytes = await photoPng(300, 300);

    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    const thumb = uploads.find((u) => u.path.includes("thumb"));
    if (thumb) expect((await sharp(thumb.bytes).metadata()).width).toBeLessThanOrEqual(300);
  });

  it("세로로 긴 그림도 가로를 1024 로 지킨다 — 열 폭은 가로만 제약한다", async () => {
    // 갤러리는 열로 흘려 배치하므로 **가로만** 제약된다. 긴 변을 묶으면
    // 세로로 긴 그림의 가로가 576px 까지 깎이는데, 열 최대 폭 364.5px 를
    // 고해상도 화면에서 채우려면 729px 이 필요하다 — 브라우저가 늘려 그려
    // 흐려진다. 이 제품의 결과물은 포스터·카드뉴스라 세로가 기본이다.
    storedBytes = await photoPng(1232, 2192);

    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    const meta = await sharp(uploads.find((u) => u.path.includes("thumb"))!.bytes).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1822);
  });

  it("비율을 지킨다 — 갤러리 열 배치가 비율에 기댄다", async () => {
    storedBytes = await photoPng(1600, 900);

    await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    const meta = await sharp(uploads.find((u) => u.path.includes("thumb"))!.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 576]);
  });

  it("거는 데 실패하면 사본도 같이 지운다 — 새 id 라 아무 행도 안 가리킨다", async () => {
    // 같은 그림을 두 번 걸면 표의 유일성 제약에 걸린다. 이건 예외가 아니라
    // 정상 갈래다. 그때 사본을 안 지우면 아무도 못 찾는 파일이 영영 남는다.
    failInsert = true;

    const result = await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    expect(result.ok).toBe(false);
    expect(removed.flat().length).toBe(2);
    expect(removed.flat().some((path) => path.includes("thumb"))).toBe(true);
  });

  it("사본을 못 올려도 거는 것은 되고, 자리는 비워 둔다", async () => {
    failThumbUpload = true;

    const result = await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    expect(result.ok).toBe(true);
    expect(inserted!.thumb_path).toBeNull();
  });

  it("그림이 아닌 바이트면 사본 없이 넘어간다", async () => {
    storedBytes = Buffer.from("이것은 그림이 아니다");

    const result = await addShowcaseItem({ sourceKind: "library", sourceId: "src-1", imageIndex: 0 }, "admin-1");

    expect(result.ok).toBe(true);
    expect(inserted!.thumb_path).toBeNull();
  });
});

describe("showcaseThumbUrl", () => {
  it("사본을 달라는 표시를 붙인다 — 없으면 배선이 조용히 끊긴다", () => {
    expect(showcaseThumbUrl("abc")).toBe("/api/showcase/abc/file?size=thumb");
  });
});
