import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 같은 이름이 있어 서버가 「 (2)」를 붙였으면 **화면이 알린다**(2026-10-07).
 * 말없이 바뀌면 라이브러리에서 그 이름을 찾지 못한다.
 */
const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");

function body(start: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf("\n  };", from));
}

describe("이름이 바뀌었을 때", () => {
  it("저장 결과의 이름이 보낸 이름과 다르면 그 이름을 알린다", () => {
    const create = body("const handleCreate = async (withExtras: boolean) => {");
    expect(create).toContain("name?: string");
    expect(create).toMatch(/body\.name && body\.name !== requestedName/);
    expect(create).toContain("같은 이름의 캐릭터가 있어");
  });
});
