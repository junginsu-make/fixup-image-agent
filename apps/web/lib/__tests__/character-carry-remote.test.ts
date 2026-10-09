import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **운영(Supabase) 길로 옮겨 담기.**
 *
 * 로컬 길은 `character-carry.test.ts` 가 잰다. 운영 길은 서비스 롤로 저장소를 읽고 쓰므로
 * 틀리면 남의 파일을 읽거나 원본을 덮는다 — 가짜 관리자 클라이언트로 **무엇을 묻고,
 * 어디서 내려받고, 어디에 올리는지**를 센다.
 */

vi.mock("server-only", () => ({}));

interface Query { table: string; method: string; args: unknown[] }
interface Upload { path: string; bytes: Buffer; options: Record<string, unknown> }
interface Upsert { table: string; row: Record<string, unknown>; options: Record<string, unknown> }

let rows: Record<string, unknown[]> = {};
let queries: Query[] = [];
let downloads: string[] = [];
let uploads: Upload[] = [];
let upserts: Upsert[] = [];
let registered: Array<{ title: string }> = [];

function 질의(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is"]) {
    builder[method] = (...args: unknown[]) => {
      queries = [...queries, { table, method, args }];
      return builder;
    };
  }
  builder.upsert = (row: Record<string, unknown>, options: Record<string, unknown>) => {
    upserts = [...upserts, { table, row, options }];
    return Promise.resolve({ error: null });
  };
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
  return builder;
}

const 저장소 = {
  download: async (path: string) => {
    downloads = [...downloads, path];
    const bytes = new TextEncoder().encode(`bytes:${path}`);
    return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
  },
  upload: async (path: string, bytes: Buffer, options: Record<string, unknown>) => {
    uploads = [...uploads, { path, bytes, options }];
    return { error: null };
  },
};

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: 질의, storage: { from: () => 저장소 } }),
}));
vi.mock("../reference-images", () => ({
  saveReferenceImage: async (input: { title: string }) => {
    registered = [...registered, { title: input.title }];
  },
}));

const USER = "user-1";
const FROM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const original = { ...process.env };

function 뷰(characterId: string, angle: string, overrides: Record<string, unknown> = {}) {
  return {
    character_id: characterId,
    angle,
    path: `${USER}/${characterId}/${angle}.png`,
    thumb_path: `${USER}/${characterId}/${angle}.thumb.webp`,
    mime_type: "image/png",
    ...overrides,
  };
}

function 채운다(views: unknown[]) {
  rows = {
    characters: [{ id: FROM, name: "호롱이" }, { id: TO, name: "호롱이 (수정본)" }],
    character_views: views,
  };
}

beforeEach(() => {
  delete process.env.LOCAL_STORE;
  rows = {}; queries = []; downloads = []; uploads = []; upserts = []; registered = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe("소유권 확인", () => {
  it("**내 캐릭터만** 묻는다 — user_id 로 거르고 두 id 를 함께", async () => {
    채운다([뷰(FROM, "front"), 뷰(TO, "front")]);
    const { carryCharacterViews } = await import("../character-carry");

    await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(queries).toContainEqual({ table: "characters", method: "eq", args: ["user_id", USER] });
    expect(queries).toContainEqual({ table: "characters", method: "in", args: ["id", [FROM, TO]] });
  });

  it("내 것이 한 쪽뿐이면 못 찾는다 — 내려받지도 올리지도 않는다", async () => {
    rows = { characters: [{ id: TO, name: "호롱이 (수정본)" }], character_views: [뷰(FROM, "back")] };
    const { carryCharacterViews, CharacterCarryNotFound } = await import("../character-carry");

    await expect(carryCharacterViews({ userId: USER, fromId: FROM, toId: TO }))
      .rejects.toBeInstanceOf(CharacterCarryNotFound);
    expect(queries.some((query) => query.table === "character_views")).toBe(false);
    expect(downloads).toEqual([]);
    expect(uploads).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it.each([
    ["원본", "not-a-uuid", TO],
    ["새 캐릭터", FROM, "../etc"],
  ])("**%s id 가 uuid 가 아니면** 묻지도 않고 못 찾는다", async (_label, fromId, toId) => {
    const { carryCharacterViews, CharacterCarryNotFound } = await import("../character-carry");

    await expect(carryCharacterViews({ userId: USER, fromId, toId }))
      .rejects.toBeInstanceOf(CharacterCarryNotFound);
    expect(queries).toEqual([]);
    expect(downloads).toEqual([]);
    expect(uploads).toEqual([]);
  });
});

describe("옮겨 담기", () => {
  it("**원본 경로에서 내려받아 새 캐릭터 자리에 올리고** 뷰를 새로 적는다 — 사본도", async () => {
    채운다([뷰(FROM, "front"), 뷰(FROM, "back"), 뷰(TO, "front")]);
    const { carryCharacterViews } = await import("../character-carry");

    const result = await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(result.carried).toEqual(["back"]);
    expect(result.failed).toEqual([]);
    expect(downloads).toEqual([`${USER}/${FROM}/back.png`, `${USER}/${FROM}/back.thumb.webp`]);
    expect(uploads.map((upload) => upload.path)).toEqual([
      `${USER}/${TO}/back.png`,
      `${USER}/${TO}/back.thumb.webp`,
    ]);
    // contentType 을 안 주면 Buffer 본문에 text/plain 이 붙는다.
    expect(uploads[0]!.options).toEqual({ contentType: "image/png", upsert: true });
    expect(uploads[1]!.options).toEqual({ contentType: "image/webp", upsert: true });
    expect(uploads[0]!.bytes.toString()).toBe(`bytes:${USER}/${FROM}/back.png`);
    expect(upserts).toEqual([{
      table: "character_views",
      row: {
        character_id: TO, user_id: USER, angle: "back",
        path: `${USER}/${TO}/back.png`, thumb_path: `${USER}/${TO}/back.thumb.webp`, mime_type: "image/png",
      },
      options: { onConflict: "character_id,angle" },
    }]);
  });

  it("**원본 캐릭터의 경로에는 아무것도 올리거나 적지 않는다**", async () => {
    채운다([뷰(FROM, "front"), 뷰(FROM, "back"), 뷰(FROM, "left_45"), 뷰(TO, "front")]);
    const { carryCharacterViews } = await import("../character-carry");

    await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(uploads.length).toBeGreaterThan(0);
    for (const upload of uploads) expect(upload.path.startsWith(`${USER}/${TO}/`)).toBe(true);
    for (const upsert of upserts) {
      expect(upsert.row.character_id).toBe(TO);
      expect(String(upsert.row.path).startsWith(`${USER}/${TO}/`)).toBe(true);
    }
    expect(uploads.some((upload) => upload.path.includes(FROM))).toBe(false);
    expect(upserts.some((upsert) => JSON.stringify(upsert.row).includes(FROM))).toBe(false);
  });

  it("새 캐릭터에 이미 있는 각도는 건너뛴다 — 다시 만든 각도를 덮지 않는다", async () => {
    채운다([뷰(FROM, "front"), 뷰(FROM, "left_45"), 뷰(FROM, "back"), 뷰(TO, "front"), 뷰(TO, "left_45")]);
    const { carryCharacterViews } = await import("../character-carry");

    const result = await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(result.carried).toEqual(["back"]);
    expect(downloads.some((path) => path.includes("left_45"))).toBe(false);
    expect(uploads.some((upload) => upload.path.includes("left_45"))).toBe(false);
    expect(upserts.map((upsert) => upsert.row.angle)).toEqual(["back"]);
  });

  it("옮겨 담은 각도를 라이브러리에 새 캐릭터 이름으로 등록한다", async () => {
    채운다([뷰(FROM, "front"), 뷰(FROM, "back"), 뷰(TO, "front")]);
    const { carryCharacterViews } = await import("../character-carry");
    const { characterReferenceTitle } = await import("../character-library");

    await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(registered).toEqual([{ title: characterReferenceTitle("호롱이 (수정본)", "back") }]);
  });
});

describe("**남의 경로로 새는 것을 막는다**", () => {
  it.each([
    ["`..` 로 남의 경로를 가리킴", `${USER}/${FROM}/../../victim/V/front.png`],
    ["다른 사용자 칸", `victim/${FROM}/back.png`],
    ["다른 캐릭터 칸", `${USER}/${TO}/back.png`],
    ["빈 칸", `${USER}/${FROM}//back.png`],
    ["퍼센트로 쓴 `..` 로 남의 경로를 가리킴", `${USER}/${FROM}/%2e%2e/%2e%2e/victim/V/front.png`],
    ["탭이 낀 `..` 로 남의 경로를 가리킴", `${USER}/${FROM}/.\t./.\t./victim/V/front.png`],
  ])("원본 경로가 %s 이면 그 각도는 failed — 내려받지도 올리지도 않는다", async (_label, path) => {
    채운다([
      뷰(FROM, "front"),
      뷰(FROM, "back", { path }),
      뷰(FROM, "left_45"),
      뷰(TO, "front"),
    ]);
    const { carryCharacterViews } = await import("../character-carry");

    const result = await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(result.failed).toEqual(["back"]);
    expect(result.carried).toEqual(["left_45"]);
    expect(downloads).not.toContain(path);
    expect(downloads.some((entry) => entry.includes("victim"))).toBe(false);
    expect(uploads.some((upload) => upload.path.includes("back"))).toBe(false);
    expect(upserts.map((upsert) => upsert.row.angle)).toEqual(["left_45"]);
  });

  it("**사본 경로가 남의 것이면** 사본만 뺀다 — 본 그림은 옮긴다", async () => {
    채운다([
      뷰(FROM, "front"),
      뷰(FROM, "back", { thumb_path: `${USER}/${FROM}/../../victim/V/front.thumb.webp` }),
      뷰(TO, "front"),
    ]);
    const { carryCharacterViews } = await import("../character-carry");

    const result = await carryCharacterViews({ userId: USER, fromId: FROM, toId: TO });

    expect(result.carried).toEqual(["back"]);
    expect(downloads).toEqual([`${USER}/${FROM}/back.png`]);
    expect(upserts[0]!.row.thumb_path).toBeNull();
  });
});
