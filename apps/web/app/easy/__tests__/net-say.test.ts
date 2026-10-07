import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orSay } from "../net-say";

/**
 * **연결이 끊긴 오류 글을 화면에 싣지 않는다**(2026-10-07 후속 Task 11 3차). 연결이 끊기면 `fetch` 가
 * `TypeError: Failed to fetch` 같은 브라우저 영어 글로 던지고, 쉽게 화면은 잡은 글을 그대로 보였다.
 * 그 자리마다 우리 문장으로 바꾼다. 응답을 받은 실패(서버가 준 말)는 건드리지 않는다.
 */
describe("연결 오류를 우리 문장으로 (orSay)", () => {
  it("받으면 그대로 돌려준다", async () => {
    expect(await orSay(Promise.resolve(7), "못 했습니다.")).toBe(7);
  });

  it("던지면 원래 글 없이 우리 문장으로 던진다(다시 하기 표시는 전과 같다)", async () => {
    const 실패 = await orSay(Promise.reject(new TypeError("Failed to fetch")), "그림을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요.")
      .then(() => undefined, (cause: unknown) => cause) as Error;
    expect(실패).toBeInstanceOf(Error);
    expect(실패).not.toBeInstanceOf(TypeError);
    expect(실패.message).toBe("그림을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요.");
    expect((실패 as { retryable?: boolean }).retryable).toBeUndefined();
  });
});

/** 잡은 오류 글을 그대로 보이는 쉽게 화면의 `fetch` 자리. 여기 모두 우리 문장으로 감싼다. */
describe("쉽게 화면의 fetch 자리 (후속 Task 11 3차)", () => {
  const 글 = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

  it("그림 올리기", () => {
    expect(글("../easy-client.tsx")).toContain(
      'const body = await (await orSay(fetch("/api/reference-images", { method: "POST", body: form }), UPLOAD_OFFLINE)).json().catch(() => ({}));',
    );
    expect(글("../net-say.ts")).toContain('export const UPLOAD_OFFLINE = "그림을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요.";');
  });

  it("말 보내기(만들기) — 서버가 이미 시작했을 수 있다고 알린다", () => {
    expect(글("../easy-client.tsx")).toMatch(/const response = await orSay\(billableFetch\("\/api\/easy\/generate", \{[\s\S]*?\}\), SEND_OFFLINE\);/);
    expect(글("../net-say.ts")).toContain("export const SEND_OFFLINE =");
  });

  it("카드뉴스 손보기 · 만들기", () => {
    expect(글("../cardnews-request.ts")).toContain('const response = await orSay(billableFetch("/api/easy/cardnews", { body: JSON.stringify(body) }), CARDNEWS_OFFLINE);');
  });

  it("카드뉴스 전부 받기", () => {
    expect(글("../use-cardnews-after.ts")).toContain("const blob = await orSay(");
    expect(글("../use-cardnews-after.ts")).toContain("`${card.index}번 그림을 받지 못했습니다.`");
    expect(글("../use-cardnews-after.ts")).not.toContain("await fetch(card.url)");
  });

  it("대화 지우기", () => {
    expect(글("../_components/conversation-list.tsx"))
      .toContain('const response = await orSay(fetch(`/api/easy/conversations/${id}`, { method: "DELETE" }), "지우지 못했습니다. 잠시 뒤 다시 해 주세요.");');
  });
});
