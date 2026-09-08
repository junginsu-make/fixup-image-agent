import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 기획이 **사람을 실제로 보는가** (2026-09-08 실측).
 *
 * 규칙(`readPeople`·`planReferences`)은 잠겨 있는데 **라우트가 그것을 부르는
 * 자리**는 아무도 안 본다. 안 부르면 기획은 사람을 못 본 채 예전처럼 한 줄로
 * 뭉뚱그리고, 안경이 다시 사라진다.
 */

const source = readFileSync(
  new URL("../projects/[id]/plan/route.ts", import.meta.url),
  "utf8",
);

describe("사람 읽기가 기획에 이어져 있는가", () => {
  it("사람을 읽는다", () => {
    expect(source).toContain("readPeople(");
    expect(source).toContain("createPosterPeopleReader()");
  });

  it("**지킬 사람의 사진만 읽는다** — 따라 만들 그림에는 지킬 사람이 없다", () => {
    expect(source).toContain("personIds.has(reference.id)");
    expect(source).toMatch(/readPeople\([\s\S]{0,200}preserved/);
  });

  it("읽은 것을 기획 목록에 실어 보낸다", () => {
    expect(source).toContain("crowd.people");
  });

  it("못 읽은 것을 사람에게 알린다", () => {
    // 조용히 넘어가면 왜 인물 묘사가 부실한지 아무도 모른다.
    expect(source).toMatch(/grammarIssues: \[[\s\S]{0,80}crowd\.issues/);
    expect(source).toMatch(/issues: \[[\s\S]{0,80}crowd\.issues/);
  });
});
