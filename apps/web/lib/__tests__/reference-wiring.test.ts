import { beforeEach, describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";

/**
 * 사본을 **실제로 쓰고 있는가.**
 *
 * `grid-thumbnail.ts` 가 아무리 잘 지켜져도 아무도 안 부르면 소용이 없다.
 * 이 저장소는 같은 자리에서 다섯 번 깨졌다 — 만들어 놓고 안 쓰거나, 표에만
 * 적고 읽는 쪽은 다른 곳을 보거나, 지울 때 빠뜨리거나.
 *
 * **실패 신호가 없는 종류의 사고다.** 화면은 멀쩡히 뜨고 용량만 그대로다.
 */

vi.mock("server-only", () => ({}));

const uploads: Array<{ path: string; contentType: string }> = [];
const removed: string[][] = [];
let inserted: Record<string, unknown> | null = null;
let listRows: Array<Record<string, unknown>> = [];
let signedPaths: string[] = [];
let failInsert = false;

function builderFor(table: string) {
  const self: Record<string, unknown> = {
    select: () => self,
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      if (failInsert) {
        const failing = { single: async () => ({ data: null, error: { message: "표 쓰기 실패" } }) };
        return { select: () => failing };
      }
      return self;
    },
    update: () => self,
    delete: () => self,
    eq: () => self,
    // 목록에 팀 조건이 붙는다. 팀이 없으면 「팀이 안 붙은 것 + 내 것」이라
    // 지금까지와 같은 줄이 나온다.
    or: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    single: async () => ({ data: { ...inserted, id: "ref-1", created_at: "2026-01-01" }, error: null }),
    maybeSingle: async () => ({ data: listRows[0] ?? null, error: null }),
    then: (r: (x: unknown) => unknown) =>
      Promise.resolve(r({ data: table === "reference_images" ? listRows : [], error: null })),
  };
  return self;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        upload: async (path: string, _b: Buffer, o: { contentType: string }) => {
          uploads.push({ path, contentType: o.contentType });
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
vi.mock("../local-store", () => ({
  isLocalStoreEnabled: () => false,
  getLocalDatabase: () => ({}),
  localStoreRoot: () => "/tmp",
  listLocalReferenceImages: async () => [],
  removeLocalReferenceFiles: async () => {},
  writeLocalReferenceFile: async () => {},
  insertLocalReferenceImage: async () => ({}),
}));

const { saveReferenceImage, listReferenceImages, removeReferenceImagesByTitle } =
  await import("../reference-images");

async function photo(): Promise<Buffer> {
  const w = 900, h = 900, px = Buffer.alloc(w * h * 4);
  let seed = 4;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 24; };
  for (let i = 0; i < w * h; i += 1) {
    px[i * 4] = Math.min(255, (i % w) % 200 + noise());
    px[i * 4 + 1] = Math.min(255, 120 + noise());
    px[i * 4 + 2] = Math.min(255, 80 + noise());
    px[i * 4 + 3] = 255;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

beforeEach(() => {
  uploads.length = 0; removed.length = 0;
  inserted = null; listRows = []; signedPaths = []; failInsert = false;
});

describe("saveReferenceImage — 사본 배선", () => {
  it("원본과 사본을 함께 올리고 자리를 표에 적는다", async () => {
    await saveReferenceImage({
      userId: "u1", id: "r1", title: "겨울", purpose: "cardnews",
      bytes: await photo(), mimeType: "image/png",
    });

    expect(uploads.map((u) => u.path)).toEqual(["u1/references/r1.png", "u1/references/r1.thumb.webp"]);
    expect(uploads[1]!.contentType).toBe("image/webp");
    // **자리를 안 적으면 기능이 통째로 죽는다.** 파일은 쌓이는데 아무도 못 찾는다.
    expect(inserted!.thumb_path).toBe("u1/references/r1.thumb.webp");
  });

  it("표 쓰기가 엎어지면 사본도 같이 지운다", async () => {
    failInsert = true;

    await saveReferenceImage({
      userId: "u1", id: "r1", title: "겨울", purpose: "cardnews",
      bytes: await photo(), mimeType: "image/png",
    }).catch(() => {});

    expect(removed.flat().sort()).toEqual(["u1/references/r1.png", "u1/references/r1.thumb.webp"]);
  });
});

describe("listReferenceImages — 사본 주소", () => {
  it("원본과 사본을 함께 서명해 둘 다 돌려준다", async () => {
    listRows = [{
      id: "r1", user_id: "u1", storage_path: "u1/references/r1.png",
      thumb_path: "u1/references/r1.thumb.webp",
      title: "겨울", purpose: "cardnews", width: null, height: null, created_at: "2026-01-01",
    }];

    const [image] = await listReferenceImages({ userId: "u1", role: "member" });

    expect(signedPaths.sort()).toEqual(["u1/references/r1.png", "u1/references/r1.thumb.webp"]);
    // 격자는 사본, 확대·fal 전달은 원본이다.
    expect(image!.signedUrl).toBe("signed:u1/references/r1.png");
    expect(image!.thumbUrl).toBe("signed:u1/references/r1.thumb.webp");
  });

  it("사본이 없는 옛 항목은 비어 있다", async () => {
    listRows = [{
      id: "r1", user_id: "u1", storage_path: "u1/references/r1.png", thumb_path: null,
      title: null, purpose: "cardnews", width: null, height: null, created_at: "2026-01-01",
    }];

    const [image] = await listReferenceImages({ userId: "u1", role: "member" });

    expect(image!.thumbUrl).toBeNull();
    expect(image!.signedUrl).toBe("signed:u1/references/r1.png");
  });
});

describe("removeReferenceImagesByTitle — 사본도 지운다", () => {
  it("원본과 사본을 한 번에 지운다", async () => {
    listRows = [{ id: "r1", storage_path: "u1/references/r1.png", thumb_path: "u1/references/r1.thumb.webp" }];

    await removeReferenceImagesByTitle("u1", "겨울");

    expect(removed.flat().sort()).toEqual(["u1/references/r1.png", "u1/references/r1.thumb.webp"]);
  });
});
