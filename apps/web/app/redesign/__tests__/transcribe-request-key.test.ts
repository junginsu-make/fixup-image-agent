import { describe, expect, it, vi } from "vitest";
import { runTranscription } from "../transcribe-client";

/**
 * **전사에 요청 식별자를 붙인다**(F-7-9).
 *
 * 전사가 예약을 거치게 되면서 `x-idempotency-key` 가 필수가 됐다
 * (`reserveAiUsage`). 화면이 안 보내면 **모든 배치가 400** 이다.
 *
 * 그런데 이 길의 실패는 조용하다 — `runTranscription` 의 catch 가 실패한
 * 배치를 「[구간 전사 실패]」 자리표시로 바꾼다. 전사는 「됐다」고 하면서
 * 내용이 통째로 비고, 그 빈 전사로 기획이 돈다.
 *
 * **배치마다 다른 열쇠여야 한다.** 같은 값을 쓰면 두 번째부터
 * `duplicate_request` 로 거절된다.
 */

const 스트립 = (base64 = "AAA") => ({
  base64, mimeType: "image/jpeg", yStartRatio: 0, yEndRatio: 1,
});

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const 받아적는다 = () => {
  const 열쇠: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    열쇠.push(headers.get("x-idempotency-key") ?? "");
    return {
      ok: true,
      status: 200,
      json: async () => ({ transcript: "### 구간 1", lastSectionType: "후킹" }),
    };
  });
  return 열쇠;
};

describe("전사 요청에 식별자가 붙는다", () => {
  it("**열쇠를 보낸다** — 안 보내면 모든 배치가 400 이고 그 실패는 조용하다", async () => {
    const 열쇠 = 받아적는다();

    try {
      await runTranscription([스트립()], { provider: "openai" });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(열쇠).toHaveLength(1);
    expect(열쇠[0]).toMatch(UUID4);
  });

  it("**배치마다 다른 열쇠다** — 같으면 두 번째부터 중복으로 거절된다", async () => {
    const 열쇠 = 받아적는다();
    // 배치는 여덟 장씩 끊긴다. 아홉 장이면 두 배치다.
    const 스트립들 = Array.from({ length: 9 }, () => 스트립());

    try {
      await runTranscription(스트립들, { provider: "openai" });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(열쇠).toHaveLength(2);
    expect(new Set(열쇠).size).toBe(2);
  });
});
