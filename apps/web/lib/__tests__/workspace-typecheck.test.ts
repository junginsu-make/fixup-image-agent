import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * **`typecheck` 스크립트가 있으면 `typescript` 도 있어야 한다.**
 *
 * `@fixup/sns-core` 는 스크립트만 있고 의존성 선언이 없었다. `.npmrc` 가
 * `shamefully-hoist=false` 이고 루트에도 typescript 가 없어 `tsc` 가 해석되지
 * 않았고, `pnpm -r typecheck` 가 거기서 죽었다. CI 의 마지막 단계와 릴리스의
 * verify 잡이 매번 실패했으며, 그 패키지는 타입 검사를 한 번도 못 받았다.
 */
const packagesDir = path.join(
  fileURLToPath(new URL("../../../../", import.meta.url)),
  "packages",
);

describe("워크스페이스 패키지", () => {
  it("타입 검사를 돌리는 패키지는 컴파일러를 선언한다", () => {
    const missing: string[] = [];
    for (const name of readdirSync(packagesDir)) {
      const manifestPath = path.join(packagesDir, name, "package.json");
      let manifest: { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue;
      }
      if (!manifest.scripts?.typecheck) continue;
      const declared = { ...manifest.dependencies, ...manifest.devDependencies };
      if (!declared.typescript) missing.push(name);
    }
    expect(missing, "typecheck 스크립트만 있고 typescript 선언이 없다").toEqual([]);
  });
});
