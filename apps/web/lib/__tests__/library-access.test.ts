import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 라이브러리의 경계 — 누가 무엇을 보는가.
 *
 * 이 길은 전부 admin 클라이언트로 지나간다. 그래서 RLS 는 여기서 아무것도
 * 막지 않고, **질의에 붙는 조건 하나가 유일한 방어선**이다. 조건이 빠졌다는
 * 사실은 화면에서 안 드러난다 — 자기 것이 그대로 보이고, 남의 것이 몇 줄 더
 * 섞일 뿐이다. 그래서 조건 자체를 여기서 붙잡아 둔다.
 */

const recorded: Array<{ table: string; column: string; value: unknown }> = [];
let tableRows: Record<string, Array<Record<string, unknown>>> = {};

function builderFor(table: string) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    delete: () => builder,
    order: () => builder,
    limit: () => builder,
    not: () => builder,
    in: () => builder,
    eq: (column: string, value: unknown) => {
      recorded.push({ table, column, value });
      return builder;
    },
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(resolve({ data: tableRows[table] ?? [], error: null })),
  };
  return builder;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
          error: null,
        }),
      }),
    },
  }),
}));

// 표기는 sharp 를 부른다. 여기서 시험하는 것은 경계지 그림이 아니다.
vi.mock("../watermark", () => ({ markAsAi: async (bytes: Buffer) => bytes }));

const { libraryScope, listLibraryItems, getLibraryItemImages, deleteLibraryItem, sniffImageMime } =
  await import("../server-library");
const { canModifyReferenceImage, listReferenceImages } = await import("../reference-images");

const MEMBER = { userId: "member-1", role: "member" as const };
const ADMIN = { userId: "admin-1", role: "admin" as const };

/** 이 표에 어떤 소유자 조건이 붙었는가. 안 붙었으면 undefined. */
function ownerConditionOn(table: string): unknown {
  return recorded.find((entry) => entry.table === table && entry.column === "user_id")?.value;
}

beforeEach(() => {
  recorded.length = 0;
  tableRows = {};
});

describe("작업물은 본인 것만", () => {
  it("회원 목록에는 자기 소유자 조건이 붙는다", async () => {
    tableRows.library_items = [];
    await listLibraryItems(MEMBER);
    expect(ownerConditionOn("library_items")).toBe("member-1");
  });

  it("한 건을 열 때도 소유자 조건이 붙는다", async () => {
    tableRows.library_images = [];
    await getLibraryItemImages(MEMBER, "item-1");
    expect(ownerConditionOn("library_images")).toBe("member-1");
  });

  it("남의 것을 열려 해도 조건이 남아 있어 빈 손으로 돌아온다", async () => {
    // 소유자 조건은 그대로 붙는다. DB 가 남의 행을 안 준다는 뜻이다.
    tableRows.library_images = [];
    const images = await getLibraryItemImages(MEMBER, "someone-elses-item");
    expect(ownerConditionOn("library_images")).toBe("member-1");
    expect(images).toEqual([]);
  });
});

describe("관리자는 작업물을 전부 본다", () => {
  it("목록에 소유자 조건을 붙이지 않는다", async () => {
    tableRows.library_items = [];
    await listLibraryItems(ADMIN);
    expect(ownerConditionOn("library_items")).toBeUndefined();
  });

  it("한 건을 열 때도 소유자 조건이 없다", async () => {
    tableRows.library_images = [];
    await getLibraryItemImages(ADMIN, "item-1");
    expect(ownerConditionOn("library_images")).toBeUndefined();
  });

  it("남의 것을 볼 때 누가 만들었는지 함께 준다", async () => {
    tableRows.library_items = [
      { id: "i1", user_id: "member-9", title: "t", tool: "create", image_count: 1, cover_path: null, created_at: "2026-09-01T00:00:00.000Z" },
    ];
    tableRows.profiles = [{ id: "member-9", email: "someone@example.com" }];

    const [item] = await listLibraryItems(ADMIN);
    expect(item.mine).toBe(false);
    expect(item.ownerEmail).toBe("someone@example.com");
  });

  it("회원 목록에는 이메일을 붙이지 않는다", async () => {
    // 전부 자기 것이라 붙일 이유가 없고, 붙이면 회원끼리 이메일이 보인다.
    tableRows.library_items = [
      { id: "i1", user_id: "member-1", title: "t", tool: "create", image_count: 1, cover_path: null, created_at: "2026-09-01T00:00:00.000Z" },
    ];
    tableRows.profiles = [{ id: "member-1", email: "me@example.com" }];

    const [item] = await listLibraryItems(MEMBER);
    expect(item.mine).toBe(true);
    expect(item.ownerEmail).toBeNull();
  });
});

describe("관리자는 지우기도 전체", () => {
  it("관리자 삭제에는 소유자 조건이 안 붙는다", async () => {
    // 잘못 올라온 것을 내릴 수 있는 사람이 아무도 없으면 그대로 남는다.
    tableRows.library_images = [];
    tableRows.library_items = [];
    await deleteLibraryItem(ADMIN, "item-of-someone-else");
    expect(ownerConditionOn("library_items")).toBeUndefined();
  });

  it("회원은 여전히 자기 것만 지운다", async () => {
    tableRows.library_images = [];
    tableRows.library_items = [];
    await deleteLibraryItem(MEMBER, "item-of-someone-else");
    expect(ownerConditionOn("library_items")).toBe("member-1");
  });

  it("규칙 자체가 관리자와 회원을 가른다", () => {
    expect(libraryScope(ADMIN, "read")).toBeNull();
    expect(libraryScope(ADMIN, "delete")).toBeNull();
    expect(libraryScope(MEMBER, "read")).toBe("member-1");
    expect(libraryScope(MEMBER, "delete")).toBe("member-1");
  });
});

describe("참고 이미지는 회원 공용", () => {
  it("목록에 소유자 조건을 붙이지 않는다", async () => {
    tableRows.reference_images = [];
    await listReferenceImages(MEMBER);
    expect(ownerConditionOn("reference_images")).toBeUndefined();
  });

  it("남이 올린 것도 보이되 내 것이 아니라고 표시한다", async () => {
    tableRows.reference_images = [
      {
        id: "r1", user_id: "member-9", storage_path: "member-9/references/r1.png",
        title: "로고", purpose: "both", width: null, height: null,
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ];

    const [image] = await listReferenceImages(MEMBER);
    expect(image.mine).toBe(false);
    expect(image.signedUrl).toBe("signed:member-9/references/r1.png");
    // 회원에게는 올린 사람의 이메일을 주지 않는다.
    expect(image.ownerEmail).toBeNull();
  });

  it("회원끼리는 서로 못 지운다", () => {
    // 남이 올린 본보기를 지우면 그것을 쓰던 사람의 세트와 작업이 조용히
    // 깨지는데, 지운 쪽은 그 사실을 알 길이 없다.
    expect(canModifyReferenceImage(MEMBER, "member-1")).toBe(true);
    expect(canModifyReferenceImage(MEMBER, "member-9")).toBe(false);
  });

  it("관리자는 남이 올린 것도 지운다", () => {
    // 공용 창고라 잘못 올라온 것이 모두에게 보인다. 내릴 사람이 없으면
    // 그대로 남는다.
    expect(canModifyReferenceImage(ADMIN, "member-9")).toBe(true);
    expect(canModifyReferenceImage(ADMIN, "admin-1")).toBe(true);
  });
});

describe("표기를 새긴 그림의 형식", () => {
  it("PNG 로 다시 구워졌으면 알려준 형식 대신 PNG 로 본다", () => {
    // sharp 는 무엇을 받았든 PNG 로 내보낸다. 원래 형식을 그대로 쓰면
    // `.jpg` 라는 이름의 PNG 가 image/jpeg 로 저장된다.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(4),
    ]);
    expect(sniffImageMime(png, "image/jpeg")).toBe("image/png");
  });

  it("손대지 않은 JPEG 은 그대로 JPEG 이다", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9)]);
    expect(sniffImageMime(jpeg, "image/png")).toBe("image/jpeg");
  });

  it("모르는 바이트면 알려준 형식을 믿는다", () => {
    expect(sniffImageMime(Buffer.alloc(16), "image/webp")).toBe("image/webp");
  });
});

/**
 * 내보내기는 관리자에게도 안 넓힌다 (설계 §10 3-e).
 *
 * **「보기」와 「가공해 내보내기」는 무게가 다르다.** 관리자에게 전체를 연
 * 근거는 `libraryScope` 머리말에 적혀 있다 — 「잘못 올라온 것을 치울 방법이
 * 없다」는 운영 판단이다. 그것은 **보고 지우는** 일이고, 광고 내보내기는
 * **가공해서 파일로 내려받는** 일이다. ZIP 이 만들어지는 순간 서비스 밖으로
 * 나가고, 안에는 누구 것인지 적히지 않는다.
 *
 * 게다가 `/ad` 목록은 관리자에게 전 회원 최근 200건을 싣는데 화면이 소유자를
 * 안 보여 준다 — **관리자 자신도 남의 것인 줄 모른 채 뽑는다.**
 *
 * **호출부에서 역할을 지어내 넘기면 안 된다.** `role: "member"` 로 바꿔
 * 부르는 방식은 `ad-export-route.test.ts` 의 「본문에 실린 역할을 믿지
 * 않는다」가 막으려던 바로 그 관례다. 액션 이름으로 가른다.
 */
describe("내보내기 범위", () => {
  it("관리자여도 자기 것만 내보낸다", () => {
    expect(libraryScope({ userId: "admin-1", role: "admin" }, "export")).toBe("admin-1");
  });

  it("회원은 지금까지와 같다", () => {
    expect(libraryScope({ userId: "u1", role: "member" }, "export")).toBe("u1");
  });

  /** 보기·지우기는 안 바뀐다 — 운영자가 그렇게 정했다. */
  it("보기와 지우기는 관리자에게 열린 채로 둔다", () => {
    expect(libraryScope({ userId: "admin-1", role: "admin" }, "read")).toBeNull();
    expect(libraryScope({ userId: "admin-1", role: "admin" }, "delete")).toBeNull();
  });
});
