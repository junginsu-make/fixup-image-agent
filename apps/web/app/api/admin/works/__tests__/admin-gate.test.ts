import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 관리자 통로의 관문.
 *
 * `readAnyWork`·`deleteAnyWork` 는 **스스로 묻지 않는다.** 서비스 키로 RLS 를
 * 지나지 않으므로, 라우트의 관문이 유일한 방어선이다. 그 관문이 빠지면 회원
 * 누구나 남의 작업을 읽게 된다 — 화면은 멀쩡히 뜨고 아무 오류도 안 난다.
 *
 * 라우트는 세션 인증을 타서 값으로 재기 어렵다. 그래서 소스로 지키되
 * **찾지 말고 센다** — 이 저장소는 「통과만 하는 가드」로 두 번 깨졌다
 * (2026-09-08·2026-09-15).
 */
const ROOT = join(__dirname, "..", "[kind]", "[id]");

/** 관리자 통로의 라우트. 늘릴 때 여기 한 줄을 더한다. */
const ROUTES = ["route.ts"];

function sourceOf(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("관리자 통로 관문", () => {
  it.each(ROUTES)("%s 가 authenticateApiAdmin 으로 한 번 막는다", (file) => {
    const source = sourceOf(file);
    const gates = source.match(/await authenticateApiAdmin\(\)/g) ?? [];
    expect(gates.length).toBe(1);
  });

  it.each(ROUTES)("%s 는 관문을 통과하지 못하면 바로 끝낸다", (file) => {
    // `if (!auth.ok) return auth.response;` 가 없으면 관문이 있어도 그냥 지나간다.
    expect(sourceOf(file)).toContain("if (!auth.ok) return auth.response;");
  });

  it.each(ROUTES)("%s 는 관문을 조회보다 **먼저** 둔다", (file) => {
    /*
      순서가 방어의 전부다. 조회를 먼저 하면 관리자가 아닌 사람의 요청에도
      DB 를 한 번 훑게 되고, 그 사이에 오류 문구나 응답 시간으로 존재 여부가
      샐 수 있다.
    */
    const source = sourceOf(file);
    const gate = source.indexOf("authenticateApiAdmin()");
    const read = source.search(/\b(readAnyWork|copyWorkToSelf)\(/);
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(read);
  });
});
