import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentHandlers } from "../http";
import { createLocalDocumentRepository } from "../local-repository";
import type { ServerDocument } from "../model";
import { createSupabaseDocumentRepository } from "../supabase-repository";

/**
 * W17: 보관 지점은 버전이 새로운 5개만 남는다. 더 새 보관 지점이 5개일 때 옛 버전을 보관하라고 하면
 * 전에는 200 을 돌려주고 실제로는 보관하지 않았다. 정직하게 409 와 까닭을 알린다.
 */
const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const message = "더 최근에 보관한 버전이 5개 있어 이 버전은 보관할 수 없습니다.";
const doc = (title: string): ServerDocument => ({ schemaVersion: 3, id, title, stage: "input", sourceMode: "image", assets: {}, body: { sections: [] } });
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-pin-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });
async function tenRevisions() {
  const root = mkdtempSync(join(tmpdir(), "pdp-pin-")); roots.push(root);
  const repo = createLocalDocumentRepository(root); await repo.create(user, id);
  for (let i = 0; i < 10; i++) await repo.save(user, id, i, doc(String(i)), crypto.randomUUID());
  for (const revision of [6, 7, 8, 9, 10]) await repo.pin(user, id, revision);
  const pinned = async () => {
    const raw = JSON.parse((await import("node:fs")).readFileSync(join(root, "pdp-documents.json"), "utf8"));
    return (raw.revisions as Array<{ revision: number; pinned?: boolean }>).filter(r => r.pinned).map(r => r.revision).sort((a, b) => a - b);
  };
  return { repo, pinned };
}
describe("W17: 밀려날 옛 버전 보관은 409", () => {
  it("로컬 저장소는 409 와 까닭을 알리고 보관 지점을 바꾸지 않는다", async () => {
    const { repo, pinned } = await tenRevisions();
    expect(await pinned()).toEqual([6, 7, 8, 9, 10]);
    await expect(repo.pin(user, id, 2)).rejects.toMatchObject({ status: 409, message });
    expect(await pinned()).toEqual([6, 7, 8, 9, 10]);
    await expect(repo.pin(user, id, 99)).rejects.toMatchObject({ status: 404 });
    await repo.pin(user, id, 9);
    expect(await pinned()).toEqual([6, 7, 8, 9, 10]);
  });
  it("API 도 200 이 아니라 409 와 한국어 까닭을 돌려준다", async () => {
    const { repo } = await tenRevisions();
    const storage = { exists: vi.fn(), uploadTicket: vi.fn(), urls: vi.fn(async () => ({})), removeAll: vi.fn(), copy: vi.fn() };
    const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: user }), repo, storage });
    const response = await h.pin(new Request("http://local/", { method: "POST", body: JSON.stringify({ revision: 2 }) }), id);
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe(message);
  });
  it("원격 저장소도 DB 의 409 를 「다른 창에서 저장」이 아닌 보관 한도로 설명한다", async () => {
    const db = { rpc: vi.fn(async () => ({ data: { status: 409 }, error: null })) };
    await expect(createSupabaseDocumentRepository(db as never).pin(user, id, 2)).rejects.toMatchObject({ status: 409, message });
    expect(db.rpc).toHaveBeenCalledWith("pdp_document_write", { p_user: user, p_id: id, p_action: "pin", p_payload: { revision: 2 } });
  });
});
