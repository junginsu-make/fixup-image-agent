import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../../lib/billable-fetch", () => ({ billableFetch: f.fetch }));
vi.mock("../../../lib/membership/account-events", () => ({ observeAccountResponse: () => {} }));

import { NO_IMAGE_MADE, STILL_MAKING, collectEasyImage } from "../collect";

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

  /**
   * 보안 리뷰 L1: 멈춘 요청이면 끝없이 물었다. 시작한 지 15분이 지나도 안 끝나면 실패로
   * 알린다. 만든 직후와 다시 열 때가 같은 함수라 둘 다 멈춘다.
   */
  describe("오래 걸리면 그만둔다 (L1)", () => {
    const 시계 = () => {
      let 지금 = 0;
      return { now: () => 지금, wait: async (ms: number) => { 지금 += ms; } };
    };
    const 끝난답 = 답({ ok: true, done: true, images: [{ id: "i1", url: "u", generationRequestId: "r1" }] });

    /**
     * 그 요청은 아직 끝날 수 있다(다시 열면 이어 받는다). 「다시 보내 주세요」(NO_IMAGE_MADE)는
     * 값이 또 드는 재전송을 부른다 — 15분 넘김은 따로 알리고, 재전송 안내도 안 붙인다.
     */
    it("15분이 지나도 안 끝나면 STILL_MAKING 으로 알린다 — 다시 보내라 하지 않는다", async () => {
      // 고치기 전에는 끝없이 묻는다 — 테스트가 멈추지 않게 200번째에 끝난 답을 준다.
      f.fetch.mockImplementation(async () => (f.fetch.mock.calls.length >= 200 ? 끝난답 : 답({ ok: true, done: false })));
      const { now, wait } = 시계();
      const 실패 = await collectEasyImage("p1", 일감, () => true, wait, now).then(() => undefined, (cause: unknown) => cause);
      expect(실패).toBeInstanceOf(Error);
      expect((실패 as Error).message).toBe(STILL_MAKING);
      expect((실패 as Error).message).not.toBe(NO_IMAGE_MADE);
      expect((실패 as { retryable?: boolean }).retryable).toBe(false);
      expect(f.fetch).toHaveBeenCalledTimes(90);
      // 화면에서만 알린다. 상태를 묻는 것 말고는 서버에 아무것도 안 보낸다(실패 줄로 안 남는다).
      expect(f.fetch.mock.calls.every(([url]) => url === "/api/poster/projects/p1/status")).toBe(true);
    });

    /** 재리뷰: 입력창에 같은 말을 다시 채우면 엔터 한 번에 값이 또 나간다. 크레딧 · 권한 실패는 그대로 채운다. */
    it("만든 직후 15분을 넘겨 그만두면 입력창에 같은 말을 다시 채우지 않는다", () => {
      expect(readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8"))
        .toContain("if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);");
    });

    it("15분 안에 끝나면 받는다", async () => {
      f.fetch.mockImplementation(async () => (f.fetch.mock.calls.length >= 89 ? 끝난답 : 답({ ok: true, done: false })));
      const { now, wait } = 시계();
      expect(await collectEasyImage("p1", 일감, () => true, wait, now)).toEqual({ id: "i1", url: "u" });
    });
  });

  it("화면을 떠났으면 묻지 않고 그만둔다", async () => {
    expect(await collectEasyImage("p1", 일감, () => false, 안기다림)).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
