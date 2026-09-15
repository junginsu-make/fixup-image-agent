import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * 상세페이지 디자인 레퍼런스도 **사본을 쓴다.**
 *
 * `reference-wiring.test.ts` 가 지키는 규약("격자는 사본, 확대와 생성 입력은
 * 원본")이 이 표에서는 지켜지지 않았다. 앞선 두 작업이 여섯 표를 채우는 동안
 * 여기만 빠져서, 상세페이지·리디자인의 불러오기 창이 아직 원본을 받는다.
 *
 * **실패 신호가 없는 종류의 사고다.** 화면은 멀쩡히 뜨고 느리기만 하다.
 */

vi.mock("server-only", () => ({}));

const uploads: Array<{ path: string; contentType: string }> = [];
const removed: string[][] = [];
let updated: Record<string, unknown> | null = null;
let listRows: Array<Record<string, unknown>> = [];
let selectedColumns = "";
let signedPaths: string[] = [];
let deleteRow: Record<string, unknown> | null = null;

function builderFor(table: string) {
  const self: Record<string, unknown> = {
    select: (columns: string) => { selectedColumns = columns; return self; },
    insert: () => self,
    update: (row: Record<string, unknown>) => { updated = { ...(updated ?? {}), ...row }; return self; },
    delete: () => self,
    eq: () => self,
    or: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    single: async () => ({ data: { id: "s1" }, error: null }),
    maybeSingle: async () => ({ data: deleteRow, error: null }),
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({ data: table === "style_references" ? listRows : [], error: null })),
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

vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));

// 저장 경로는 이미지를 Gemini 에 보내 설명을 받는다. 그 왕복은 이 시험의 관심이
// 아니다 — 사본이 만들어지고 표에 적히는가만 본다.
vi.mock("@fixup/pdp-core", () => ({ analyzeStyleImage: async () => "설명" }));
vi.mock("../pdp/providers", () => ({ createPdpLlmOrNull: () => null }));
vi.mock("../pdp/slice-image", () => ({
  sliceTallReference: async (input: { imageBase64: string; mimeType: string }) => [input],
}));

const mod = await import("../user-style-references");

async function photo(): Promise<Buffer> {
  const w = 900, h = 900, px = Buffer.alloc(w * h * 4);
  let seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 24; };
  for (let i = 0; i < w * h; i += 1) {
    px[i * 4] = Math.min(255, (i % w) % 200 + noise());
    px[i * 4 + 1] = Math.min(255, 140 + noise());
    px[i * 4 + 2] = Math.min(255, 90 + noise());
    px[i * 4 + 3] = 255;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

beforeEach(() => {
  uploads.length = 0; removed.length = 0;
  updated = null; listRows = []; signedPaths = [];
  selectedColumns = ""; deleteRow = null;
});

describe("디자인 레퍼런스를 저장할 때 — 사본 배선", () => {
  it("원본과 사본을 함께 올리고 자리를 표에 적는다", async () => {
    const bytes = await photo();

    await mod.registerUserStyleReference({
      userId: "u1", name: "겨울 상세", source: "generated",
      imageBase64: bytes.toString("base64"), mimeType: "image/png",
    });

    expect(uploads.map((u) => u.path)).toEqual(["u1/s1.png", "u1/s1.thumb.webp"]);
    expect(uploads[1]!.contentType).toBe("image/webp");
    // **자리를 안 적으면 기능이 통째로 죽는다.** 파일은 쌓이는데 아무도 못 찾는다.
    expect(updated!.thumb_path).toBe("u1/s1.thumb.webp");
    expect(updated!.path).toBe("u1/s1.png");
  });
});

describe("디자인 레퍼런스 목록 — 사본 주소", () => {
  it("사본 자리를 질의에서 고른다", async () => {
    listRows = [{
      id: "s1", name: "겨울", source: "generated", description: "d",
      path: "u1/s1.png", thumb_path: "u1/s1.thumb.webp", created_at: "2026-01-01",
    }];

    await mod.listUserStyleReferences("u1");

    // 칸을 안 고르면 행에 값이 안 실려 와 아래 서명도 못 한다.
    expect(selectedColumns).toContain("thumb_path");
  });

  it("원본과 사본을 함께 서명해 둘 다 돌려준다", async () => {
    listRows = [{
      id: "s1", name: "겨울", source: "generated", description: "d",
      path: "u1/s1.png", thumb_path: "u1/s1.thumb.webp", created_at: "2026-01-01",
    }];

    const [row] = await mod.listUserStyleReferences("u1");

    expect(signedPaths.sort()).toEqual(["u1/s1.png", "u1/s1.thumb.webp"]);
    // 격자는 사본, 고르기와 생성 입력은 원본이다.
    expect(row!.url).toBe("signed:u1/s1.png");
    expect(row!.thumbUrl).toBe("signed:u1/s1.thumb.webp");
  });

  it("사본이 없는 옛 항목은 비어 있다", async () => {
    // 여기서 원본으로 **떨어뜨리지 않는다.** 떨어뜨리면 화면 쪽에서 사본인지
    // 원본인지 구분할 수 없어진다 — 떨어뜨릴지는 거는 쪽(`grid-src.ts`)이 정한다.
    listRows = [{
      id: "s1", name: "겨울", source: "generated", description: "d",
      path: "u1/s1.png", thumb_path: null, created_at: "2026-01-01",
    }];

    const [row] = await mod.listUserStyleReferences("u1");

    expect(row!.thumbUrl).toBeNull();
    expect(row!.url).toBe("signed:u1/s1.png");
    expect(signedPaths).toEqual(["u1/s1.png"]);
  });
});

describe("디자인 레퍼런스를 지울 때", () => {
  it("원본과 사본을 한 번에 지운다", async () => {
    // 사본만 남으면 아무도 못 찾는 파일이 저장소에 쌓인다.
    deleteRow = { path: "u1/s1.png", thumb_path: "u1/s1.thumb.webp" };

    await mod.deleteUserStyleReference("u1", "s1");

    expect(removed.flat().sort()).toEqual(["u1/s1.png", "u1/s1.thumb.webp"]);
  });

  it("사본이 없는 옛 항목은 원본만 지운다", async () => {
    deleteRow = { path: "u1/s1.png", thumb_path: null };

    await mod.deleteUserStyleReference("u1", "s1");

    expect(removed.flat()).toEqual(["u1/s1.png"]);
  });
});
