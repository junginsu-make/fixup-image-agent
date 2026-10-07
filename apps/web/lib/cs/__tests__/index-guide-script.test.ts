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

/**
 * **같은 설명서의 옛 판을 스스로 지운다**(2026-10-07, 사용자 승인).
 *
 * `indexKnowledgeDocument` 는 이름+본문의 해시로 문서를 가른다. 설명서 글이
 * 바뀌면 새 판을 더하고 옛 판은 남긴다 — 2026-10-06 운영에 13쪽이 39벌
 * 쌓여 있었고, 지금 화면에 없는 문장을 도우미가 근거로 쓸 수 있었다.
 *
 * 운영 DB 의 행을 지우는 일이라 **무엇을 지우는지**를 글에서 못 박는다.
 */
describe("설명서 색인 스크립트 — 옛 판 지우기", () => {
  /** 작업 폴더의 줄바꿈(CRLF)에 흔들리지 않게 LF 로 맞춰 본다. */
  const 글 = script.replace(/\r\n/g, "\n");

  /** 넣는 줄부터 그 문서 차례가 끝나는 곳까지. 주석의 글자에 속지 않게 여기만 본다. */
  const 넣는차례 = (() => {
    const 시작 = 글.indexOf("await indexKnowledgeDocument(");
    return 글.slice(시작, 글.indexOf("\n  }\n", 시작));
  })();

  /** 지우는 함수 몸통. */
  const 지우는함수 = (() => {
    const 시작 = 글.indexOf("async function 옛판지우기(");
    return 시작 < 0 ? "" : 글.slice(시작, 글.indexOf("\n}\n", 시작));
  })();

  it("지우는 SQL 은 한 곳뿐이다", () => {
    expect(글.split("DELETE FROM").length - 1, "지우는 자리가 하나가 아니다").toBe(1);
    expect(지우는함수, "지우는 SQL 이 지우는 함수 밖에 있다").toContain("DELETE FROM knowledge_documents");
  });

  /** 관리자가 올린 다른 지식, 다른 설명서, 방금 넣은 새 판은 건드리지 않는다. */
  it("설명서 종류 · 같은 이름 · 새 판 아닌 것만 지운다", () => {
    const 조건 = 지우는함수.slice(지우는함수.indexOf("WHERE"), 지우는함수.indexOf("RETURNING"));
    expect(조건).toContain("kind = 'guide'");
    expect(조건).toContain("name = ${name}");
    expect(조건).toContain("id <> ${documentId}");
    expect(조건, "또는(OR)이 섞이면 조건이 풀린다").not.toMatch(/\bOR\b/i);
    expect(지우는함수).toContain("RETURNING id");
    expect(지우는함수, "새 판 id 가 없으면 지우지 않는다").toMatch(/if \(!documentId\) return 0;/);
  });

  /** 못 넣은 문서의 옛 판은 남아야 도우미가 그 주제에 답한다. */
  it("넣기에 성공한 뒤에만, 그 문서 이름과 새 판 id 로 지운다", () => {
    const 실패갈래 = 넣는차례.indexOf("if (!result.indexed)");
    const 부름 = 넣는차례.indexOf("옛판지우기(");
    expect(실패갈래, "넣기 실패 갈래가 없다").toBeGreaterThan(0);
    expect(부름, "넣은 뒤에 옛 판을 지우지 않는다").toBeGreaterThan(실패갈래);
    expect(넣는차례.slice(실패갈래, 넣는차례.indexOf("\n", 실패갈래)), "실패하면 다음 문서로 넘어가야 한다").toContain("continue;");
    expect(넣는차례.slice(부름)).toMatch(/^옛판지우기\(sql, 문서\.name, result\.documentId\)/);
    expect(글.split("옛판지우기(").length - 1, "정의 하나 · 부름 하나여야 한다").toBe(2);
  });

  it("맛보기는 아무것도 지우지 않는다", () => {
    const 시작 = 글.indexOf("if (맛보기) {");
    const 맛보기갈래 = 글.slice(시작, 글.indexOf("return;", 시작));
    expect(맛보기갈래).not.toContain("DELETE");
    expect(맛보기갈래).not.toContain("옛판지우기");
    const 세기 = 글.slice(글.indexOf("async function 지울옛판수("));
    const 세기몸통 = 세기.slice(0, 세기.indexOf("\n}\n"));
    expect(세기몸통, "옛 판 세기가 없다").toContain("SELECT count(*)");
    expect(세기몸통).not.toContain("DELETE");
  });

  /** 앱과 같은 드라이버로 붙는다. 다른 드라이버면 같은 DB 라는 보장이 흐려진다. */
  it("redesign-core 와 같은 DB 드라이버를 쓴다", () => {
    const rag = readFileSync(join(root, "packages", "redesign-core", "src", "rag.ts"), "utf8");
    expect(rag).toContain('from "@neondatabase/serverless"');
    expect(글).toContain('require("@neondatabase/serverless")');
  });

  it("접속 문자열을 찍지 않는다", () => {
    expect(글).not.toMatch(/\$\{\s*(process\.env|databaseUrl)/);
  });

  /** 이름이 겹치면 뒤 문서가 앞 문서의 새 판을 옛 판으로 알고 지운다. */
  it("쪽 이름이 겹치지 않는다", () => {
    const 이름들 = [...글.matchAll(/\{ href: "[^"]+", label: "([^"]+)" \}/g)].map((m) => m[1]);
    expect(이름들.length).toBeGreaterThan(10);
    expect(new Set(이름들).size, "같은 이름의 쪽이 있다").toBe(이름들.length);
  });
});
