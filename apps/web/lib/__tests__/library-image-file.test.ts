import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * 그림 한 장을 우리 서버가 직접 내려 준다.
 *
 * 지금까지 라이브러리 그림은 Storage 서명 URL 로 **바로** 나갔다. 그래서
 * 내려받는 형식을 우리가 정할 수 없었다. 저장을 WebP 로 바꾸면서 받는 파일도
 * `.webp` 가 되는데, 오래된 편집기는 그걸 못 연다.
 *
 * 이 길이 생기면 우리 손을 거치므로 PNG 로 되돌려 줄 수 있다. 대신 **남의 것을
 * 막는 일도 이제 우리 몫**이다 — 서명 URL 이 하던 일을 코드가 대신한다.
 */

const queries: Array<{ column: string; value: unknown }> = [];
let rows: Array<Record<string, unknown>> = [];
let downloaded: string | null = null;
let stored = Buffer.alloc(0);

/**
 * 이제 질의가 둘이다 — 부모(작업물)를 먼저 확인하고 자식(그림)을 읽는다.
 *
 * `library_images` 에는 `team_id` 가 없어서, 팀에서 보이는지는 부모를 통해
 * 판정한다. 양쪽에 칸을 달면 둘이 어긋나는 날이 온다.
 */
let parentVisible = true;

function builder(table: string) {
  const isParent = table === "library_items";
  const self: Record<string, unknown> = {
    select: () => self,
    order: () => self,
    eq: (column: string, value: unknown) => { queries.push({ column, value }); return self; },
    or: (filter: string) => { queries.push({ column: "or", value: filter }); return self; },
    maybeSingle: async () => ({ data: parentVisible ? { id: "item-1" } : null, error: null }),
    then: (resolve: (r: unknown) => unknown) =>
      Promise.resolve(resolve({ data: isParent ? [{ id: "item-1" }] : rows, error: null })),
  };
  return self;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloaded = path;
          return { data: { arrayBuffer: async () => stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength) }, error: null };
        },
      }),
    },
  }),
}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../watermark", () => ({ markAsAi: async (b: Buffer) => b }));

const { getLibraryImageFile } = await import("../server-library");

const MEMBER = { userId: "member-1", role: "member" as const };
const ADMIN = { userId: "admin-1", role: "admin" as const };

beforeEach(async () => {
  queries.length = 0;
  downloaded = null;
  parentVisible = true;
  stored = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#2277cc" } })
    .webp({ lossless: true }).toBuffer();
  rows = [{ path: "owner-9/item-1/0.webp", mime_type: "image/webp" }];
});

describe("getLibraryImageFile", () => {
  it("혼자면 자기 것만 연다", async () => {
    await getLibraryImageFile(MEMBER, "item-1", 0);

    // 부모를 확인할 때 걸린다. 자식에는 안 건다 — 부모가 이미 정했다.
    expect(queries).toContainEqual({ column: "user_id", value: "member-1" });
  });

  it("팀에 있으면 팀 것도 연다", async () => {
    // 목록에 보이는데 눌러서 안 열리는 것이 없어야 한다.
    await getLibraryImageFile({ ...MEMBER, teamId: "team-1" }, "item-1", 0);

    expect(queries).toContainEqual({ column: "or", value: "team_id.eq.team-1,user_id.eq.member-1" });
  });

  it("관리자는 조건 없이 본다", async () => {
    await getLibraryImageFile(ADMIN, "item-1", 0);

    expect(queries.some((q) => q.column === "user_id")).toBe(false);
    expect(queries.some((q) => q.column === "or")).toBe(false);
    expect(queries).toContainEqual({ column: "item_id", value: "item-1" });
    expect(queries).toContainEqual({ column: "position", value: 0 });
  });

  it("남의 작업물이면 그림을 안 읽는다", async () => {
    // **부모에서 막힌다.** 자식 표에 조건이 없으므로, 여기서 안 막으면
    // 남의 item_id 하나로 남의 그림이 나간다.
    parentVisible = false;

    expect(await getLibraryImageFile(MEMBER, "item-1", 0)).toBeNull();
    expect(queries.some((q) => q.column === "position")).toBe(false);
  });

  it("표에 없으면 null 이다", async () => {
    rows = [];

    expect(await getLibraryImageFile(MEMBER, "item-1", 0)).toBeNull();
  });

  it("경로는 표에 적힌 것을 쓴다 — 주소로 받은 값을 이어 붙이지 않는다", async () => {
    await getLibraryImageFile(MEMBER, "item-1", 0);

    expect(downloaded).toBe("owner-9/item-1/0.webp");
  });

  it("mime 은 실제 바이트로 정한다 — 표의 값을 믿지 않는다", async () => {
    // 표의 mime_type 은 화면이 보낸 문자열이 그대로 들어올 수 있는 칸이다.
    // 그 값을 헤더로 흘리면 같은 출처에서 임의 문서가 열린다.
    rows = [{ path: "owner-9/item-1/0.webp", mime_type: "text/html" }];

    const file = await getLibraryImageFile(MEMBER, "item-1", 0);

    expect(file?.mimeType).toBe("image/webp");
  });

  it("알 수 없는 바이트는 그림이라고 말하지 않는다", async () => {
    stored = Buffer.from("<script>alert(1)</script>");

    const file = await getLibraryImageFile(MEMBER, "item-1", 0);

    expect(file?.mimeType).toBe("application/octet-stream");
  });
});
