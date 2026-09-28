import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **확인 문(`/api/pdp/library-sync`)이 무엇으로 답하는가**(2026-09-28).
 *
 * 화면은 `unavailable` 일 때만 예전처럼 직접 올리고, 그 밖의 실패에는 「다시 눌러
 * 주세요」를 띄운다. 그래서 어느 경우에 무엇으로 답하는지가 곧 중복·누락을 가른다.
 */
vi.mock("server-only", () => ({}));

let queueFull = false;
let busy = false;
const synced: unknown[] = [];
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
}));
vi.mock("../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../lib/pdp/jobs", () => ({ isPdpJobsEnabled: () => true }));
vi.mock("../../../../lib/pdp/jobs/library-sync", () => {
  class LibrarySyncBusyError extends Error {}
  return {
    LibrarySyncBusyError,
    libraryQueueFull: () => queueFull,
    syncDocumentLibraryNow: async (input: unknown) => {
      if (busy) throw new LibrarySyncBusyError();
      synced.push(input);
      return { desired: 1, covered: 1, missing: [] };
    },
  };
});

const { POST } = await import("../library-sync/route");

const DOC = "40c82a0c-97d0-4aae-868d-f667883edb10";
const post = (body: unknown) => POST(new Request("http://localhost/api/pdp/library-sync", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  queueFull = false;
  busy = false;
  synced.length = 0;
});

describe("확인 문", () => {
  it("맞춘 결과를 돌려준다", async () => {
    const response = await post({ documentId: DOC, pageSectionIds: ["a"], pageSectionHashes: [null] });
    expect(await response.json()).toEqual({ ok: true, desired: 1, covered: 1, missing: [] });
  });

  it("**줄이 가득 찼으면 본문을 읽기 전에 「바쁨」(429)** — 화면은 올리지 않고 다시 누르게 한다(4차 리뷰 LOW)", async () => {
    queueFull = true;
    const response = await post({ documentId: DOC, pageSectionIds: ["a"], pageSectionHashes: [null] });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, reason: "busy" });
    expect(synced).toEqual([]);
  });

  it("줄에서 거절당해도 「바쁨」(429)", async () => {
    busy = true;
    const response = await post({ documentId: DOC, pageSectionIds: ["a"], pageSectionHashes: [null] });
    expect(response.status).toBe(429);
  });

  it("**섹션 id 가 겹치는 예전 초안은 「맞출 수 없음」** — 화면이 예전처럼 직접 올린다(4차 리뷰 LOW)", async () => {
    const response = await post({ documentId: DOC, pageSectionIds: ["S1", "S1"], pageSectionHashes: [null, null] });
    expect(await response.json()).toEqual({ ok: false, reason: "unavailable" });
    expect(synced).toEqual([]);
  });

  it("지문이 없으면 400 — 화면과 맞춰 볼 수 없다", async () => {
    const response = await post({ documentId: DOC, pageSectionIds: ["a"] });
    expect(response.status).toBe(400);
  });
});
