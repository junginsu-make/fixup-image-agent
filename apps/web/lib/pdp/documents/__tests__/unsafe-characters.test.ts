import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentHandlers } from "../http";
import { createLocalDocumentRepository } from "../local-repository";
import { validateDocument, type ServerDocument } from "../model";
import { createSupabaseDocumentRepository } from "../supabase-repository";

/**
 * W16: NUL 문자·짝 없는 서로게이트는 PostgreSQL jsonb 가 받지 않는다(22P05·22P02).
 * 전에는 저장소 오류로 503 이 나서 화면이 「잠시 뒤 다시」로 안내했다. 검증에서 400 으로 거절한다.
 */
const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const message = "저장할 수 없는 문자가 있습니다.";
const base = (body: Record<string, unknown> = {}, title = "작업"): ServerDocument => ({
  schemaVersion: 3, id, title, stage: "editor", sourceMode: "image", assets: {},
  body: { sections: [], inputs: { additionalInfo: "" }, settings: {}, references: [], blueprint: {}, editor: null, ...body },
} as ServerDocument);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (!root.startsWith(join(tmpdir(), "pdp-chars-"))) throw Error("unsafe");
  rmSync(root, { recursive: true, force: true });
} });

describe("W16: DB 가 받지 않는 문자는 검증에서 400", () => {
  it.each([
    ["제목의 NUL", base({}, "제목\u0000")],
    ["본문의 NUL", base({ notice: "a\u0000b" })],
    ["열쇠의 NUL", base({ editor: { ["layer\u0000"]: 1 } })],
    ["짝 없는 앞 서로게이트", base({ inputs: { additionalInfo: "글\ud800" } })],
    ["짝 없는 뒤 서로게이트", base({ sections: [{ section_id: "s1", headline: "\udc00글" }] })],
    ["열쇠의 짝 없는 서로게이트", base({ editor: { ["\ud83d"]: "x" } })],
  ])("%s", (_name, doc) => {
    expect(() => validateDocument(doc, user, id)).toThrow(expect.objectContaining({ status: 400, message }));
  });
  it("짝이 맞는 이모지와 보통 제어 문자는 그대로 저장한다", () => {
    expect(() => validateDocument(base({ notice: "좋아요😀\u0001\t" }, "제목 👍"), user, id)).not.toThrow();
  });
  it("API 저장도 503 이 아니라 400 과 한국어 안내를 돌려준다", async () => {
    const root = mkdtempSync(join(tmpdir(), "pdp-chars-")); roots.push(root);
    const repo = createLocalDocumentRepository(root); await repo.create(user, id);
    const storage = { exists: vi.fn(async () => true), uploadTicket: vi.fn(), urls: vi.fn(async () => ({})), removeAll: vi.fn(), copy: vi.fn() };
    const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: user }), repo, storage });
    const body = JSON.stringify({ baseRevision: 0, requestId: crypto.randomUUID(), document: base({ notice: "\ud800" }) });
    const response = await h.put(new Request("http://local/", { method: "PUT", body }), id);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
    expect((await repo.get(user, id))?.revision).toBe(0);
  });
  it.each([
    ["22P05", "unsupported Unicode escape sequence"],
    ["22021", "invalid byte sequence for encoding \"UTF8\": 0x00"],
    ["22P02", "invalid input syntax for type json"],
  ])("DB 가 문자 오류(%s)를 돌려줘도 400 으로 설명한다", async (code, text) => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: { code, message: text } })) };
    const repo = createSupabaseDocumentRepository(db as never);
    await expect(repo.create(user, id, "draft\u0000")).rejects.toMatchObject({ status: 400, message });
  });
  it("문자와 무관한 DB 오류는 그대로 503 이다", async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } })) };
    await expect(createSupabaseDocumentRepository(db as never).create(user, id)).rejects.toMatchObject({ status: 503 });
  });
});
