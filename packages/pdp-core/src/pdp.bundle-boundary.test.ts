import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **서버 프롬프트가 브라우저로 내려갔다**(D-4).
 *
 * 화면 컴포넌트 열다섯이 이 패키지의 배럴(`index.ts`)을 들인다. 대부분 상수
 * 하나를 쓰려고 들이는데, 번들러가 나머지를 못 지워서 **프롬프트 전문이 같이
 * 실려 나갔다.**
 *
 * 실측(2026-09-20, `NEXT_DIST_DIR=.next-d4 next build`, 브라우저 청크만 검사):
 *
 * | 표식 | 고치기 전 | 고친 뒤 |
 * |---|---|---|
 * | `never change the product…` | 청크 1개 | 0 |
 * | `USER INSTRUCTION for composition` | 1 | 0 |
 * | `design_system` | 1 | 0 |
 * | `Overall tone:` | 1 | 0 |
 *
 * 프롬프트는 우리가 무엇을 어떻게 시키는지가 적힌 글이다. 브라우저로
 * 내려보낼 이유가 없다.
 *
 * ── 왜 안 지워졌나 ───────────────────────────────────────────
 *
 * 둘이다. 배럴 안에 **불러오는 순간 실행되는 줄**(`new PdpController()`)이
 * 있었고, 패키지가 **부작용이 없다고 말하지 않았다**(`sideEffects`).
 * 둘 중 하나만 있어도 번들러는 「이 모듈은 남겨야 한다」고 판단한다.
 *
 * ── 이 시험이 재는 것 ────────────────────────────────────────
 *
 * 번들을 직접 재려면 운영 빌드가 필요해 시험에서 돌릴 수 없다. 대신 **원인**을
 * 잠근다 — 그 둘이 되살아나면 여기가 빨개진다. 실제 번들 측정은 위 표가
 * 근거이고, 다시 재는 법은 `docs/bugs/pdp-validation/progress.md` 에 적었다.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const barrel = readFileSync(path.join(here, "index.ts"), "utf8");

describe("배럴을 들인다고 프롬프트까지 딸려오면 안 된다", () => {
  it("**패키지가 부작용 없음을 밝힌다**", () => {
    const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8"));

    expect(pkg.sideEffects).toBe(false);
  });

  /**
   * **최상위에서 무언가를 만들면 그것이 곧 부작용이다.**
   *
   * `const controller = new PdpController()` 한 줄이 서비스와 프롬프트 전체를
   * 붙잡고 있었다.
   */
  it("**불러오는 순간 실행되는 줄이 없다**", () => {
    const 실행하는줄 = barrel
      .split("\n")
      .map((line, index) => ({ line: line.trim(), at: index + 1 }))
      .filter(({ line }) => /^(const|let|var)\s+\w+\s*(:[^=]+)?=\s*(new\s|\w+\()/.test(line))
      // 함수로 감싼 것은 부를 때 돈다. `() =>` 가 그 표시다.
      .filter(({ line }) => !line.includes("=>"));

    expect(실행하는줄, `배럴 최상위에서 실행하는 줄: ${JSON.stringify(실행하는줄)}`).toHaveLength(0);
  });
});

/**
 * **아무도 안 들이는 모듈은 시험만 지킨다**(D-10).
 *
 * 설계 §14.4(D-10): 「죽은 조립기 및 **그쪽만 검사하는 시험** | 실제 호출 그래프
 * 확인 후 제거/활성 경로 시험으로 교체」.
 *
 * 호출 그래프를 훑어 확인한 결과, 운영 경로에서 아무도 안 들이는 모듈은
 * **하나뿐**이다 — `pdp.identity-check`. 그것은 사용자 결정으로 **일부러 남겨
 * 둔 것**(U-02)이라 지우지 않는다.
 *
 * 그래서 이 시험은 **새로 생기는 것**을 막는다. 목록에 없는 모듈이 고아가 되면
 * 여기가 빨개지고, 그때 지울지 이을지 사람이 정한다.
 */
describe("고아 모듈이 늘지 않는다", () => {
  /** 일부러 남겨 둔 것. 늘릴 때는 왜 남기는지 여기 적는다. */
  const 허용 = new Set([
    // U-02. 정체성 검사를 화면에 잇는 일이 미뤄져 있다. 이을 때 배선한다.
    "pdp.identity-check",
  ]);

  it("**운영 경로가 안 들이는 모듈은 허용 목록뿐이다**", () => {
    const files = readdirSync(here)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => !name.endsWith(".test.ts"))
      .filter((name) => name !== "index.ts" && name !== "types.ts");

    const 본문 = files.map((name) => ({ name, text: readFileSync(path.join(here, name), "utf8") }));

    const 고아 = files
      .map((name) => name.replace(/\.ts$/, ""))
      .filter((module) => {
        const 들이는곳 = 본문.filter(
          (file) => file.name !== `${module}.ts` && file.text.includes(`from "./${module}"`),
        );
        return 들이는곳.length === 0 && !barrel.includes(`from "./${module}"`);
      });

    expect(고아.filter((module) => !허용.has(module))).toEqual([]);
  });

  it("**허용 목록이 실제로 고아인 것만 담는다** — 이어 놓고 목록에 남기면 거짓말이다", () => {
    for (const module of 허용) {
      const 들이는곳 = readdirSync(here)
        .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
        .filter((name) => readFileSync(path.join(here, name), "utf8").includes(`from "./${module}"`));

      expect(들이는곳, `${module} 은 이미 이어져 있다. 허용 목록에서 빼라`).toEqual([]);
    }
  });
});
