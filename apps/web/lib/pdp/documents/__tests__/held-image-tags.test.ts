import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminDocumentHandlers } from "../admin";
import { documentHandlers } from "../http";
import { createLocalDocumentRepository } from "../local-repository";
import { assetPath, HELD_IMAGE_TAG_LIMIT, type ServerDocument } from "../model";
import { createSupabaseDocumentRepository } from "../supabase-repository";
import { fakeState, fakeSupabase } from "./fake-supabase";

/**
 * **문서가 한 번이라도 가졌던 그림 지문**(최종 리뷰 M1). 라이브러리가 옛 그림을 숨길지 이것으로 정한다.
 * 서버가 저장할 때마다 「지난 목록 + 이번 문서의 섹션 그림 지문」으로 더한다 — 화면이 보내는 값이 아니다.
 * 복원·관리자 사본도 같은 저장 길이라 함께 지킨다. 다 지우면(정리) 비운다.
 */
const owner = "11111111-1111-4111-8111-111111111111", admin = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333", copyId = "44444444-4444-4444-8444-444444444444";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-held-repo-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });
const setup = () => { const root = mkdtempSync(join(tmpdir(), "pdp-held-repo-")); roots.push(root); return createLocalDocumentRepository(root); };
/** 8자리 지문 → 그 지문을 앞자리로 가진 sha1(40자리) 그림. `extra` 는 섹션에 걸리지 않은 첨부 그림. */
function documentOf(tags: string[], user = owner, docId = id, extra: string[] = []): ServerDocument {
  const asset = (tag: string) => {
    const sha256 = tag.repeat(8);
    return { path: assetPath(user, docId, sha256, "image/png"), sha256, legacyHash: tag + "0".repeat(32), bytes: 10, mimeType: "image/png" as const };
  };
  const assets = Object.fromEntries([...tags.map((tag, i) => [`x${i}`, asset(tag)]), ...extra.map((tag, i) => [`r${i}`, asset(tag)])]);
  return { schemaVersion: 3, id: docId, title: "문서", stage: "editor", sourceMode: "image", assets,
    body: { sections: tags.map((_, i) => ({ section_id: `s${i}`, generatedImage: { $asset: `x${i}`, format: "dataUrl" } })) } };
}
const tag = (n: number) => n.toString(16).padStart(8, "0");

describe("로컬 저장소 — 가졌던 지문", () => {
  it("저장마다 더하고, 지금 문서에서 빠진 그림도 남긴다(삭제·다시 만들기)", async () => {
    const repo = setup(); await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1", "aaaaaaa2", "aaaaaaa3"]), crypto.randomUUID());
    const saved = await repo.save(owner, id, 1, documentOf(["bbbbbbb1", "aaaaaaa3"]), crypto.randomUUID());
    // 오래 전에 본 것부터. 이번에 다시 본 aaaaaaa3 은 가장 최근으로 옮긴다.
    const expected = ["aaaaaaa1", "aaaaaaa2", "bbbbbbb1", "aaaaaaa3"];
    expect(saved.heldImageTags).toEqual(expected);
    expect((await repo.get(owner, id))?.heldImageTags).toEqual(expected);
    expect((await repo.list(owner))[0]).toMatchObject({ imageTags: ["bbbbbbb1", "aaaaaaa3"], heldImageTags: expected });
  });

  it("같은 내용을 다시 저장해도(글자만 고침) 문서가 받은 적 없는 지문은 생기지 않는다", async () => {
    const repo = setup(); await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    expect((await repo.save(owner, id, 1, documentOf(["aaaaaaa1"]), crypto.randomUUID())).heldImageTags).toEqual(["aaaaaaa1"]);
  });

  it("섹션에 걸리지 않은 첨부 그림의 지문은 넣지 않는다 — 라이브러리 줄은 섹션 그림뿐이다", async () => {
    const repo = setup(); await repo.create(owner, id);
    const saved = await repo.save(owner, id, 0, documentOf(["aaaaaaa1"], owner, id, ["eeeeeee1"]), crypto.randomUUID());
    expect(saved.heldImageTags).toEqual(["aaaaaaa1"]);
  });

  it("이전 버전 복원(HTTP)도 목록을 지킨다 — 복원으로 빠진 그림도 「가졌던 것」", async () => {
    const repo = setup();
    const storage = { exists: async () => true, uploadTicket: async () => ({ exists: true }), urls: async () => ({}), removeAll: async () => {}, copy: async () => {} };
    const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: owner }), repo, storage });
    await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    await repo.save(owner, id, 1, documentOf(["bbbbbbb1"]), crypto.randomUUID());
    const restored = await h.restore(new Request("http://local/", { method: "POST", body: JSON.stringify({ revision: 1, baseRevision: 2, requestId: crypto.randomUUID() }) }), id);
    expect(restored.status).toBe(200);
    expect((await repo.get(owner, id))?.heldImageTags).toEqual(["bbbbbbb1", "aaaaaaa1"]);
  });

  it("화면이 목록을 보낼 길은 없다 — 저장 요청에 실으면 400 이고 목록은 그대로", async () => {
    const repo = setup();
    const storage = { exists: async () => true, uploadTicket: async () => ({ exists: true }), urls: async () => ({}), removeAll: async () => {}, copy: async () => {} };
    const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: owner }), repo, storage });
    await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    const body = { baseRevision: 1, requestId: crypto.randomUUID(), document: documentOf(["aaaaaaa1"]), heldImageTags: ["bbbbbbb1"] };
    expect((await h.put(new Request("http://local/", { method: "PUT", body: JSON.stringify(body) }), id)).status).toBe(400);
    expect((await repo.get(owner, id))?.heldImageTags).toEqual(["aaaaaaa1"]);
  });

  it("관리자 사본은 사본에 담긴 그림만 가진다(원본의 지난 지문을 물려받지 않는다)", async () => {
    const repo = setup();
    const storage = { exists: async () => true, uploadTicket: vi.fn(), urls: async () => ({}), removeAll: vi.fn(), copy: vi.fn() };
    const h = adminDocumentHandlers({ enabled: () => true, authenticate: async () => ({ userId: admin }), repo, storage });
    await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    await repo.save(owner, id, 1, documentOf(["bbbbbbb1"]), crypto.randomUUID());
    const copied = await h.copy(new Request("http://local/", { method: "POST", body: JSON.stringify({ ownerId: owner, targetId: copyId, revision: 2 }) }), id);
    expect(copied.status).toBe(200);
    expect((await repo.get(admin, copyId))?.heldImageTags).toEqual(["bbbbbbb1"]);
  });

  it("다 지우면(정리) 목록도 비운다", async () => {
    const repo = setup(); await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    await repo.markDeleted(owner, id); await repo.finishDelete(owner, id);
    expect((await repo.find(owner, id, "id"))).toBeNull();
    const json = JSON.parse(readFileSync(join(roots.at(-1)!, "pdp-documents.json"), "utf8"));
    expect(json.documents[0].heldImageTags).toEqual([]);
  });

  it(`한도(${HELD_IMAGE_TAG_LIMIT}개)를 넘으면 가장 오래 전에 본 지문부터 놓는다 — 다시 본 지문은 최근으로`, async () => {
    const repo = setup(); await repo.create(owner, id);
    let revision = 0;
    for (let start = 0; start < 510; start += 30) {
      const tags = Array.from({ length: 30 }, (_, i) => tag(start + i));
      await repo.save(owner, id, revision, documentOf(tags), crypto.randomUUID()); revision += 1;
    }
    await repo.save(owner, id, revision, documentOf([tag(0)]), crypto.randomUUID());
    const held = (await repo.get(owner, id))!.heldImageTags!;
    expect(held).toHaveLength(HELD_IMAGE_TAG_LIMIT);
    expect(held.at(-1)).toBe(tag(0));
    expect(held).not.toContain(tag(1));
    expect(held).toContain(tag(509));
  });
});

describe("원격 저장소 — 서버 칸을 그대로 읽는다", () => {
  it("문서 한 건·목록 모두 held_image_tags 를 heldImageTags 로 준다", async () => {
    const state = fakeState({ pdp_documents: [{ id, user_id: owner, revision: 2, document: documentOf(["aaaaaaa3"]), source_draft_id: null,
      created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T01:00:00Z", deleted_at: null, last_request_id: null,
      held_image_tags: ["aaaaaaa1", "aaaaaaa3"], summary: { title: "문서", stage: "editor", sectionCount: 1, aspectRatio: null, imageCount: 1, cover: null, imageTags: ["aaaaaaa3"] } }] });
    const repo = createSupabaseDocumentRepository(fakeSupabase(state) as unknown as SupabaseClient);
    expect((await repo.get(owner, id))?.heldImageTags).toEqual(["aaaaaaa1", "aaaaaaa3"]);
    expect((await repo.list(owner))[0]).toMatchObject({ imageTags: ["aaaaaaa3"], heldImageTags: ["aaaaaaa1", "aaaaaaa3"] });
  });
});

describe("화면에 내보내는 목록에는 싣지 않는다", () => {
  it("회원 문서 목록·관리자 문서 목록 응답에 heldImageTags 가 없다", async () => {
    const repo = setup(); await repo.create(owner, id);
    await repo.save(owner, id, 0, documentOf(["aaaaaaa1"]), crypto.randomUUID());
    const storage = { exists: async () => true, uploadTicket: vi.fn(), urls: async () => ({}), removeAll: vi.fn(), copy: vi.fn() };
    const member = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: owner }), repo, storage });
    const manager = adminDocumentHandlers({ enabled: () => true, authenticate: async () => ({ userId: admin }), repo, storage });
    const [mine] = (await (await member.list()).json()).documents;
    const [all] = (await (await manager.list()).json()).documents;
    expect(mine).toMatchObject({ id, imageTags: ["aaaaaaa1"] }); expect(mine).not.toHaveProperty("heldImageTags");
    expect(all).toMatchObject({ id, imageTags: ["aaaaaaa1"] }); expect(all).not.toHaveProperty("heldImageTags");
  });
});
