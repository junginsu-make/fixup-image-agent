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
const 답 = (body: unknown, status = 200) => ({ status, json: async () => body });
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
   * **잠깐의 고장은 「아직 안 끝남」으로 보고 계속 묻는다**(후속 Task 11 3차). 연결이 끊기거나(`fetch` 가 던짐),
   * 앞단(Caddy · Next)이 HTML 502 를 주거나, 502 · 503 · 504 가 우리 말 없이 오면 전에는 영어 글로 실패했고,
   * 화면의 다시 보내기는 값이 또 드는 재전송이었다. 그 요청은 아직 돌고 있다. 15분 상한은 그대로다.
   */
  describe("잠깐의 고장 (후속 Task 11 3차)", () => {
    const 받은답 = 답({ ok: true, done: true, images: [{ id: "i1", url: "u", generationRequestId: "r1" }] });
    const HTML답 = (status: number) => ({
      status, json: async () => { throw new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON"); },
    });

    it("연결이 끊겨 fetch 가 던지면 다시 묻는다", async () => {
      f.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(받은답);
      expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "u" });
      expect(f.fetch).toHaveBeenCalledTimes(2);
    });

    it.each([502, 503, 504, 500, 200])("JSON 이 아닌 %i 답이면 다시 묻는다", async (status) => {
      f.fetch.mockResolvedValueOnce(HTML답(status)).mockResolvedValueOnce(받은답);
      expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "u" });
      expect(f.fetch).toHaveBeenCalledTimes(2);
    });

    it.each([502, 503, 504])("%i 가 우리 말 없이 오면(JSON 이어도) 다시 묻는다", async (status) => {
      f.fetch.mockResolvedValueOnce(답({}, status)).mockResolvedValueOnce(답({ ok: false }, status)).mockResolvedValueOnce(받은답);
      expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "u" });
      expect(f.fetch).toHaveBeenCalledTimes(3);
    });

    it("객체가 아닌 답(null)도 4xx 가 아니면 다시 묻는다", async () => {
      f.fetch.mockResolvedValueOnce(답(null)).mockResolvedValueOnce(받은답);
      expect(await collectEasyImage("p1", 일감, () => true, 안기다림)).toEqual({ id: "i1", url: "u" });
    });

    /** 일부러 낸 실패는 지금처럼 곧바로 알린다. */
    it.each([
      [503, "운영자가 AI 사용을 잠시 멈췄습니다."],
      [503, "만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요."],
      [502, "만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요."],
      [404, "프로젝트를 찾을 수 없습니다."],
      [409, "생성 요청 정보가 일치하지 않습니다."],
      [500, "지금 요청이 몰려 있습니다. 잠시 뒤 다시 눌러 주세요."],
    ])("%i 에 우리 말이 있으면 그 말로 곧바로 알린다", async (status, message) => {
      f.fetch.mockResolvedValueOnce(답({ ok: false, kind: "fault", message }, status));
      await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow(message);
      expect(f.fetch).toHaveBeenCalledTimes(1);
    });

    it("4xx 는 JSON 이 아니어도 곧바로 알린다 — 영어 글 없이", async () => {
      f.fetch.mockResolvedValueOnce(HTML답(404));
      const 실패 = await collectEasyImage("p1", 일감, () => true, 안기다림).then(() => undefined, (c: unknown) => c) as Error;
      expect(실패.message).toBe("상태를 확인하지 못했습니다.");
      expect(실패).not.toBeInstanceOf(SyntaxError);
      expect(f.fetch).toHaveBeenCalledTimes(1);
      f.fetch.mockResolvedValueOnce(답(null, 400));
      await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow("상태를 확인하지 못했습니다.");
    });

    it("200 인데 ok 가 없으면 지금처럼 곧바로 알린다", async () => {
      f.fetch.mockResolvedValueOnce(답({}));
      await expect(collectEasyImage("p1", 일감, () => true, 안기다림)).rejects.toThrow("상태를 확인하지 못했습니다.");
    });

    it("고장이 15분 넘게 이어지면 STILL_MAKING 으로 그만둔다 — 영어 글 · 재전송 안내 없이", async () => {
      let 지금 = 0;
      let 번 = 0;
      f.fetch.mockImplementation(async () => {
        번 += 1;
        if (번 >= 200) return 받은답;
        if (번 % 2) throw new TypeError("Failed to fetch");
        return HTML답(502);
      });
      const 실패 = await collectEasyImage("p1", 일감, () => true, async (ms) => { 지금 += ms; }, () => 지금)
        .then(() => undefined, (c: unknown) => c) as Error;
      expect(실패.message).toBe(STILL_MAKING);
      expect((실패 as { retryable?: boolean }).retryable).toBe(false);
      expect(f.fetch).toHaveBeenCalledTimes(90);
    });

    it("고장 뒤 화면을 떠났으면 그만둔다", async () => {
      let 살아있다 = true;
      f.fetch.mockImplementationOnce(async () => { 살아있다 = false; throw new TypeError("Failed to fetch"); });
      expect(await collectEasyImage("p1", 일감, () => 살아있다, 안기다림)).toBeUndefined();
      expect(f.fetch).toHaveBeenCalledTimes(1);
    });
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

/**
 * 후속 Task 11 2차. 화면이 서버 답을 `.json()` 으로 읽고 **잡은 오류 글을 그대로 보이는** 자리는 HTML 답에
 * SyntaxError 글이 실린다. 그런 자리는 읽기 실패를 빈 답으로 받아 그 자리의 우리 문장으로 알린다.
 * (목록 읽기처럼 실패를 빈 목록으로 삼키는 자리는 글이 안 보여 그대로 둔다.)
 */
describe("화면의 JSON 읽기 (후속 Task 11 2차)", () => {
  it("그림 올리기는 JSON 이 아닌 답을 「그림을 올리지 못했습니다.」로 알린다", () => {
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    // 3차에서 연결 오류도 감쌌다(`net-say.test.ts`). 답 읽기의 `.catch` 는 그대로다.
    expect(화면).toContain('const body = await (await orSay(fetch("/api/reference-images", { method: "POST", body: form }), UPLOAD_OFFLINE)).json().catch(() => ({}));');
    expect(화면).toContain('if (!body.ok) throw new Error(body.message ?? "그림을 올리지 못했습니다.");');
  });
});
