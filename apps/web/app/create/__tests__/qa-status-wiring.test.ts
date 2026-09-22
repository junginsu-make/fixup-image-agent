import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **「검수를 못 돌렸다」가 사용자에게 닿는가.**
 *
 * 코어가 상태를 돌려줘도 화면이 안 쓰면 아무 일도 안 일어난다. 그 줄들은
 * 지워도 코어 시험이 전부 통과한다.
 */
const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

describe("검수 상태 배선", () => {
  it("**단건·일괄 두 경로 모두 상태를 싣는다**", () => {
    expect([...editor.matchAll(/qaStatus: (response|outcome)\.qa\?\.status/g)]).toHaveLength(2);
  });

  it("**못 돌렸을 때 화면에 알린다** — 「이상 없음」과 구별한다", () => {
    expect(editor).toContain('currentSection.qaStatus === "unavailable"');
    expect(editor).toContain("검수 못 함");
  });

  it("경고 뱃지는 그대로 둔다 — 두 가지를 한 뱃지로 합치지 않는다", () => {
    expect(editor).toContain("currentSection.qaWarnings && currentSection.qaWarnings.length > 0");
  });
});
