import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 계정 보관 작업(상세페이지·리디자인)을 **내 것으로 복사한다.**
 *
 * 여기서 보는 것은 잘 될 때가 아니라 **깨질 때**다. 복사는 표 하나와 파일
 * 여러 장을 건드리는데, 중간에 멈추면 무엇이 남는지가 전부다.
 *
 * 세 가지를 잰다.
 *
 *   1. 깨지면 **아무것도 안 남는다** — 되돌린다
 *   2. 못 옮긴 장은 **행도 안 적는다** — 있다고 거짓말하지 않는다
 *   3. 원본 목록을 못 읽으면 **성공이라고 하지 않는다**
 */
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));

/** 이번 시험에서 업로드가 실패할 경로들. */
let failUploads = new Set<string>();
/** 그림 목록을 읽을 때 낼 오류. */
let imagesError: { message: string } | null = null;
/** `library_images` 에 넣을 때 낼 오류. */
let insertError: { message: string } | null = null;
/** 지금 넣는 중인가. 조회 오류와 삽입 오류를 가르는 데 쓴다. */
let inserting = false;

let sourceRow: Record<string, unknown> | null = null;
let imageRows: Array<Record<string, unknown>> = [];

const uploaded: string[] = [];
const removed: string[][] = [];
const deletedItems: string[] = [];
const insertedImages: Array<Record<string, unknown>> = [];
let itemUpdate: Record<string, unknown> | null = null;

function builderFor(table: string) {
  const self: Record<string, unknown> = {
    select: () => self,
    order: () => self,
    eq: () => self,
    insert: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      if (table === "library_images") {
        // **조회와 삽입을 가른다.** 같은 표에 같은 오류를 돌려주면, 삽입이
        // 실패하는 경우를 재려다 조회부터 실패해 그 길을 못 본다.
        inserting = true;
        insertedImages.push(...(row as Array<Record<string, unknown>>));
      }
      return self;
    },
    update: (row: Record<string, unknown>) => {
      if (table === "library_items" && !("team_id" in row)) itemUpdate = row;
      return self;
    },
    delete: () => ({ eq: (_col: string, id: string) => {
      deletedItems.push(id);
      return Promise.resolve({ error: null });
    } }),
    maybeSingle: async () => ({ data: sourceRow, error: null }),
    single: async () => ({ data: { id: "새작업" }, error: null }),
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve(
        table === "library_images"
          ? inserting
            ? { data: null, error: insertError }
            : { data: imagesError ? null : imageRows, error: imagesError }
          : { data: [], error: null },
      )),
  };
  return self;
}

vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }),
        upload: async (path: string) => {
          if (failUploads.has(path)) return { error: { message: "저장소가 거절했습니다." } };
          uploaded.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
          error: null,
        }),
      }),
    },
  }),
}));

const { copyLibraryWorkToSelf } = await import("../store");

function source(): Record<string, unknown> {
  return { title: "흑초 상세페이지", tool: "create", aspect_ratio: "4:5", data: { summary: "요약" } };
}

function image(position: number): Record<string, unknown> {
  return {
    position,
    path: `회원A/원본/${position}.png`,
    mime_type: "image/png",
    thumb_path: `회원A/원본/${position}.thumb.webp`,
  };
}

beforeEach(() => {
  failUploads = new Set();
  imagesError = null;
  insertError = null;
  sourceRow = source();
  imageRows = [image(0), image(1)];
  uploaded.length = 0;
  removed.length = 0;
  deletedItems.length = 0;
  insertedImages.length = 0;
  itemUpdate = null;
  inserting = false;
});

describe("잘 될 때", () => {
  it("그림을 내 자리로 옮기고 행을 적는다", async () => {
    expect(await copyLibraryWorkToSelf("원본", "관리자B")).toEqual({ id: "새작업" });

    expect(uploaded).toEqual([
      "관리자B/새작업/0.png", "관리자B/새작업/0.thumb.webp",
      "관리자B/새작업/1.png", "관리자B/새작업/1.thumb.webp",
    ]);
    expect(insertedImages).toHaveLength(2);
    expect(itemUpdate).toMatchObject({
      image_count: 2,
      cover_path: "관리자B/새작업/0.png",
      cover_thumb_path: "관리자B/새작업/0.thumb.webp",
    });
  });
});

describe("못 옮긴 장은 있다고 하지 않는다", () => {
  it("옮기지 못한 장은 행도 안 적는다", async () => {
    /*
      전에는 옮기기 결과와 무관하게 행을 전부 적었다. 5장짜리에서 한 장이
      실패하면 행 5개에 파일 4개가 되어, 카드에는 「5장 묶음」인데 열면
      4장이었다. 「그림 없는 내 작업」보다 한 단계 나쁜 **거짓말하는 작업**이다.
    */
    failUploads.add("관리자B/새작업/1.png");

    await copyLibraryWorkToSelf("원본", "관리자B");

    expect(insertedImages).toHaveLength(1);
    expect(insertedImages[0]).toMatchObject({ position: 0 });
    expect(itemUpdate).toMatchObject({ image_count: 1 });
  });

  it("작은 사본만 실패하면 그 장은 살린다", () => {
    // 사본은 없어도 화면이 원본으로 떨어진다. 그것 때문에 장을 버리지 않는다.
    failUploads.add("관리자B/새작업/0.thumb.webp");

    return copyLibraryWorkToSelf("원본", "관리자B").then(() => {
      expect(insertedImages).toHaveLength(2);
      expect(insertedImages[0]).toMatchObject({ position: 0, thumb_path: null });
    });
  });

  it("한 장도 못 옮기면 던진다", async () => {
    /*
      **빈 작업을 「복사 성공」이라고 하지 않는다.** 화면은 새 작업으로
      옮겨 가서 「볼 수 있는 그림이 없습니다」를 보여 주는데, 원본에는 그림이
      멀쩡히 있다.
    */
    failUploads.add("관리자B/새작업/0.png");
    failUploads.add("관리자B/새작업/1.png");

    await expect(copyLibraryWorkToSelf("원본", "관리자B")).rejects.toThrow();
    expect(deletedItems).toContain("새작업");
  });
});

describe("깨지면 아무것도 안 남는다", () => {
  it("행을 못 적으면 만든 작업과 옮긴 파일을 되돌린다", async () => {
    /*
      되돌리지 않으면 `image_count: 0` 에 표지도 없는 행이 남는데, 목록이
      그런 행을 걸러 내므로(`library-works.ts`) **아무 화면에도 안 보인다.**
      지울 손잡이가 없어 파일까지 영영 남는다. 같은 표를 쓰는
      `saveLibraryItem` 은 이미 되돌린다 — 규칙이 둘이면 안 된다.
    */
    insertError = { message: "넣지 못했습니다." };

    await expect(copyLibraryWorkToSelf("원본", "관리자B")).rejects.toThrow();

    expect(deletedItems).toContain("새작업");
    // 파일을 **먼저** 지운다. 행이 먼저 사라지면 경로를 잃는다.
    expect(removed.flat()).toEqual(expect.arrayContaining(["관리자B/새작업/0.png"]));
  });

  it("원본 그림 목록을 못 읽으면 성공이라고 하지 않는다", async () => {
    /*
      전에는 오류를 안 받아서 빈 배열로 읽혔고, 아무것도 안 적은 채
      `ok` 와 새 id 를 돌려줬다. `deleteLibraryItem` 이 「못 읽으면 아무것도
      지우지 않는다」로 같은 함정을 이미 막아 두었다.
    */
    imagesError = { message: "읽지 못했습니다." };

    await expect(copyLibraryWorkToSelf("원본", "관리자B")).rejects.toThrow();
    expect(deletedItems).toContain("새작업");
  });

  it("원본이 없으면 아무것도 만들지 않는다", async () => {
    sourceRow = null;

    await expect(copyLibraryWorkToSelf("없는-id", "관리자B")).rejects.toThrow();
    expect(deletedItems).toHaveLength(0);
  });
});
