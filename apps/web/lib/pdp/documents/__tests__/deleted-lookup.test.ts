import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalDocumentRepository } from "../local-repository";
import { createSupabaseDocumentRepository } from "../supabase-repository";
import { fakeState, fakeSupabase } from "./fake-supabase";

/**
 * **문서 한 건이 지워졌는지(지우는 중 포함)만 묻는다**(최종 리뷰 L4).
 * 라이브러리 동기화가 생성마다 묻는다 — 회원의 지운 문서 목록 전체를 100개씩 읽으면 지운 문서가 많은
 * 회원일수록 왕복이 는다. 문서 번호나 옛 초안 번호(`source_draft_id`) 어느 쪽으로 물어도 같다.
 */
const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-deleted-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });

describe("로컬 저장소 isDeleted", () => {
  it("지우기 시작한 때부터 다 지운 뒤까지 참, 살아 있거나 남의 것·없는 번호는 거짓", async () => {
    const root = mkdtempSync(join(tmpdir(), "pdp-deleted-")); roots.push(root);
    const repo = createLocalDocumentRepository(root);
    await repo.create(owner, id, "legacy-1");
    expect(await repo.isDeleted(owner, id)).toBe(false);
    await repo.markDeleted(owner, id);
    expect(await repo.isDeleted(owner, id)).toBe(true);
    expect(await repo.isDeleted(owner, "legacy-1")).toBe(true);
    expect(await repo.isDeleted(other, id)).toBe(false);
    expect(await repo.isDeleted(owner, "nothing")).toBe(false);
    await repo.finishDelete(owner, id);
    expect(await repo.isDeleted(owner, id)).toBe(true);
  });
});

describe("원격 저장소 isDeleted", () => {
  const row = (extra: Record<string, unknown>) => ({ id, user_id: owner, revision: 1, document: null, source_draft_id: "legacy-1",
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", deleted_at: null, last_request_id: null, ...extra });
  function counted(state: ReturnType<typeof fakeState>) {
    const db = fakeSupabase(state), seen = { calls: 0 };
    return { seen, repo: createSupabaseDocumentRepository({ ...db, from: (name: string) => { seen.calls += 1; return db.from(name); } } as unknown as SupabaseClient) };
  }
  it("문서 번호·옛 초안 번호로 한 건만 묻고(최대 두 번), 지운 것만 참이다", async () => {
    const state = fakeState({ pdp_documents: [row({ deleted_at: "2026-10-02T00:00:00Z" })] });
    const { repo, seen } = counted(state);
    expect(await repo.isDeleted(owner, id)).toBe(true);
    expect(seen.calls).toBe(1);
    expect(await repo.isDeleted(owner, "legacy-1")).toBe(true);
    expect(await repo.isDeleted(other, id)).toBe(false);
    seen.calls = 0;
    expect(await repo.isDeleted(owner, "not-a-uuid")).toBe(false);
    expect(seen.calls).toBe(1); // uuid 가 아니면 id 칸은 묻지 않는다(형식 오류 대신)
  });
  it("살아 있는 문서는 거짓", async () => {
    const { repo } = counted(fakeState({ pdp_documents: [row({})] }));
    expect(await repo.isDeleted(owner, id)).toBe(false);
  });
  it("읽지 못하면 503 으로 던진다 — 부르는 쪽(동기화)이 「확인 못 함」으로 다룬다", async () => {
    const state = fakeState({ pdp_documents: [row({})] });
    state.failures.add("select:pdp_documents");
    await expect(counted(state).repo.isDeleted(owner, id)).rejects.toMatchObject({ status: 503 });
  });
});
