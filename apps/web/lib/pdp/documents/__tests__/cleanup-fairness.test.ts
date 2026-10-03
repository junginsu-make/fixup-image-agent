import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentHandlers } from "../http";
import { createLocalDocumentRepository } from "../local-repository";
import { createSupabaseDocumentRepository } from "../supabase-repository";
import { fakeState, fakeSupabase } from "./fake-supabase";

/**
 * W18: 삭제 정리가 계속 실패하는 작업이 20건을 넘으면, 매번 같은 20건만 시도해 뒤 건은 영영 정리되지 않았다.
 * 마지막 시도 시각이 오래된(또는 한 번도 시도 안 한) 것부터 돌려 모두 차례가 오게 한다.
 */
const user = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const ids = Array.from({ length: 25 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-fair-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });

describe("W18: 영구 실패 삭제가 20건을 넘어도 모두 차례가 온다", () => {
  it("로컬: 목록 요청 두 번이면 25건 모두 정리를 시도한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "pdp-fair-")); roots.push(root);
    const repo = createLocalDocumentRepository(root);
    for (const id of ids) { await repo.create(user, id); await repo.markDeleted(user, id); }
    const storage = { exists: vi.fn(), uploadTicket: vi.fn(), urls: vi.fn(async () => ({})), copy: vi.fn(),
      removeAll: vi.fn(async (_userId: string, _id: string): Promise<void> => { throw Error("계속 실패"); }) };
    const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: user }), repo, storage });
    expect((await h.list()).status).toBe(200);
    expect((await h.list()).status).toBe(200);
    const tried = new Set(storage.removeAll.mock.calls.map(call => call[1]));
    expect([...ids].filter(id => !tried.has(id))).toEqual([]);
  });
  it("원격: 두 번째 묶음은 한 번도 시도하지 않은 5건부터 준다", async () => {
    const state = fakeState({ pdp_documents: [
      ...ids.map(id => ({ id, user_id: user, source_draft_id: null, deleted_at: "2026-10-01T00:00:00Z", cleanup_pending: true, cleanup_attempted_at: null })),
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", user_id: other, source_draft_id: null, deleted_at: "2026-10-01T00:00:00Z", cleanup_pending: true },
    ] });
    const repo = createSupabaseDocumentRepository(fakeSupabase(state) as never);
    const first = (await repo.pendingDeletes(user)).map(row => row.id);
    const second = (await repo.pendingDeletes(user)).map(row => row.id);
    expect(first).toHaveLength(20);
    expect(second.slice(0, 5).sort()).toEqual(ids.filter(id => !first.includes(id)).sort());
    expect(new Set([...first, ...second])).toEqual(new Set(ids));
    expect(state.tables.pdp_documents.find(row => row.user_id === other)?.cleanup_attempted_at).toBeUndefined();
  });
});
