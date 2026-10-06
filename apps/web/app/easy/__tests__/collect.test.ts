import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../../lib/billable-fetch", () => ({ billableFetch: f.fetch }));
vi.mock("../../../lib/membership/account-events", () => ({ observeAccountResponse: () => {} }));

import { NO_IMAGE_MADE, collectEasyImage } from "../collect";

/**
 * **결과 받기**(화면에서 옮김, 2026-10-06 설계 B3 · B5). 만든 직후와 다시 열 때가 같은
 * 함수를 쓴다. 0장으로 끝나면 「만들고 있습니다」가 영원히 돌았다 — 이제 실패로 알린다.
 */
const 답 = (body: unknown) => ({ json: async () => body });
const 일감 = { requestRowId: "r1", falRequestId: "f1", endpoint: "e" };
const 안기다림 = async () => {};

beforeEach(() => { f.fetch.mockReset(); });

describe("결과 받기", () => {
  it("이번 요청의 그림을 받는다", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "i1", url: "https://x/1.png", generationRequestId: "r1" }] }));
    expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "https://x/1.png" });
    expect(f.fetch.mock.calls[0]![0]).toBe("/api/poster/projects/p1/status");
  });

  it("끝날 때까지 다시 묻는다", async () => {
    f.fetch
      .mockResolvedValueOnce(답({ ok: true, done: false }))
      .mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "i1", url: "u", generationRequestId: "r1" }] }));
    await collectEasyImage("p1", 일감, () => true, 안기다림);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it("끝났는데 이번 요청의 그림이 0장이면 실패로 알린다 (B5)", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: true, done: true, images: [{ id: "old", url: "u", generationRequestId: "r0" }] }));
    await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow(NO_IMAGE_MADE);
  });

  it("상태 확인이 실패하면 그 말로 알린다", async () => {
    f.fetch.mockResolvedValueOnce(답({ ok: false, message: "내용 검사에 걸렸습니다." }));
    await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow("내용 검사에 걸렸습니다.");
  });

  it("화면을 떠났으면 묻지 않고 그만둔다", async () => {
    expect(await collectEasyImage("p1", 일감, () => false, 안기다림)).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
