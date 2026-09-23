import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **「라이브러리에 저장」은 지금 판을 새 작업 하나로 남긴다**(2026-09-23 점검).
 *
 * 섹션은 만들 때마다 한 장씩 자동으로 올라가 있다. 전에는 이 단추가 전 장을
 * **같은 작업 뒤에** 다시 붙여 여덟 장이 열여섯 장이 됐고, 한 요청에 다 담아
 * 본문 한도(10MB)에도 걸렸다.
 *
 * 「이미 있는 자리는 건너뛴다」로 고쳤더니 독립 리뷰가 두 가지를 잡았다.
 *   - 섹션을 고친 뒤 누르면 장수만 보고 「이미 모두 저장」이라 하며 **고친 그림을
 *     버렸다**
 *   - 자동 저장 한 장이 실패한 뒤 누르면 **그 장은 빠지고 다른 장이 두 번** 붙었다
 * 장수로 내용을 가릴 수 없다. 그래서 누를 때마다 **지금 판을 새 작업으로** 남긴다 —
 * 아무것도 빠지지 않고, 한 작업 안에서 섞이지 않는다.
 */
const 올리기 = readFileSync(new URL("../library-upload.ts", import.meta.url), "utf8");
const 단추 = (() => {
  const source = readFileSync(new URL("../redesign-wizard.tsx", import.meta.url), "utf8");
  const at = source.indexOf("async function saveProjectToLibrary");
  return source.slice(at, source.indexOf("\n  }\n", at));
})();

describe("리디자인 라이브러리 저장 단추", () => {
  it("**누를 때마다 새 작업 열쇠를 쓴다** — 자동 저장한 작업 뒤에 붙이지 않는다", () => {
    expect(단추).toContain("uploadRedesignToLibrary(");
    expect(단추).toContain("sourceId: randomId()");
    expect(단추).not.toContain("sourceId: target.id");
  });

  it("**자리 대조로 건너뛰지 않는다** — 장수로는 고친 그림을 못 가린다", () => {
    expect(올리기).not.toContain("startPosition");
  });

  it("**한 요청에 한 장만 싣는다** — 본문 한도에 안 걸린다", () => {
    expect(올리기).toContain("images: [image]");
    expect(단추).not.toContain('fetch("/api/library"');
  });

  it("중간에 멈추면 몇 장까지 저장됐는지 알린다", () => {
    expect(올리기).toMatch(/장까지 저장/);
  });

  /*
    **저장 중에 또 누르면 같은 판이 두 벌 생긴다**(후속 독립 리뷰). 한 장씩
    보내니 여덟 장이면 수십 초가 걸리고, 누를 때마다 새 작업 열쇠를 받는다.
  */
  it("**저장하는 동안에는 또 누르지 못한다**", () => {
    expect(단추).toMatch(/if \(librarySavingRef\.current\)/);
    expect(단추).toContain("librarySavingRef.current = false");
  });

  /*
    **JSON 이 아닌 답(502·로그인 만료 화면)에도 몇 장까지 저장됐는지 알린다.**
    `response.json()` 이 던지면 그 수가 사라지고 알 수 없는 문구만 뜬다.
  */
  it("답을 못 읽어도 실패 문구 길로 간다", () => {
    expect(올리기).toContain("response.json().catch(");
    expect(올리기).toContain("!response.ok");
  });
});
