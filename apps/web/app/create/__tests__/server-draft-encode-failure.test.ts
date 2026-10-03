import "fake-indexeddb/auto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerDraftRepository } from "../server-draft-repository";
import { createServerBrowserDrafts } from "../draft-repository";
import { getPdpDraft, type PdpDraftInput } from "../pdp-drafts";
import { createLocalDocumentRepository } from "../../../lib/pdp/documents/local-repository";
import { documentHandlers } from "../../../lib/pdp/documents/http";
import { DocumentError } from "../../../lib/pdp/documents/model";

/*
  저장 직전 그림을 담는 단계(`encodeServerDocument`)가 실패할 때(최종 리뷰 L2).

  전에는 어떤 오류든 그 문구를 그대로 보이고 임시 보관을 건너뛰었다 — 브라우저의 TypeError
  원문(「Cannot read properties…」)이 화면에 나오고, 이번 변경은 어디에도 남지 않았다.
  이제 다시 보내도 같은 「알려진 문서 오류(400·413)」만 그 말을 보이고, 나머지는 서버 장애처럼
  고정 문구 + 이 브라우저 임시 보관이다.
*/
const fault = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("../server-document-codec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server-document-codec")>();
  return {
    ...actual,
    encodeServerDocument: async (...args: Parameters<typeof actual.encodeServerDocument>) => {
      if (fault.error) throw fault.error;
      return actual.encodeServerDocument(...args);
    },
  };
});

const user = "11111111-1111-4111-8111-111111111111", roots: string[] = [];
const input = (message: string): PdpDraftInput => ({ appState: "upload", preparedImage: null, modelImage: null, modelImageUsage: null, result: null,
  additionalInfo: message, desiredTone: "", aspectRatio: "9:16", notice: "", editorState: null });
const empty = { get: async () => null, list: async () => [] };
type Fetch = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
function setup() {
  const root = mkdtempSync(join(tmpdir(), "pdp-encode-")); roots.push(root);
  const repo = createLocalDocumentRepository(root);
  const h = documentHandlers({ enabled: () => true, authenticate: async () => ({ userId: user }), repo,
    storage: { exists: async () => true, uploadTicket: async () => ({ exists: true }), urls: async () => ({}), removeAll: async () => {}, copy: async () => {} } });
  const fetcher: Fetch = async (url, init) => {
    const req = new Request(new URL(String(url), "http://local"), init);
    const [id, action] = new URL(req.url).pathname.replace("/api/pdp/documents", "").split("/").filter(Boolean);
    if (!id) return req.method === "POST" ? h.create(req) : h.list();
    if (action === "assets") return h.assets(req, id);
    if (req.method === "PUT") return h.put(req, id);
    return h.get(req, id);
  };
  return { repo, fetcher };
}
afterEach(() => {
  fault.error = null;
  for (const root of roots.splice(0)) { if (!root.startsWith(join(tmpdir(), "pdp-encode-"))) throw Error("unsafe"); rmSync(root, { recursive: true, force: true }); }
});

describe("L2: 저장 준비(그림 담기) 실패", () => {
  it("예상 못 한 오류(TypeError)는 원문을 보이지 않고, 서버 장애처럼 이 브라우저에 임시 보관한다", async () => {
    const { fetcher } = setup();
    const first = await createServerDraftRepository(empty, fetcher).save(input("처음"));
    const b = createServerDraftRepository(createServerBrowserDrafts(false), fetcher), opened = await b.get(first.id);
    fault.error = new TypeError("Cannot read properties of undefined (reading 'digest')");
    const saved = await b.save({ ...input("담다가 실패한 수정"), id: first.id, serverRevision: opened?.serverRevision });
    expect(saved.temporary).toBe(true);
    expect(await getPdpDraft(first.id)).toMatchObject({ temporary: true, additionalInfo: "담다가 실패한 수정" });
    await createServerBrowserDrafts(false).discard(first.id);
  });

  it("임시 보관할 곳이 없으면 고정 한국어 문구로 알린다(내부 문구 없음)", async () => {
    const { fetcher } = setup();
    const a = createServerDraftRepository(empty, fetcher), first = await a.save(input("처음"));
    fault.error = new TypeError("Cannot read properties of undefined (reading 'digest')");
    const failure = await a.save({ ...first, additionalInfo: "실패" }).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("작업을 저장하지 못했습니다.");
    expect((failure as Error).name).not.toBe("DocumentSaveRejectedError");
  });

  it.each([
    [new DocumentError(413, "작업 정보가 너무 큽니다."), "작업 정보가 너무 큽니다."],
    [new DocumentError(400, "그림 한 장은 20MB 이하여야 합니다."), "그림 한 장은 20MB 이하여야 합니다."],
  ])("알려진 문서 오류(%s)는 그 문구를 그대로 보이고 임시본을 만들지 않는다", async (error, message) => {
    const { fetcher } = setup();
    const first = await createServerDraftRepository(empty, fetcher).save(input("처음"));
    const b = createServerDraftRepository(createServerBrowserDrafts(false), fetcher), opened = await b.get(first.id);
    fault.error = error;
    const failure = await b.save({ ...input("못 담는 수정"), id: first.id, serverRevision: opened?.serverRevision }).catch((e: Error) => e);
    expect((failure as Error).name).toBe("DocumentSaveRejectedError");
    expect((failure as Error).message).toBe(message);
    expect(await getPdpDraft(first.id)).toBeNull();
  });

  it("문서 오류라도 400·413 이 아니면(예: 503) 다시 하면 될 실패로 보고 임시 보관한다", async () => {
    const { fetcher } = setup();
    const first = await createServerDraftRepository(empty, fetcher).save(input("처음"));
    const b = createServerDraftRepository(createServerBrowserDrafts(false), fetcher), opened = await b.get(first.id);
    fault.error = new DocumentError(503, "그림을 읽지 못했습니다.");
    const saved = await b.save({ ...input("잠깐 실패"), id: first.id, serverRevision: opened?.serverRevision });
    expect(saved.temporary).toBe(true);
    await createServerBrowserDrafts(false).discard(first.id);
  });
});
