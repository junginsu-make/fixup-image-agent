import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 화면 코드의 문장을 직접 본다 — 클로저가 낡는 자리를 지키는 시험. */
const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");

function body(start: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const end = source.indexOf("\n  };", from);
  return source.slice(from, end);
}

describe("내 캐릭터 연결", () => {
  it("처음부터는 날것으로 내 캐릭터를 비운다(그림체를 레퍼런스 스타일에 남기지 않는다)", () => {
    const startOver = body("const startOver = () => {");
    expect(startOver).toContain("setOwnRaw(null)");
    expect(startOver).not.toContain("setOwn(null)");
  });

  it("보낼 때 역할을 한 번 더 맞춘다", () => {
    expect(body("const handleCandidates = async () => {")).toContain("roleWithOwn(attached.role, Boolean(own))");
  });
});
