import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 기획이 **사람을 실제로 보는가** (2026-09-08 실측).
 *
 * 규칙(`readAttachments`·`planReferences`)은 잠겨 있는데 **라우트가 그것을
 * 부르는 자리**는 아무도 안 본다. 안 부르면 기획은 사람을 못 본 채 예전처럼 한
 * 줄로 뭉뚱그리고, 안경이 다시 사라진다.
 *
 * **2026-09-17 에 읽기가 하나로 합쳐졌다**(설계 §5-1). 전에는 `readPeople` 이
 * 따로 돌고 `personIds` 로 걸렀는데, 그 거르기가 바로 문제였다 — 역할이 무엇을
 * 읽을지 정하니 「따라 만들기」로 붙인 그림의 사람은 아무도 안 봤다.
 */

const source = readFileSync(
  new URL("../projects/[id]/plan/route.ts", import.meta.url),
  "utf8",
);

describe("사람 읽기가 기획에 이어져 있는가", () => {
  it("붙인 것을 읽는다", () => {
    expect(source).toContain("readAttachments(");
    expect(source).toContain("createPosterAttachmentReader()");
  });

  /**
   * **붙인 것을 하나도 안 빼고 읽는다.**
   *
   * 전에는 「지킬 사람의 사진만」이었다. 그 좁힘이 2026-09-17 회귀의 뿌리다 —
   * 레퍼런스에 있는 사람도, 그 사람들이 무엇을 하고 있는지도 안 읽혔다.
   */
  it("붙인 것을 역할로 안 가른다", () => {
    expect(source).toMatch(/readAttachments\([\s\S]{0,120}\[\.\.\.references, \.\.\.preserved\]/);
  });

  it("거르던 말이 남아 있지 않다", () => {
    expect(source).not.toContain("personIds.has(reference.id)");
    expect(source).not.toContain("readPeople(");
  });

  it("읽은 것을 기획 목록에 실어 보낸다", () => {
    expect(source).toContain("read.people");
  });

  it("못 읽은 것을 사람에게 알린다", () => {
    // 조용히 넘어가면 왜 인물 묘사가 부실한지 아무도 모른다.
    expect(source).toMatch(/grammarIssues: \[[\s\S]{0,80}read\.issues/);
    expect(source).toMatch(/issues: \[[\s\S]{0,80}read\.issues/);
  });
});
