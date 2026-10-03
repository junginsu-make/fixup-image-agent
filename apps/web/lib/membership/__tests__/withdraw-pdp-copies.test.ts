import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeState, fakeSupabase, type FakeState } from "../../pdp/documents/__tests__/fake-supabase";

/**
 * W8(사용자 결정 2026-10-03): 회원이 떠나면(닫기·지우기 두 길) 그 회원이 원본인 관리자 사본 문서와 파일도 지운다.
 * 실패하면 탈퇴 성공이라 말하지 않고, 다시 시도하면 이어서 지운다. 다른 회원의 사본은 건드리지 않는다.
 * W19: 중간에 실패해도 숨긴 문서에 「정리 대기」를 남겨 다음 정리 루틴이 이어서 지운다.
 */
vi.mock("server-only", () => ({}));
const box = vi.hoisted(() => ({ state: null as unknown as FakeState }));
vi.mock("../../supabase/admin", async () => {
  const { fakeSupabase: make } = await import("../../pdp/documents/__tests__/fake-supabase");
  return { createSupabaseAdminClient: () => make(box.state) };
});
import { withdrawAccount } from "../withdraw-account";
import { createSupabaseDocumentRepository } from "../../pdp/documents/supabase-repository";

const u1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", u2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const C1 = "c1000000-0000-4000-8000-000000000001", C2 = "c2000000-0000-4000-8000-000000000002";
const D = "d0000000-0000-4000-8000-000000000003", O1 = "e1000000-0000-4000-8000-000000000004", O2 = "e2000000-0000-4000-8000-000000000005";
const item = "f1000000-0000-4000-8000-000000000006", item2 = "f2000000-0000-4000-8000-000000000007";
const png = "a".repeat(64) + ".png";
const file = (owner: string, doc: string) => `${owner}/pdp-docs/${doc}/${png}`;
const doc = (id: string, user_id: string, copied_from_owner: string | null) =>
  ({ id, user_id, revision: 1, document: { secret: id }, source_draft_id: null, deleted_at: null, cleanup_pending: false, copied_from_owner });

function seed(close: boolean) {
  const state = fakeState({
    profiles: [{ id: u1, status: "active" }], credit_grants: [],
    pdp_documents: [doc(C1, admin, u1), doc(C2, admin, u2), doc(D, admin, null), doc(O1, u1, null), doc(O2, u2, null)],
    pdp_document_revisions: [C1, C2, O1].map(id => ({ document_id: id, user_id: id === O1 ? u1 : admin, revision: 1 })),
    library_items: [{ id: item, user_id: admin, tool: "create", source_id: C1 }, { id: item2, user_id: admin, tool: "create", source_id: D }],
    library_images: [{ user_id: admin, item_id: item, path: `${admin}/${item}/a.png`, thumb_path: null },
      { user_id: admin, item_id: item2, path: `${admin}/${item2}/b.png`, thumb_path: null }],
  }, {
    "pdp-documents": [file(admin, C1), file(admin, C2), file(admin, D), file(u1, O1), file(u2, O2)],
    library: [`${admin}/${item}/a.png`, `${admin}/${item2}/b.png`],
  });
  state.rpc = { credit_member_has_records: () => ({ data: close, error: null }), member_withdraw: () => ({ data: null, error: null }) };
  return state;
}
const row = (id: string) => box.state.tables.pdp_documents.find(r => r.id === id)!;
const files = (bucket: string) => [...box.state.files[bucket]].sort();
const finished = () => box.state.events.findIndex(e => e === `deleteUser:${u1}` || e === "rpc:member_withdraw");

describe("W8: 떠나는 회원이 원본인 관리자 사본도 지운다", () => {
  beforeEach(() => { box.state = seed(false); });
  it.each([false, true])("탈퇴(close=%s)는 사본 문서·이전 버전·파일·연결 그림을 먼저 지우고 다른 사본은 그대로 둔다", async close => {
    box.state = seed(close);
    const result = await withdrawAccount(u1, "");
    expect(result).toMatchObject({ ok: true, path: close ? "close" : "delete" });
    expect(row(C1)).toMatchObject({ document: null, cleanup_pending: false, copied_from_owner: null, deleted_at: expect.any(String) });
    expect(box.state.tables.pdp_document_revisions.map(r => r.document_id)).toEqual([C2]);
    expect(files("pdp-documents")).toEqual([file(admin, C2), file(admin, D), file(u2, O2)].sort());
    expect(files("library")).toEqual([`${admin}/${item2}/b.png`]);
    expect(box.state.tables.library_items.map(r => r.id)).toEqual([item2]);
    for (const id of [C2, D, O2]) expect(row(id)).toMatchObject({ document: { secret: id }, deleted_at: null });
    expect(row(C2).copied_from_owner).toBe(u2);
    expect(box.state.events.indexOf(`write:purge:${C1}`)).toBeGreaterThanOrEqual(0);
    expect(box.state.events.indexOf(`write:purge:${C1}`)).toBeLessThan(finished());
  });
  it("사본 파일 정리가 실패하면 탈퇴하지 않고, 사본은 정리 대기로 남아 다시 시도하면 끝난다", async () => {
    box.state.failures.add(`list:pdp-documents/${admin}/pdp-docs/${C1}`);
    expect((await withdrawAccount(u1, "")).ok).toBe(false);
    expect(finished()).toBe(-1);
    expect(row(C1)).toMatchObject({ cleanup_pending: true, deleted_at: expect.any(String), copied_from_owner: u1 });
    expect(files("pdp-documents")).toContain(file(admin, C1));
    const repo = createSupabaseDocumentRepository(fakeSupabase(box.state) as never);
    expect((await repo.pendingDeletes(admin)).map(r => r.id)).toEqual([C1]);
    box.state.failures.clear();
    expect((await withdrawAccount(u1, "")).ok).toBe(true);
    expect(row(C1)).toMatchObject({ document: null, cleanup_pending: false, copied_from_owner: null });
    expect(files("pdp-documents")).not.toContain(file(admin, C1));
  });
});

describe("W19: 중간 실패 뒤에도 숨긴 문서는 「정리 대기」로 남는다", () => {
  beforeEach(() => { box.state = seed(false); });
  it("내 파일 목록이 실패하면 탈퇴를 멈추고, 다음 정리 루틴이 이어서 지울 수 있게 표시한다", async () => {
    box.state.failures.add(`list:pdp-documents/${u1}`);
    expect((await withdrawAccount(u1, "")).ok).toBe(false);
    expect(finished()).toBe(-1);
    expect(row(O1)).toMatchObject({ deleted_at: expect.any(String), cleanup_pending: true });
    const repo = createSupabaseDocumentRepository(fakeSupabase(box.state) as never);
    expect((await repo.pendingDeletes(u1)).map(r => r.id)).toEqual([O1]);
    box.state.failures.clear();
    expect((await withdrawAccount(u1, "")).ok).toBe(true);
    expect(row(O1)).toMatchObject({ document: null, cleanup_pending: false });
    expect(row(O2)).toMatchObject({ cleanup_pending: false, deleted_at: null });
  });
});
