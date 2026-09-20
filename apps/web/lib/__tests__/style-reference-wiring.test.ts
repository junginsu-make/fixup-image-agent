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
/** 어떤 칸으로 좁혔는지. 「내 것만」이 빠지면 여기서 드러난다. */
const eqCalls: Array<[string, unknown]> = [];
/** 어느 구간을 달라고 했는지. 쪽 나누기가 실제로 질의까지 가는지 본다. */
let rangeCall: [number, number] | null = null;
/** 표에 실제로 있는 행 수. 화면에 보이는 수와 다를 수 있다. */
let totalCount = 0;
/** 표가 대답을 못 한 경우. 「없다」와 다르다. */
let listError: { message: string } | null = null;
let selectOptions: Record<string, unknown> | undefined;

function builderFor(table: string) {
  const self: Record<string, unknown> = {
    select: (columns: string, options?: Record<string, unknown>) => {
      selectedColumns = columns; selectOptions = options; return self;
    },
    range: (from: number, to: number) => { rangeCall = [from, to]; return self; },
    insert: () => self,
    update: (row: Record<string, unknown>) => { updated = { ...(updated ?? {}), ...row }; return self; },
    delete: () => self,
    eq: (column: string, value: unknown) => { eqCalls.push([column, value]); return self; },
    or: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    single: async () => ({ data: { id: "s1" }, error: null }),
    maybeSingle: async () => ({ data: deleteRow, error: null }),
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({
        data: table === "style_references" ? listRows : [],
        count: totalCount,
        error: listError,
      })),
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
  selectedColumns = ""; deleteRow = null; eqCalls.length = 0;
  rangeCall = null; totalCount = 0; selectOptions = undefined; listError = null;
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

    const { references: [row] } = await mod.listUserStyleReferences("u1");

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

    const { references: [row] } = await mod.listUserStyleReferences("u1");

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

  /**
   * **지운 것과 없던 것을 갈라 답한다**(C-10-c).
   *
   * 라우트는 이 값 하나로 200 멱등과 404 를 가른다. 라우트 시험은 이 함수를
   * 통째로 흉내 내므로, **여기서 안 재면 「멱등이다」의 실제 근거가 무방비**다.
   */
  it("**있던 것을 지웠으면 그렇게 말한다**", async () => {
    deleteRow = { path: "u1/s1.png", thumb_path: null };

    expect((await mod.deleteUserStyleReference("u1", "s1")).deleted).toBe(true);
  });

  it("**지울 것이 없었으면 그렇게 말한다**", async () => {
    deleteRow = null;

    const result = await mod.deleteUserStyleReference("u1", "없는것");

    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(false);
    // 지울 것이 없으면 창고도 안 건드린다.
    expect(removed).toHaveLength(0);
  });

  it("**내 것만 지운다** — 남의 행이 섞이면 사용자별 분리가 무너진다", async () => {
    deleteRow = { path: "u1/s1.png", thumb_path: null };

    await mod.deleteUserStyleReference("u1", "s1");

    expect(eqCalls).toContainEqual(["user_id", "u1"]);
    expect(eqCalls).toContainEqual(["id", "s1"]);
  });
});

/**
 * **주인을 묻는 길**(C-10-c).
 *
 * 「남의 것 404 / 없는 것 200 멱등」을 함께 만족하려면 사용자 범위 밖의 조회가
 * 필요하다. 라우트는 **지울 것이 없었을 때만** 이것을 부른다.
 */
describe("행의 주인을 물을 때", () => {
  it("**있으면 주인을 돌려준다**", async () => {
    deleteRow = { user_id: "다른사람" };

    expect(await mod.ownerOfStyleReference("s1")).toBe("다른사람");
  });

  it("없으면 null 이다", async () => {
    deleteRow = null;

    expect(await mod.ownerOfStyleReference("s1")).toBeNull();
  });

  it("**그 id 만 본다** — 좁히지 않으면 아무 행의 주인이나 답한다", async () => {
    deleteRow = { user_id: "u1" };

    await mod.ownerOfStyleReference("s9");

    expect(eqCalls).toContainEqual(["id", "s9"]);
  });

  it("**사용자로는 안 좁힌다** — 좁히면 남의 것과 없는 것을 못 가른다", async () => {
    deleteRow = { user_id: "다른사람" };

    await mod.ownerOfStyleReference("s1");

    expect(eqCalls.map(([column]) => column)).not.toContain("user_id");
  });
});

/**
 * **200개 뒤를 조용히 숨기고 있었다**(C-7).
 *
 * 목록은 `.limit(200)` 으로 잘렸고, 라우트는 그 길이를 `total` 이라 불렀다.
 * 레퍼런스가 240장이면 화면은 **「200장」이라고 말하면서 40장을 안 보여 준다.**
 * 사용자는 올린 것이 사라진 줄 안다.
 *
 * 설계 §12: 「레퍼런스 목록은 pagination 을 제공한다. **200개 이후 보이지 않게
 * 숨기지 않는다.**」
 */
describe("디자인 레퍼런스 목록 — 쪽 나누기", () => {
  const 행 = (id: string) => ({
    id, name: id, source: "upload", description: "d",
    path: `u1/${id}.png`, thumb_path: null, created_at: "2026-01-01",
  });

  it("**전체 수를 사실대로 센다** — 보이는 수와 가진 수는 다르다", async () => {
    listRows = [행("s1"), 행("s2")];
    totalCount = 240;

    const page = await mod.listUserStyleReferences("u1");

    expect(page.references).toHaveLength(2);
    expect(page.total).toBe(240);
    // 세어 달라고 말해야 센다.
    expect(selectOptions).toMatchObject({ count: "exact" });
  });

  it("**달라는 구간을 질의에 싣는다**", async () => {
    listRows = [행("s1")];
    totalCount = 240;

    await mod.listUserStyleReferences("u1", { limit: 50, offset: 100 });

    expect(rangeCall).toEqual([100, 149]);
  });

  it("**다음 쪽이 있으면 어디부터인지 말한다**", async () => {
    listRows = [행("s1")];
    totalCount = 240;

    const page = await mod.listUserStyleReferences("u1", { limit: 100, offset: 0 });

    expect(page.nextOffset).toBe(100);
  });

  it("**마지막 쪽이면 다음이 없다**", async () => {
    listRows = [행("s1")];
    totalCount = 40;

    const page = await mod.listUserStyleReferences("u1", { limit: 100, offset: 0 });

    expect(page.nextOffset).toBeNull();
  });

  /**
   * **한 번에 다 달라고 해도 상한이 있다.** 서명 URL 을 그 수만큼 만들어야
   * 하므로, 막지 않으면 목록 한 번이 창고를 때린다.
   */
  it("**터무니없는 크기는 조인다**", async () => {
    listRows = [];
    totalCount = 0;

    await mod.listUserStyleReferences("u1", { limit: 99999, offset: 0 });

    expect(rangeCall![1] - rangeCall![0] + 1).toBeLessThanOrEqual(200);
  });

  it("**음수 자리는 처음으로 본다**", async () => {
    listRows = [];

    await mod.listUserStyleReferences("u1", { limit: 10, offset: -5 });

    expect(rangeCall).toEqual([0, 9]);
  });
});

/**
 * **「못 불러왔다」와 「없다」는 다르다.**
 *
 * 전에는 표가 대답을 못 해도 빈 배열이었다. 이제 화면이 그 수를 「N장」이라고
 * 단언하므로, 같은 모양으로 두면 **레퍼런스가 사라진 것처럼 보인다.**
 */
describe("목록을 못 불러왔을 때", () => {
  it("**못 불러왔다고 말한다**", async () => {
    listError = { message: "연결 실패" };

    const page = await mod.listUserStyleReferences("u1");

    expect(page.failed).toBe(true);
  });

  it("비어 있는 것은 실패가 아니다", async () => {
    listRows = [];
    totalCount = 0;

    const page = await mod.listUserStyleReferences("u1");

    expect(page.failed).toBe(false);
  });
});
