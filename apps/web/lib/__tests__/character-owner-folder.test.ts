import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터 각도의 위치가 주인 폴더 밖이면 서버 권한으로 열지도 지우지도 않는다**(2026-10-03 보안 리뷰).
 *
 * 회원이 자기 각도 줄의 위치를 남의 그림 위치로 고쳐 쓸 수 있었다(DB 는 202610030002 로 막았다).
 * 그런 줄이 남아 있거나 다른 길로 들어와도, 서버가 그 위치로 남의 그림을 서명(열람)·
 * 다운로드(생성 재료)·삭제하지 않아야 한다. 주인은 그 캐릭터 줄의 `user_id` 다.
 */
const me = "72000000-0000-4000-8000-00000000000a";
const other = "72000000-0000-4000-8000-00000000000b";
const mine = `${me}/c1/front.png`;
const mineThumb = `${me}/c1/front.thumb.webp`;
const foreign = `${other}/c9/front.png`;
const escaping = `${me}/c1/%2e%2e/%2e%2e/${other}/c9/front.png`;

const st = vi.hoisted(() => ({
  owner: "",
  views: [] as Array<Record<string, unknown>>,
  signed: [] as string[][],
  downloaded: [] as string[],
  removed: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("../pdp/fal", () => ({ createPdpImageGenerator: () => async () => ({ base64: "", mimeType: "image/png" }) }));
vi.mock("../reference-images", () => ({
  saveReferenceImage: async () => undefined,
  removeReferenceImagesByTitle: async () => undefined,
}));
vi.mock("../supabase/admin", () => {
  const character = () => ({ id: "c1", user_id: st.owner, name: "나", source_prompt: "p", identity_prompt: "p", created_at: "2026-10-03" });
  const query = (table: string) => {
    const rows = () => (table === "characters" ? [character()] : st.views);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "in", "eq", "or", "delete"]) builder[method] = () => builder;
    builder.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: rows(), error: null });
    return builder;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: query,
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

const { listCharacters, loadCharacterView, deleteCharacter } = await import("../characters");

beforeEach(() => {
  delete process.env.LOCAL_STORE;
  st.owner = me;
  st.signed.length = 0;
  st.downloaded.length = 0;
  st.removed.length = 0;
});

describe("캐릭터 각도", () => {
  it("목록은 주인 폴더 안의 위치만 서명한다", async () => {
    st.views = [
      { character_id: "c1", user_id: me, angle: "front", path: mine, thumb_path: mineThumb },
      { character_id: "c1", user_id: me, angle: "back", path: foreign, thumb_path: escaping },
    ];
    const [found] = await listCharacters(me);

    expect(st.signed.flat()).toEqual([mine, mineThumb]);
    expect(found.views.find((view) => view.angle === "back")?.url ?? null).toBeNull();
    expect(found.views.find((view) => view.angle === "front")?.url).toBe(`signed:${mine}`);
  });

  it("팀원의 정상 캐릭터는 **그 주인의** 폴더 기준으로 서명하고 생성 재료로 꺼낸다(보는 사람이 아니다)", async () => {
    const theirs = `${other}/c1/front.png`;
    st.owner = other;
    st.views = [{ character_id: "c1", user_id: other, angle: "front", path: theirs, thumb_path: null, mime_type: "image/png" }];
    const [found] = await listCharacters(me, "team-1");
    expect(st.signed.flat()).toEqual([theirs]);
    expect(found.views[0]?.url).toBe(`signed:${theirs}`);
    expect(await loadCharacterView(me, "c1", "front", "team-1")).not.toBeNull();
    expect(st.downloaded).toEqual([theirs]);
  });

  it("생성 재료로 꺼낼 때 주인 폴더 밖이면 내려받지 않는다", async () => {
    st.views = [{ character_id: "c1", user_id: me, angle: "front", path: foreign, mime_type: "image/png" }];
    expect(await loadCharacterView(me, "c1", "front")).toBeNull();
    expect(st.downloaded).toEqual([]);

    st.views = [{ character_id: "c1", user_id: me, angle: "front", path: mine, mime_type: "image/png" }];
    expect(await loadCharacterView(me, "c1", "front")).not.toBeNull();
    expect(st.downloaded).toEqual([mine]);
  });

  it("지울 때 주인 폴더 밖의 위치는 지우지 않는다", async () => {
    st.views = [
      { character_id: "c1", user_id: me, angle: "front", path: mine, thumb_path: escaping },
      { character_id: "c1", user_id: me, angle: "back", path: foreign, thumb_path: null },
    ];
    await deleteCharacter(me, "c1");
    expect(st.removed.flat()).toEqual([mine]);
  });
});
