import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminDocumentHandlers } from "../admin";
import { createLocalDocumentRepository } from "../local-repository";
import { assetPath, type ServerDocument } from "../model";
import { createSupabaseDocumentRepository } from "../supabase-repository";
import { fakeState, fakeSupabase } from "./fake-supabase";

/**
 * W8(사용자 결정 2026-10-03): 회원이 떠나면 그 회원이 원본인 관리자 사본도 지운다.
 * 사본을 찾는 표시는 서버만 적는다(본문의 copiedFrom 은 화면 저장 때 빠질 수 있고 회원도 쓸 수 있다).
 */
const owner = "11111111-1111-4111-8111-111111111111", admin = "22222222-2222-4222-8222-222222222222";
const admin2 = "55555555-5555-4555-8555-555555555555";
const id = "33333333-3333-4333-8333-333333333333", target = "44444444-4444-4444-8444-444444444444";
const target2 = "66666666-6666-4666-8666-666666666666";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-copy-owner-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "pdp-copy-owner-")); roots.push(root);
  const repo = createLocalDocumentRepository(root), uploaded = new Set<string>();
  const storage = { urls: vi.fn(async () => ({})), exists: async (a: { path: string }) => uploaded.has(a.path), uploadTicket: vi.fn(),
    removeAll: vi.fn(), copy: vi.fn(async (_a: unknown, b: { path: string }) => { uploaded.add(b.path); }) };
  const as = (viewer: string) => adminDocumentHandlers({ enabled: () => true, authenticate: async () => ({ userId: viewer }), repo, storage });
  return { repo, storage, as };
}
const copyRequest = (ownerId: string, targetId: string) =>
  new Request("http://local/", { method: "POST", body: JSON.stringify({ ownerId, targetId, revision: 1 }) });
async function ownerDocument(repo: ReturnType<typeof createLocalDocumentRepository>) {
  await repo.create(owner, id);
  const asset = { sha256: "a".repeat(64), bytes: 20, mimeType: "image/png" as const, path: assetPath(owner, id, "a".repeat(64), "image/png") };
  const doc: ServerDocument = { schemaVersion: 3, id, title: "원본", stage: "input", sourceMode: "image", assets: { a: asset }, body: { sections: [] } };
  await repo.save(owner, id, 0, doc, crypto.randomUUID());
}

describe("W8: 관리자 사본에 원래 회원을 서버가 적는다", () => {
  it("복사한 사본은 원래 회원으로 찾을 수 있고, 다 지우면 표시가 사라진다", async () => {
    const { repo, as } = setup(); await ownerDocument(repo);
    expect((await as(admin).copy(copyRequest(owner, target), id)).status).toBe(200);
    expect((await repo.get(admin, target))?.copiedFromOwner).toBe(owner);
    expect(await repo.copiesOf(owner)).toEqual([{ id: target, userId: admin, sourceDraftId: null }]);
    expect(await repo.copiesOf(admin)).toEqual([]);
    await repo.markDeleted(admin, target); await repo.finishDelete(admin, target);
    expect(await repo.copiesOf(owner)).toEqual([]);
  });
  it("사본의 사본도 처음 회원을 원본으로 적는다", async () => {
    const { repo, as } = setup(); await ownerDocument(repo);
    await as(admin).copy(copyRequest(owner, target), id);
    expect((await as(admin2).copy(copyRequest(admin, target2), target)).status).toBe(200);
    expect((await repo.get(admin2, target2))?.copiedFromOwner).toBe(owner);
    expect((await repo.copiesOf(owner)).map(row => row.id).sort()).toEqual([target, target2].sort());
  });
  it("표시 없는 내 빈 작업 번호에는 복사하지 않는다(사본인데 못 찾는 일을 막는다)", async () => {
    const { repo, as, storage } = setup(); await ownerDocument(repo);
    await repo.create(admin, target);
    expect((await as(admin).copy(copyRequest(owner, target), id)).status).toBe(409);
    expect(storage.copy).not.toHaveBeenCalled();
    expect((await repo.get(admin, target))?.document).toBeNull();
  });
  it("원격 저장소는 사본 표시를 만들기 요청에 싣고, 표시로 사본을 찾는다", async () => {
    const state = fakeState({ pdp_documents: [
      { id: target, user_id: admin, source_draft_id: null, copied_from_owner: owner },
      { id: target2, user_id: admin, source_draft_id: null, copied_from_owner: admin2 },
      { id, user_id: owner, source_draft_id: null, copied_from_owner: null },
    ] });
    const db = fakeSupabase(state), rpc = vi.spyOn(db, "rpc");
    const repo = createSupabaseDocumentRepository(db as never);
    expect(await repo.copiesOf(owner)).toEqual([{ id: target, userId: admin, sourceDraftId: null }]);
    await repo.createCopy(admin, target, owner).catch(() => undefined);
    expect(rpc).toHaveBeenCalledWith("pdp_document_write", { p_user: admin, p_id: target, p_action: "create", p_payload: { copiedFromOwner: owner } });
  });
});
