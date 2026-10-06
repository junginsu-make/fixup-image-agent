import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **갈래를 단추로 고른 턴에만 `kindPicked`**(2026-10-06 설계 A2, 최종 리뷰). 화면 안의
 * 한 줄이라 글자로 잰다. 서버는 이 칸이 있을 때만 판단과 상관없이 그 갈래로 간다.
 */
const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

describe("kindPicked", () => {
  it("다시 보낸 말에 고른 갈래가 있을 때만 싣는다", () => {
    expect(화면).toContain("...(다시?.kind ? { kindPicked: true } : {}),");
  });

  it("이어 온 갈래(kind)로는 싣지 않는다 — 말로 한 답은 고른 것이 아니다", () => {
    expect(화면).not.toMatch(/\.\.\.\(kind \? \{[^}]*kindPicked/);
  });
});
