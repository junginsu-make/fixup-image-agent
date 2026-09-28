import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **색인 스크립트가 실제로 돌아야 한다**(2026-09-28 배포 중 드러났다).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 처음 배포하고 `pnpm index:guide` 를 돌렸더니 두 번 연속 터졌다.
 *
 *   ① `ERR_MODULE_NOT_FOUND: @fixup/redesign-core`
 *   ② `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'`
 *
 * **`--dry` 로만 확인했기 때문이다.** 맛보기는 넣기 직전에 돌아가므로, 넣는
 * 쪽의 import 를 한 번도 지나지 않았다. 설명서를 못 넣으면 봇은 아무 근거도
 * 못 찾고 모든 물음에 「알지 못합니다」를 한다.
 *
 * 스크립트를 돌려 보는 시험은 여기서 못 만든다(운영 DB 와 OpenAI 가 필요하다).
 * 대신 **두 번 터진 그 두 가지를 글에서 막는다.**
 */

const root = join(__dirname, "..", "..", "..", "..", "..");
const script = readFileSync(join(root, "scripts", "index-guide.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** 넣는 쪽을 부르는 그 자리. 주석에 적힌 글자에 속지 않으려면 여기만 본다. */
const 부르는자리 = (() => {
  const 시작 = script.indexOf("indexKnowledgeDocument, isRagConfigured");
  return script.slice(시작, script.indexOf(";", 시작));
})();

describe("설명서 색인 스크립트", () => {
  /**
   * 저장소 뿌리의 `node_modules` 에는 `@fixup/*` 가 링크되지 않는다 — 작업
   * 패키지들이 쓰는 쪽에만 링크된다.
   */
  it("작업 패키지를 이름으로 부르지 않는다", () => {
    // 따옴표 안의 이름만 본다. 주석에 이름을 적는 것은 괜찮다.
    expect(script, "뿌리에서는 이 이름이 안 풀린다").not.toContain('"@fixup/');
    expect(script, "뿌리에서는 이 이름이 안 풀린다").not.toContain("'@fixup/");
  });

  /** 윈도에서 절대경로를 그대로 주면 `c:` 를 스킴으로 읽는다. */
  it("절대경로를 URL 로 바꿔서 부른다", () => {
    expect(부르는자리, "절대경로를 그대로 주고 있다").toContain("pathToFileURL");
  });

  /**
   * 그쪽 입구는 TypeScript 다(`packages/redesign-core/package.json` 의
   * `main: src/index.ts`). 맨 `node` 로는 못 읽는다.
   */
  it("TypeScript 를 읽을 수 있는 것으로 돈다", () => {
    expect(pkg.scripts["index:guide"]).toContain("tsx");
    expect(pkg.scripts["index:guide"]).not.toMatch(/^node\s/);
  });

  /** 넣기 전에 함수 이름이 지식이 되는 것을 막는 검사. 없애지 않는다. */
  it("소스를 긁은 글을 넣지 않는다", () => {
    /*
      **정규식 안의 모양으로 본다.** 이 파일의 머리 주석도 `creditUnits(` 를
      적고 있어서, 그냥 찾으면 검사를 지워도 초록이다.
    */
    expect(script, "함수 이름 검사가 없어졌다").toContain(String.raw`creditUnits\(`);
    expect(script).toContain("넣지 않습니다");
  });
});
