import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetPath, DocumentError } from "../model";
import { createLocalDocumentRepository } from "../local-repository";
import type { DocumentRepository } from "../repository";

/**
 * **문서와 연결된 옛 라이브러리 그림을 어떻게 보이나**(3차 리뷰 W9·W11·W20, 최종 리뷰 M1).
 *
 * 줄의 그림 지문(파일 이름의 sha1 앞 8자리)을 **문서가 한 번이라도 가졌던 그림 지문**과 견준다.
 *   - 지금 문서에 있다 → 뺀다. 문서 카드가 보여 준다
 *   - 예전에 가졌는데 지금 없다 → 뺀다. 문서가 일부러 뺀 그림이다(삭제·다시 만들기·복원)
 *   - 한 번도 가진 적 없다 → 남긴다. 이관 전 옛 그림(F10)이거나 문서가 아직 못 받은 결과(F11·M1)다
 * 「가졌던 지문」은 서버가 저장할 때마다 더한다(실제 로컬 저장소를 쓴다 — 화면이 보내지 않는다).
 *
 * 장면은 실제 순서대로 흘린다. 라이브러리 줄의 `created_at` 은 그 줄을 쓴(바꾼) 때다 — 시각
 * 규칙이 있던 때의 장면을 그대로 재현해, 시각으로는 못 가르는 M1 을 잡는다.
 */
const st = vi.hoisted(() => ({
  repo: null as unknown as DocumentRepository,
  items: [] as Array<Record<string, unknown>>,
  rows: [] as Array<Record<string, unknown>>,
  imageQueries: 0,
  signCalls: [] as string[][],
  docFails: false,
  excludedFails: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../local-store", () => ({ isLocalStoreEnabled: () => false, localStoreRoot: () => "x" }));
vi.mock("../flags", () => ({ serverDocumentsEnabled: () => true }));
vi.mock("../index", () => {
  const down = () => { if (st.docFails) throw new DocumentError(503, "작업을 읽지 못했습니다."); };
  return {
    serverDocumentsEnabled: () => true,
    documentServices: () => ({
      repo: {
        list: async (user: string | null) => { down(); return st.repo.list(user); },
        get: async (user: string, id: string) => { down(); return st.repo.get(user, id); },
        find: async (user: string | null, key: string, field: "id" | "sourceDraftId") => { down(); return st.repo.find(user, key, field); },
        deletedDraftIds: async (user: string | null) => {
          if (st.excludedFails) throw new DocumentError(503, "삭제된 작업을 확인하지 못했습니다.");
          return st.repo.deletedDraftIds(user);
        },
      },
      storage: {
        urls: async (assets: Record<string, unknown>) => Object.fromEntries(Object.keys(assets).map((key) => [key, "doc-url:" + key])),
        read: async () => Buffer.from("doc"),
      },
    }),
  };
});
vi.mock("../../../supabase/admin", () => {
  // 작업의 장수·표지는 그 작업의 줄에서 센다 — 라이브러리 저장이 하는 일과 같다.
  const items = () => st.items.map((item) => {
    const own = st.rows.filter((row) => row.item_id === item.id).sort((a, b) => Number(a.position) - Number(b.position));
    return { ...item, image_count: own.length, cover_path: own[0]?.path ?? null };
  });
  const query = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let window: [number, number] | null = null;
    const source = () => (table === "library_items" ? items() : table === "library_images" ? st.rows : []);
    const pick = () => source().filter((row) => filters.every((keep) => keep(row)));
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, limit: () => q, or: () => q,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return q; },
      // 지운 작업 거르기(2026-10-08). 이 시험의 줄에는 지운 것이 없어 「비어 있음」과 같은지만 본다.
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return q; },
      range: (from: number, to: number) => { window = [from, to]; return q; },
      maybeSingle: async () => ({ data: pick()[0] ?? null, error: null }),
      then: (ok: (value: unknown) => unknown, fail?: (reason: unknown) => unknown) => {
        if (table === "library_images") st.imageQueries += 1;
        const all = pick().sort((a, b) => Number(a.position) - Number(b.position));
        return Promise.resolve({ data: window ? all.slice(window[0], window[1] + 1) : all, error: null }).then(ok, fail);
      },
    };
    return q;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: query,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            st.signCalls.push(paths);
            return { data: paths.map((path) => ({ path, signedUrl: "signed:" + path })), error: null };
          },
          download: async () => ({ data: new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]), error: null }),
        }),
      },
    }),
  };
});

import { getLibraryImageFile, getLibraryItem, getLibraryItemImages, listLibraryItems } from "../../../server-library";

const U = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const NEW_ITEM = "66666666-6666-4666-8666-666666666666";
const viewer = { userId: U, role: "member" } as const;
const [A1, A2, A3, B1, C1, C3] = ["aaaaaaa1", "aaaaaaa2", "aaaaaaa3", "bbbbbbb1", "ccccccc1", "ccccccc3"];
const [S1, S2, S3] = ["5e000001", "5e000002", "5e000003"];
const roots: string[] = [];

const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
/** 지금 시각(앞뒤로 틈을 둬 다른 사건과 같은 밀리초가 되지 않게). */
const stamp = async () => { await tick(); const now = new Date().toISOString(); await tick(); return now; };

/** 섹션마다 그림 하나. 그림 지문(`legacyHash` 앞 8자리)이 `tags` 다. */
function documentOf(tags: string[], id: string, title: string) {
  const assets = Object.fromEntries(tags.map((tag, index) => {
    const sha256 = tag.repeat(8);
    return [`x${index}`, { path: assetPath(U, id, sha256, "image/png"), sha256, legacyHash: tag + "0".repeat(32), bytes: 10, mimeType: "image/png" as const }];
  }));
  const sections = tags.map((_, index) => ({ section_id: `s${index}`, generatedImage: { $asset: `x${index}`, format: "dataUrl" } }));
  return { schemaVersion: 3 as const, id, title, sourceMode: "image" as const, stage: "editor" as const, assets, body: { sections } };
}
/** 화면의 자동저장(복원도 같은 저장 길이다). */
async function saveDocument(tags: string[], id = DOC, title = "문서") {
  const current = (await st.repo.get(U, id)) ?? (await st.repo.create(U, id));
  await tick();
  await st.repo.save(U, id, current.revision, documentOf(tags, id, title), randomUUID());
  await tick();
}
const openDocument = async (id = DOC) => { await st.repo.create(U, id); await tick(); };

function givenItem(itemId = ITEM, sourceId = DOC) {
  st.items = [...st.items, { id: itemId, user_id: U, title: "옛", tool: "create", source_type: "generation", source_id: sourceId,
    cover_thumb_path: null, created_at: "2026-10-01T00:00:00.000Z" }];
}
/** 라이브러리 동기화가 그 자리에 그림을 쓴다(새로 넣거나 바꾼다). `created_at` 은 쓴 때다. */
async function libraryWrite(position: number, section: string, artifact: string, itemId = ITEM) {
  const row = { item_id: itemId, user_id: U, position, path: `${U}/${itemId}/${position}-s${section}-a${artifact}-abc123.webp`,
    thumb_path: null, mime_type: "image/webp", created_at: await stamp() };
  st.rows = [...st.rows.filter((r) => !(r.item_id === itemId && r.position === position)), row];
}

const legacyCards = async () => (await listLibraryItems(viewer)).filter((item) => !item.documentId);
const openedPositions = async (itemId = ITEM) => (await getLibraryItemImages(viewer, itemId)).map((image) => image.position);

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "pdp-held-"));
  roots.push(root);
  Object.assign(st, { repo: createLocalDocumentRepository(root), items: [], rows: [], imageQueries: 0, signCalls: [], docFails: false, excludedFails: false });
  vi.restoreAllMocks();
});
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(join(tmpdir(), "pdp-held-"))) throw Error("unsafe");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("W9 문서가 일부러 뺀 그림은 옛 카드로 다시 나오지 않는다", () => {
  it("3장 → 가운데 섹션 삭제 → 옛 카드 0", async () => {
    await openDocument(); givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2); await libraryWrite(2, S3, A3);
    await saveDocument([A1, A2, A3]);
    await saveDocument([A1, A3]);
    expect(await legacyCards()).toEqual([]);
    expect(await openedPositions()).toEqual([]);
  });

  it("가운데 삭제 뒤 첫 장 재생성(옛 작업은 구성이 달라 그대로, 새 작업이 열림) → 옛 카드 0", async () => {
    await openDocument(); givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2); await libraryWrite(2, S3, A3);
    await saveDocument([A1, A2, A3]);
    await saveDocument([A1, A3]);
    givenItem(NEW_ITEM);
    await libraryWrite(0, S1, B1, NEW_ITEM); await libraryWrite(1, S3, A3, NEW_ITEM);
    await saveDocument([B1, A3]);
    expect(await legacyCards()).toEqual([]);
    expect(await openedPositions()).toEqual([]);
    expect(await openedPositions(NEW_ITEM)).toEqual([]);
  });

  it("이전 버전 복원 → 복원 전의 새 그림이 옛 카드로 나오지 않는다", async () => {
    await openDocument(); givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2);
    await saveDocument([A1, A2]);
    await libraryWrite(0, S1, B1);
    await saveDocument([B1, A2]);
    await saveDocument([A1, A2]); // 복원 = 예전 내용을 새 버전으로 저장
    expect(await legacyCards()).toEqual([]);
    expect(await openedPositions()).toEqual([]);
  });
});

describe("W9 지키는 것", () => {
  it("F10: 이관 전 5장 + 문서 2장 → 사라지는 그림 0(문서에 없는 3장은 옛 카드로)", async () => {
    givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2); await libraryWrite(2, S3, A3);
    await libraryWrite(3, S1, B1); await libraryWrite(4, S2, C1);
    await openDocument();
    await saveDocument([A1, A3]);
    const [card] = await legacyCards();
    expect(card).toMatchObject({ id: ITEM, imageCount: 3, coverUrl: `signed:${U}/${ITEM}/1-s${S2}-a${A2}-abc123.webp` });
    expect(await openedPositions()).toEqual([1, 3, 4]);
  });

  it("보안(2026-10-03): 줄인 표지의 위치가 그 줄 주인의 폴더 밖이면 서명하지 않는다", async () => {
    const OTHER = "77777777-7777-4777-8777-777777777777";
    givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2); await libraryWrite(2, S3, A3);
    await openDocument();
    await saveDocument([A1, A3]);
    st.rows = st.rows.map((row) => (row.position === 1 ? { ...row, path: `${OTHER}/${ITEM}/1-s${S2}-a${A2}-abc123.webp` } : row));
    const [card] = await legacyCards();
    expect(card).toMatchObject({ id: ITEM, imageCount: 1, coverUrl: null });
    expect(st.signCalls.flat().some((path) => path.startsWith(OTHER))).toBe(false);
  });

  it("F11: 문서 저장 전에 창을 닫음 — 저장 뒤에 바뀐 자리와 새 섹션은 보인다", async () => {
    await openDocument(); givenItem();
    await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2);
    await saveDocument([A1, A2]);
    await libraryWrite(0, S1, B1); await libraryWrite(2, S3, C3);
    const [card] = await legacyCards();
    expect(card).toMatchObject({ id: ITEM, imageCount: 2 });
    expect(await openedPositions()).toEqual([0, 2]);
  });

  it("M1: 저장 → 다시 만들고 창 닫기 → 다시 열어 글자만 고쳐 저장해도, 문서가 못 받은 새 그림은 보인다", async () => {
    await openDocument(); givenItem();
    await libraryWrite(0, S1, A1);
    await saveDocument([A1]);                     // T1: 문서는 A1
    await libraryWrite(0, S1, B1);                // T2: 다시 만든 B1 이 그 자리를 바꿈, 창 닫음
    await saveDocument([A1], DOC, "글자만 고침");  // T3: 다시 열면 문서는 여전히 A1(섹션에 그림이 있어 되찾기 없음)
    const [card] = await legacyCards();
    expect(card).toMatchObject({ id: ITEM, imageCount: 1, coverUrl: `signed:${U}/${ITEM}/0-s${S1}-a${B1}-abc123.webp` });
    expect(await openedPositions()).toEqual([0]);
  });

  it("지문이 없는 옛 이름의 줄은 추측해서 숨기지 않는다", async () => {
    await openDocument(); givenItem();
    st.rows = [{ item_id: ITEM, user_id: U, position: 0, path: `${U}/${ITEM}/0.webp`, thumb_path: null, mime_type: "image/webp" }];
    await libraryWrite(1, S2, A2);
    await saveDocument([A2]);
    expect((await legacyCards()).map((card) => card.imageCount)).toEqual([1]);
    expect(await openedPositions()).toEqual([0]);
  });

  it("「가졌던 지문」은 서버 안에서만 쓴다 — 라이브러리 목록 응답에 싣지 않는다", async () => {
    await openDocument();
    await saveDocument([A1]);
    const [card] = await listLibraryItems(viewer);
    expect(card).toMatchObject({ documentId: DOC });
    expect(card).not.toHaveProperty("heldImageTags");
  });
});

describe("W11 목록 왕복", () => {
  it("연결된 옛 작업 40개 → 그림 조회 1번, 줄인 표지 서명 1번", async () => {
    for (let index = 0; index < 40; index += 1) {
      const doc = `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`;
      const item = `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`;
      givenItem(item, doc);
      st.rows = [...st.rows,
        { item_id: item, user_id: U, position: 0, path: `${U}/${item}/0-s${S1}-a${A1}-abc123.webp`, thumb_path: null, mime_type: "image/webp" },
        { item_id: item, user_id: U, position: 1, path: `${U}/${item}/1-s${S2}-a${A2}-abc123.webp`, thumb_path: null, mime_type: "image/webp" }];
      await st.repo.create(U, doc);
      await st.repo.save(U, doc, 0, documentOf([A1], doc, "문서"), randomUUID());
    }
    const cards = await legacyCards();
    expect(cards).toHaveLength(40);
    expect(cards.every((card) => card.imageCount === 1)).toBe(true);
    expect(st.imageQueries).toBe(1);
    // 첫 번째는 옛 목록이 원래 하던 표지 서명, 두 번째가 줄인 작업들의 표지를 한 번에.
    expect(st.signCalls).toHaveLength(2);
    expect(st.signCalls[1]).toHaveLength(40);
  });
});

describe("W20 문서 쪽 오류는 옛 경로를 막지 않는다", () => {
  it("지운 문서 목록 조회만 실패 → 목록은 문서와 옛 카드로 열린다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    givenItem(); await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2);
    await openDocument();
    await saveDocument([A1]);
    st.excludedFails = true;
    const items = await listLibraryItems(viewer);
    expect(items.map((item) => [item.id, item.imageCount])).toEqual([[DOC, 1], [ITEM, 1]]);
    expect(warn).toHaveBeenCalled();
  });

  it("옛 작업 열기 — 문서 조회 오류면 옛 작업으로 연다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    givenItem(); await libraryWrite(0, S1, A1);
    st.docFails = true;
    expect(await getLibraryItem(viewer, ITEM)).toMatchObject({ id: ITEM, title: "옛" });
  });

  it("옛 작업 그림 — 문서 조회 오류면 옛 그림을 그대로 준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    givenItem(); await libraryWrite(0, S1, A1); await libraryWrite(1, S2, A2);
    st.docFails = true;
    expect(await openedPositions()).toEqual([0, 1]);
  });

  it("파일 받기 — 문서 조회 오류면 옛 파일을 준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    givenItem(); await libraryWrite(0, S1, A1);
    st.docFails = true;
    expect(await getLibraryImageFile(viewer, ITEM, 0)).toMatchObject({ mimeType: "image/png" });
  });
});
