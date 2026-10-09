import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **라이브러리 그림의 위치가 주인 폴더 밖이면 서버 권한으로 열지도 지우지도 않는다**(2026-10-03 보안 리뷰).
 *
 * 회원이 자기 작업·그림 줄의 위치를 남의 그림 위치로 고쳐 쓸 수 있었다(DB 는 202610030002 로 막았다).
 * 그런 줄이 있어도 서버가 남의 그림을 서명(열람)·다운로드(광고 규격 생성 재료)·삭제하지 않아야 한다.
 * 주인은 **위치를 적은 줄의 `user_id`** 다 — 관리자가 지울 때도 그 줄 주인의 폴더만 지운다.
 */
const me = "72000000-0000-4000-8000-00000000000a";
const other = "72000000-0000-4000-8000-00000000000b";
const mine = `${me}/item-1/0.webp`;
const mineThumb = `${me}/item-1/0.thumb.webp`;
const foreign = `${other}/item-9/0.webp`;
const escaping = `${me}/item-1/%2e%2e/%2e%2e/${other}/item-9/0.webp`;

const st = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  images: [] as Array<Record<string, unknown>>,
  signed: [] as string[][],
  downloaded: [] as string[],
  removed: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../watermark", () => ({ markAsAi: async (bytes: Buffer) => bytes }));
vi.mock("../supabase/admin", () => {
  const table = (name: string) => {
    let op = "select";
    const rows = () => (name === "library_items" ? st.items : st.images);
    const self: Record<string, unknown> = {
      select: () => self,
      order: () => self,
      limit: () => self,
      range: () => self,
      in: () => self,
      eq: () => self,
      is: () => self,
      or: () => self,
      delete: () => { op = "delete"; return self; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(
        op === "delete" ? { data: [{ id: "item-1" }], error: null } : { data: rows(), error: null },
      )),
    };
    return self;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: table,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            st.signed.push(paths);
            return { data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null };
          },
          download: async (path: string) => {
            st.downloaded.push(path);
            return { data: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]), error: null };
          },
          remove: async (paths: string[]) => {
            st.removed.push(paths);
            return { data: [], error: null };
          },
        }),
      },
    }),
  };
});

const { listLibraryItems, getLibraryItemImages, getLibraryImageFile, deleteLibraryItem } = await import("../server-library");
const ADMIN = { userId: "admin-1", role: "admin" as const };
const MEMBER = { userId: me, role: "member" as const };

beforeEach(() => {
  delete process.env.PDP_SERVER_DOCUMENTS;
  st.items = [{ id: "item-1", user_id: me, title: "t", tool: "create", source_type: "generation", image_count: 1, created_at: "2026-10-03" }];
  st.images = [];
  st.signed.length = 0;
  st.downloaded.length = 0;
  st.removed.length = 0;
});

describe("라이브러리", () => {
  it("목록 표지는 그 작업 주인의 폴더 안일 때만 서명한다", async () => {
    st.items = [
      { ...st.items[0], cover_path: mine, cover_thumb_path: mineThumb },
      { ...st.items[0], id: "item-2", cover_path: foreign, cover_thumb_path: escaping },
    ];
    const items = await listLibraryItems(MEMBER);

    expect(st.signed.flat()).toEqual([mine, mineThumb]);
    expect(items.find((item) => item.id === "item-2")?.coverUrl ?? null).toBeNull();
  });

  it("한 건을 열 때 주인 폴더 밖의 그림은 서명하지 않는다", async () => {
    st.images = [
      { position: 0, path: mine, mime_type: "image/webp", user_id: me },
      { position: 1, path: foreign, mime_type: "image/webp", user_id: me },
    ];
    const images = await getLibraryItemImages(MEMBER, "item-1");

    expect(st.signed.flat()).toEqual([mine]);
    expect(images.map((image: { url: string | null }) => image.url)).toEqual([`signed:${mine}`, null]);
  });

  it("한 장을 내려받을 때(광고 규격 재료 포함) 주인 폴더 밖이면 내려받지 않는다", async () => {
    st.images = [{ path: escaping, user_id: me }];
    expect(await getLibraryImageFile(MEMBER, "item-1", 0)).toBeNull();
    expect(st.downloaded).toEqual([]);

    st.images = [{ path: mine, user_id: me }];
    expect(await getLibraryImageFile(MEMBER, "item-1", 0)).not.toBeNull();
    expect(st.downloaded).toEqual([mine]);
  });

  it("관리자·팀원이 남의 정상 작업을 볼 때는 **그 주인의** 그림을 서명한다(보는 사람이 아니다)", async () => {
    const theirs = `${other}/item-2/0.webp`;
    st.items = [{ ...st.items[0], id: "item-2", user_id: other, cover_path: theirs, cover_thumb_path: null }];
    await listLibraryItems(ADMIN);
    expect(st.signed.flat()).toEqual([theirs]);

    st.signed.length = 0;
    st.images = [{ position: 0, path: theirs, mime_type: "image/webp", user_id: other }];
    const images = await getLibraryItemImages({ ...MEMBER, teamId: "team-1" }, "item-2");
    expect(st.signed.flat()).toEqual([theirs]);
    expect(images.map((image: { url: string | null }) => image.url)).toEqual([`signed:${theirs}`]);
  });

  it("지울 때(관리자도) 그 줄 주인의 폴더 밖은 지우지 않는다", async () => {
    st.images = [
      { path: mine, thumb_path: escaping, user_id: me },
      { path: foreign, thumb_path: mineThumb, user_id: me },
    ];
    await deleteLibraryItem(ADMIN, "item-1");
    expect(st.removed.flat()).toEqual([mine, mineThumb]);
  });
});
