import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **스타일 참고 그림의 위치가 내 폴더 밖이면 서버 권한으로 열지도 지우지도 않는다**(2026-10-03 보안 리뷰).
 *
 * 회원이 자기 스타일 참고 줄의 위치를 남의 그림 위치로 고쳐 쓸 수 있었다(DB 는 202610030002 로 막았다).
 * 세 길 모두 「내 줄」만 읽으므로 주인은 부른 회원 본인이다.
 */
const me = "72000000-0000-4000-8000-00000000000a";
const other = "72000000-0000-4000-8000-00000000000b";
const mine = `${me}/ref-1.png`;
const mineThumb = `${me}/ref-1.thumb.webp`;
const foreign = `${other}/ref-9.png`;
const escaping = `${me}/%2e%2e/${other}/ref-9.png`;

const st = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  signed: [] as string[][],
  downloaded: [] as string[],
  removed: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../supabase/admin", () => {
  // 라이브러리 참고 이미지(reference_images)는 따로 막혀 있는 표다 — 여기서는 비워 둔다.
  const table = (name: string) => {
    const rows = () => (name === "style_references" ? st.rows : []);
    const self: Record<string, unknown> = {
      select: () => self, eq: () => self, order: () => self, range: () => self, limit: () => self, delete: () => self,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows(), error: null, count: rows().length })),
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
            return { data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })) };
          },
          download: async (path: string) => {
            st.downloaded.push(path);
            return { data: new Blob([path]) };
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

const { listUserStyleReferences, loadUserReferenceCandidates, deleteUserStyleReference } = await import("../user-style-references");

beforeEach(() => {
  st.signed.length = 0;
  st.downloaded.length = 0;
  st.removed.length = 0;
});

describe("스타일 참고", () => {
  it("목록은 내 폴더 안의 위치만 서명한다", async () => {
    st.rows = [
      { id: "r1", name: "a", source: "upload", description: "d", path: mine, thumb_path: mineThumb, created_at: "2026-10-03" },
      { id: "r2", name: "b", source: "upload", description: "d", path: foreign, thumb_path: escaping, created_at: "2026-10-03" },
    ];
    const page = await listUserStyleReferences(me);

    expect(st.signed.flat()).toEqual([mine, mineThumb]);
    expect(page.references.find((reference) => reference.id === "r2")?.url ?? null).toBeNull();
  });

  it("생성 후보로 꺼낼 때 내 폴더 밖이면 내려받지 않는다", async () => {
    st.rows = [
      { id: "r1", name: "a", description: "d", path: mine, mime_type: "image/png" },
      { id: "r2", name: "b", description: "d", path: escaping, mime_type: "image/png" },
    ];
    const candidates = await loadUserReferenceCandidates(me);

    expect(st.downloaded).toEqual([mine]);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["r1"]);
  });

  it("지울 때 내 폴더 밖의 위치는 지우지 않는다", async () => {
    st.rows = [{ path: foreign, thumb_path: mineThumb }];
    await deleteUserStyleReference(me, "r2");
    expect(st.removed.flat()).toEqual([mineThumb]);
  });
});
