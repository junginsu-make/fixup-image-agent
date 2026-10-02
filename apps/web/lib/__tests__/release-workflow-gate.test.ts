import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **검사가 실패하면 릴리스가 나오지 않는다.**
 *
 * 배포하는 사람은 릴리스 자산(`release-<sha12>`)만 보고 내려받는다(docs/DEPLOY.md 「매 배포」).
 * 2026-09-23 에는 검사와 빌드가 나란히 돌아, verify 가 실패한 실행 두 건도 릴리스를 올렸다.
 * 빌드 잡이 verify 를 기다리는지를 시험으로 붙잡아 둔다 — 「속도 때문에 다시 나란히」가 조용히
 * 들어오지 못하게.
 */
const workflow = readFileSync(new URL("../../../../.github/workflows/build-ec2-release.yml", import.meta.url), "utf8");

function jobBlock(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:\\s*$`, "m"));
  expect(start, `${name} 잡이 없다`).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^  [a-z][\w-]*:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("릴리스 워크플로", () => {
  it("빌드 잡은 verify 가 통과한 뒤에만 돈다", () => {
    expect(jobBlock("build")).toMatch(/^    needs:\s*(verify|\[\s*verify\s*\])\s*$/m);
  });

  it("릴리스를 올리는 단계는 빌드 잡 안에 있다(다른 잡이 verify 없이 올리지 않는다)", () => {
    expect(jobBlock("build")).toContain("gh release create");
    expect(jobBlock("verify")).not.toContain("gh release create");
  });
});
