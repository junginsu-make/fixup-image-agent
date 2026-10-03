import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **서버가 라이브러리의 한 자리를 바꾸거나 자리를 옮길 때 파일을 잃지 않는다**(2026-09-28).
 *
 * 지우는 일이 끼어 있어 차례가 중요하다.
 *   - 바꾸기: 새 파일 올림 → 표 고침 → **그 뒤에** 옛 파일 지움.
 *     표 고치기가 실패하면 새 파일을 지우고 **옛 것은 그대로** 둔다
 *   - 서버는 **자르지 않는다** — 구성을 다시 짜면 끝낸 페이지가 지워졌다(리뷰 HIGH-1)
 */
vi.mock("server-only", () => ({}));
vi.mock("../watermark", () => ({ markAsAi: async (bytes: Buffer) => bytes }));
vi.mock("../image-encoding", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encodeForStorage: async (bytes: Buffer) => ({ bytes, mimeType: "image/webp" }),
  makeThumbnail: async () => Buffer.from("t"),
}));

const log: string[] = [];
let failImageUpdate = false;
let failCoverUpdate = false;
let highest: number | null = 1;
let existing: { path: string; thumb_path: string | null } | null = { path: "u/item/1-oldoldol.webp", thumb_path: "u/item/1-oldoldol.thumb.webp" };

function table(name: string) {
  let op = "select";
  const self: Record<string, unknown> = {
    select: (_columns?: string, options?: { head?: boolean }) => { if (options?.head) op = "count"; return self; },
    insert: () => { op = "insert"; log.push(`insert ${name}`); return self; },
    eq: () => self,
    gte: () => self,
    order: () => self,
    limit: () => self,
    update: (patch: Record<string, unknown>) => { op = "update"; log.push(`update ${name} ${JSON.stringify(patch)}`); return self; },
    delete: () => { op = "delete"; log.push(`delete ${name}`); return self; },
    maybeSingle: async () => ({ data: existing, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (name === "library_images" && op === "update" && failImageUpdate) return Promise.resolve(resolve({ error: { message: "x" } }));
      if (name === "library_items" && op === "update" && failCoverUpdate) return Promise.resolve(resolve({ error: { message: "x" } }));
      if (op === "count") return Promise.resolve(resolve({ count: 4, error: null }));
      if (name === "library_images" && op === "select") return Promise.resolve(resolve({ data: highest === null ? [] : [{ position: highest }], error: null }));
      if (op === "delete") return Promise.resolve(resolve({ data: [{ path: "u/item/2-a.webp", thumb_path: "u/item/2-a.thumb.webp" }], error: null }));
      return Promise.resolve(resolve({ data: [], error: null }));
    },
  };
  return self;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (name: string) => table(name),
    storage: {
      from: () => ({
        upload: async (path: string) => { log.push(`upload ${path}`); return { error: null }; },
        remove: async (paths: string[]) => { log.push(`remove ${paths.join(",")}`); return { error: null }; },
      }),
    },
  }),
}));

const { reorderLibraryImages, replaceLibraryImageAt, saveLibraryItem } = await import("../server-library");

beforeEach(() => {
  log.length = 0;
  failImageUpdate = false;
  failCoverUpdate = false;
  highest = 1;
  existing = { path: "u/item/1-oldoldol.webp", thumb_path: "u/item/1-oldoldol.thumb.webp" };
});

const TAG = "s1a2b3c4d-a5e6f7a8b";
const image = { base64: Buffer.from("IMG").toString("base64"), mimeType: "image/png" };

describe("한 자리 바꾸기 — 옛 위치가 내 폴더 밖이면(2026-10-03 보안 리뷰)", () => {
  it("남의 그림 위치는 지우지 않는다", async () => {
    existing = { path: "someone/item/1-oldoldol.webp", thumb_path: "u/item/%2e%2e/%2e%2e/someone/item/1.thumb.webp" };
    const result = await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 1, origin: "ai", fileTag: TAG, image });
    expect(result.ok).toBe(true);
    expect(log.some((line) => line.startsWith("remove"))).toBe(false);
  });
});

describe("한 자리 바꾸기", () => {
  it("**새 파일 → 표 고침 → 옛 파일 지움** 차례다 — 중간에 멈춰도 자리가 비지 않는다", async () => {
    const result = await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 1, origin: "ai", fileTag: TAG, image });
    expect(result.ok).toBe(true);
    const upload = log.findIndex((line) => /^upload u\/item\/1-s1a2b3c4d-a5e6f7a8b-[0-9a-f]{6}\.webp$/.test(line));
    const update = log.findIndex((line) => line.startsWith("update library_images"));
    const remove = log.findIndex((line) => line.startsWith("remove"));
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(upload);
    expect(remove).toBeGreaterThan(update);
    expect(log[remove]).toBe("remove u/item/1-oldoldol.webp,u/item/1-oldoldol.thumb.webp");
  });

  it("**표 고치기가 실패하면 새 파일만 지우고 옛 것은 둔다**", async () => {
    failImageUpdate = true;
    const result = await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 1, origin: "ai", fileTag: TAG, image });
    expect(result.ok).toBe(false);
    const removes = log.filter((line) => line.startsWith("remove"));
    expect(removes).toHaveLength(1);
    expect(removes[0]).toMatch(/^remove u\/item\/1-s1a2b3c4d-a5e6f7a8b-([0-9a-f]{6})\.webp,u\/item\/1-s1a2b3c4d-a5e6f7a8b-\1\.thumb\.webp$/);
  });

  it("첫 자리를 바꾸면 표지도 따라간다", async () => {
    await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 0, origin: "ai", fileTag: TAG, image });
    expect(log.some((line) => line.startsWith("update library_items") && line.includes("cover_path"))).toBe(true);
  });

  it("**표지를 못 고쳤으면 옛 파일을 지우지 않는다** — 표지가 없는 파일을 가리키게 된다(리뷰 MEDIUM-1)", async () => {
    failCoverUpdate = true;
    await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 0, origin: "ai", fileTag: TAG, image });
    expect(log.filter((line) => line.startsWith("remove"))).toEqual([]);
  });

  it("**같은 그림을 두 번 올려도 이름이 다르다** — 늦게 실패한 쪽이 먼저 것을 지우지 않는다(리뷰 LOW-2)", async () => {
    await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 1, origin: "ai", fileTag: TAG, image });
    await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 1, origin: "ai", fileTag: TAG, image });
    const uploads = log.filter((line) => line.startsWith("upload") && !line.includes(".thumb."));
    expect(new Set(uploads).size).toBe(2);
  });

  it("그 자리가 없으면 아무것도 안 올린다", async () => {
    existing = null;
    const result = await replaceLibraryImageAt({ userId: "u", itemId: "item", position: 9, origin: "ai", fileTag: TAG, image });
    expect(result.ok).toBe(false);
    expect(log.filter((line) => line.startsWith("upload"))).toEqual([]);
  });
});

describe("자리 옮기기", () => {
  it("**멀리 비켜 세웠다가 제자리로 온다** — 번호가 겹치지 않는다, 파일은 안 건드린다", async () => {
    const result = await reorderLibraryImages({ userId: "u", itemId: "item", order: [1, 0] });
    expect(result.ok).toBe(true);
    const moves = log.filter((line) => line.startsWith("update library_images"));
    expect(moves).toEqual([
      'update library_images {"position":100001}',
      'update library_images {"position":100002}',
      'update library_images {"position":0}',
      'update library_images {"position":1}',
    ]);
    expect(log.some((line) => line.startsWith("upload") || line.startsWith("remove"))).toBe(false);
    expect(log.some((line) => line.startsWith("update library_items") && line.includes("cover_path"))).toBe(true);
  });

  it("**앞서 멈춰 남은 줄보다 위로 비켜 세운다** — 같은 곳에서 매번 부딪히지 않는다(3차 리뷰 LOW)", async () => {
    highest = 100_005;
    await reorderLibraryImages({ userId: "u", itemId: "item", order: [1, 0] });
    const moves = log.filter((line) => line.startsWith("update library_images"));
    expect(moves.slice(0, 2)).toEqual(['update library_images {"position":100006}', 'update library_images {"position":100007}']);
  });

  it("같은 자리가 두 번 오면 옮기지 않는다", async () => {
    expect((await reorderLibraryImages({ userId: "u", itemId: "item", order: [0, 0] })).ok).toBe(false);
    expect(log).toEqual([]);
  });

  it("옮기다 실패하면 실패로 답한다", async () => {
    failImageUpdate = true;
    expect((await reorderLibraryImages({ userId: "u", itemId: "item", order: [1, 0] })).ok).toBe(false);
  });
});

describe("이어 붙인 뒤의 장수", () => {
  it("**행을 세어 적는다** — 자리 번호로 셈하면 멀리 선 줄 때문에 십만이 된다(4차 리뷰 LOW)", async () => {
    const result = await saveLibraryItem({
      userId: "u", title: "", tool: "create", origin: "ai", fileTag: TAG,
      appendTo: { itemId: "item", startPosition: 100_003 }, images: [image],
    });
    expect(result.ok).toBe(true);
    expect(log).toContain('update library_items {"image_count":4}');
  });
});
