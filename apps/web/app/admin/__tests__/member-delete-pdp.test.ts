import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeState } from "../../../lib/pdp/documents/__tests__/fake-supabase";

/**
 * W7: 관리자가 「회원을 아주 지운다」를 누르면 인증 계정만 지우고 상세페이지 원본 파일·관리자 사본이 남았다.
 * 계정을 지우기 전에 탈퇴와 같은 정리(withdrawPdpDocuments)를 하고, 실패하면 계정을 지우지 않는다.
 */
const box = vi.hoisted(() => ({ state: null as unknown as FakeState }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("../../../lib/email/approval", () => ({}));
vi.mock("../../../lib/membership/server", () => ({ requireAdmin: async () => ({ user: { id: "admin-id" }, profile: { email: "admin@example.invalid", role: "admin" } }) }));
vi.mock("../../../lib/supabase/admin", async () => {
  const { fakeSupabase } = await import("../../../lib/pdp/documents/__tests__/fake-supabase");
  return { createSupabaseAdminClient: () => fakeSupabase(box.state) };
});
import { deleteMember } from "../actions";
import { fakeState } from "../../../lib/pdp/documents/__tests__/fake-supabase";

const member = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const own = "e1000000-0000-4000-8000-000000000004", copy = "c1000000-0000-4000-8000-000000000001", otherCopy = "c2000000-0000-4000-8000-000000000002";
const png = "b".repeat(64) + ".png";
const file = (owner: string, doc: string) => `${owner}/pdp-docs/${doc}/${png}`;
const doc = (id: string, user_id: string, copied_from_owner: string | null) =>
  ({ id, user_id, revision: 1, document: { secret: id }, source_draft_id: null, deleted_at: null, cleanup_pending: false, copied_from_owner });
const form = () => { const data = new FormData(); data.set("userId", member); data.set("confirmEmail", "member@example.invalid"); return data; };
const row = (id: string) => box.state.tables.pdp_documents.find(r => r.id === id)!;
const pdpFiles = () => [...box.state.files["pdp-documents"]].sort();

beforeEach(() => {
  box.state = fakeState({
    profiles: [{ id: member, email: "member@example.invalid", role: "member", status: "active" }],
    pdp_documents: [doc(own, member, null), doc(copy, admin, member), doc(otherCopy, admin, other)],
    pdp_document_revisions: [{ document_id: own, user_id: member, revision: 1 }, { document_id: copy, user_id: admin, revision: 1 }],
  }, { "pdp-documents": [file(member, own), file(admin, copy), file(admin, otherCopy)] });
  box.state.rpc = { credit_member_has_records: () => ({ data: false, error: null }) };
});

describe("W7: 관리자 회원 삭제도 상세페이지 원본과 관리자 사본을 먼저 지운다", () => {
  it("문서·파일·사본을 지운 다음에야 인증 계정을 지운다", async () => {
    await deleteMember(form());
    expect(pdpFiles()).toEqual([file(admin, otherCopy)]);
    expect(row(own)).toMatchObject({ document: null, deleted_at: expect.any(String), cleanup_pending: false });
    expect(row(copy)).toMatchObject({ document: null, copied_from_owner: null, cleanup_pending: false });
    expect(row(otherCopy)).toMatchObject({ document: { secret: otherCopy }, deleted_at: null, copied_from_owner: other });
    expect(box.state.tables.pdp_document_revisions).toEqual([]);
    const deleted = box.state.events.indexOf(`deleteUser:${member}`);
    expect(deleted).toBeGreaterThan(box.state.events.indexOf("update:pdp_documents"));
    expect(deleted).toBeGreaterThan(box.state.events.indexOf(`write:purge:${copy}`));
  });
  it("정리가 실패하면 계정을 지우지 않고 다시 시도할 수 있게 남긴다", async () => {
    box.state.failures.add(`list:pdp-documents/${member}`);
    await expect(deleteMember(form())).rejects.toThrow("상세페이지 작업을 정리하지 못했습니다");
    expect(box.state.events).not.toContain(`deleteUser:${member}`);
    expect(row(own)).toMatchObject({ deleted_at: expect.any(String), cleanup_pending: true });
    box.state.failures.clear();
    await deleteMember(form());
    expect(box.state.events).toContain(`deleteUser:${member}`);
    expect(pdpFiles()).toEqual([file(admin, otherCopy)]);
  });
  it("돈 기록 때문에 못 지우는 회원의 작업은 건드리지 않는다", async () => {
    box.state.rpc = { credit_member_has_records: () => ({ data: true, error: null }) };
    await expect(deleteMember(form())).rejects.toThrow("대신 정지");
    expect(row(own)).toMatchObject({ document: { secret: own }, deleted_at: null });
    expect(pdpFiles()).toHaveLength(3);
  });
});
