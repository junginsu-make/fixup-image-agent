import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { guideDocumentFrom } from "../guide-text";

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

/**
 * **실제로 넣을 때는 주소를 꼭 받고, 로컬 주소는 받지 않는다**(2026-10-07 후속 최종 수정 2, 보안 리뷰).
 *
 * 넣기는 운영 DB 의 옛 판을 지운다. `--base` 를 빼먹으면 기본값(로컬)을 긁어 로컬 화면의 글을 운영에 넣고
 * 운영의 옛 판을 지운다. 그래서 DB 에 붙기 전에, 고정 글 하나를 찍고 1 로 끝난다. 맛보기는 그대로다.
 */
describe("설명서 색인 스크립트 — 넣을 주소 지키기", () => {
  const 글 = script.replace(/\r\n/g, "\n");
  const 지킴시작 = 글.indexOf("if (!맛보기 && !넣을주소인가()) {");
  const 지킴 = 지킴시작 < 0 ? "" : 글.slice(지킴시작, 글.indexOf("\n}\n", 지킴시작));
  const 판정 = (() => {
    const 시작 = 글.indexOf("function 넣을주소인가(");
    return 시작 < 0 ? "" : 글.slice(시작, 글.indexOf("\n}\n", 시작));
  })();

  it("맛보기가 아니면 넣을 주소인지 보고, 아니면 고정 글을 찍고 1 로 끝난다", () => {
    expect(지킴시작, "넣을 주소 지킴이 없다").toBeGreaterThan(0);
    expect(지킴).toContain('console.error("실제로 넣을 때는 --base 로 운영 주소를 주세요.');
    expect(지킴, "주소 값을 찍으면 안 된다").not.toMatch(/\$\{/);
    expect(지킴).toContain("process.exit(1);");
  });

  it("DB 에 붙거나 설명서를 긁기 전, 맨 위에서 멈춘다", () => {
    expect(지킴시작, "넣을 주소 지킴이 없다").toBeGreaterThan(0);
    expect(지킴시작).toBeLessThan(글.indexOf("async function main()"));
    expect(지킴시작).toBeLessThan(글.indexOf("색인DB()"));
    expect(지킴시작).toBeLessThan(글.indexOf("await main();"));
  });

  it("--base 를 직접 받아야 하고, 로컬 주소는 받지 않는다", () => {
    expect(판정, "--base 를 받았는지 안 본다").toContain('arg === "--base" || arg.startsWith("--base=")');
    expect(판정).toContain("!로컬주소인가(new URL(base).hostname)");
    expect(판정, "주소를 못 읽으면 넣지 않는다").toMatch(/catch \{\n\s+return false;/);
  });

  /**
   * 후속 Task 11 (e). `[::1]` · `0.0.0.0` 도 이 컴퓨터다. 판정 함수를 글에서 꺼내 실제로 돌려 본다.
   * `new URL()` 이 `0` · `127.1` · `[0:0:0:0:0:0:0:1]` 같은 꼴을 미리 맞춰 주므로 그 이름으로 본다.
   */
  describe("로컬 주소 판정 (후속 Task 11 (e))", () => {
    const 판정글 = (() => {
      const 시작 = 글.indexOf("const 로컬주소들 = [");
      const 함수 = 글.indexOf("function 로컬주소인가(");
      return 시작 < 0 || 함수 < 0 ? "" : 글.slice(시작, 글.indexOf("\n}\n", 함수) + 2);
    })();
    const 로컬주소인가 = new Function(`${판정글}\nreturn 로컬주소인가;`)() as (hostname: string) => boolean;
    const 로컬인가 = (url: string) => 로컬주소인가(new URL(url).hostname);

    it.each([
      "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://0.0.0.0:3000",
      "http://0:3000", "http://127.1", "http://127.8.9.10", "http://[0:0:0:0:0:0:0:1]/", "http://[::]/",
      "http://LOCALHOST./", "http://app.localhost/", "http://[::ffff:127.0.0.1]/",
    ])("%s 는 받지 않는다", (url) => {
      expect(로컬인가(url)).toBe(true);
    });

    it.each(["https://formwith.fix-up.kr", "https://127.example.com", "http://10.0.0.5"])("%s 는 로컬이 아니다", (url) => {
      expect(로컬인가(url)).toBe(false);
    });
  });

  it("맛보기는 --base 없이도 돈다(기본값은 그대로)", () => {
    expect(글).toContain('const base = (인자("base", "http://127.0.0.1:3000"))');
    expect(지킴).toContain("!맛보기 &&");
  });
});

/**
 * **틀린 접속 문자열을 찍지 않는다**(2026-10-07 후속 최종 수정 3, 보안 리뷰). DB 드라이버 `neon()` 은 틀린
 * `DATABASE_URL` 을 받으면 오류 글에 그 값을 통째로(비밀번호 포함) 싣는다. 값 없이 고정 글만 찍고 1 로 끝난다.
 */
describe("설명서 색인 스크립트 — 접속 문자열 가리기", () => {
  const 글 = script.replace(/\r\n/g, "\n");
  const DB함수 = (() => {
    const 시작 = 글.indexOf("function 색인DB(");
    return 시작 < 0 ? "" : 글.slice(시작, 글.indexOf("\n}\n", 시작));
  })();

  it("neon() 을 try 안에서 만들고, 실패하면 값 없는 고정 글을 찍고 1 로 끝난다", () => {
    const 시도 = DB함수.indexOf("try {");
    expect(시도, "neon() 을 감싸지 않았다").toBeGreaterThan(0);
    expect(DB함수.indexOf("return neon(databaseUrl);")).toBeGreaterThan(시도);
    const 잡기 = DB함수.slice(DB함수.indexOf("} catch {"));
    expect(잡기, "잡는 갈래가 없다").toContain('console.error("DATABASE_URL 이 올바른 접속 주소가 아닙니다.');
    expect(잡기).toContain("process.exit(1);");
    expect(잡기, "접속 문자열을 찍으면 안 된다").not.toContain("databaseUrl");
    expect(글.split("neon(").length - 1, "neon() 을 부르는 자리가 하나가 아니다").toBe(1);
  });

  /** 앱 쪽 넣기도 같은 값으로 `neon()` 을 만든다. 그보다 먼저 여기서 걸러야 그쪽 오류가 값을 찍지 않는다. */
  it("넣기 전에 먼저 접속을 만든다", () => {
    const 메인 = 글.slice(글.indexOf("async function main()"));
    expect(메인.indexOf("const sql = 색인DB();")).toBeGreaterThan(0);
    expect(메인.indexOf("const sql = 색인DB();")).toBeLessThan(메인.indexOf("await indexKnowledgeDocument("));
  });
});

/**
 * **맛보기가 목록에 없는 옛 설명서를 알려 준다**(2026-10-07 후속 Task 11 (c)). 읽기만 한다.
 *
 * `옛판지우기` 는 같은 이름의 옛 판만 지운다. 쪽을 목록에서 빼거나 이름을 바꾸면 그 이름의 판은 아무도 안
 * 지워 계속 남는다. 맛보기가 그 이름들을 찍어 사람이 보게 한다. 지우지 않는다.
 *
 * 운영 DB 없이 보려고, 찾는 함수와 목록(`쪽들`)을 글에서 꺼내 가짜 DB 로 돌린다.
 */
describe("설명서 색인 스크립트 — 목록에 없는 옛 설명서 (후속 Task 11 (c))", () => {
  const 글 = script.replace(/\r\n/g, "\n");
  const 꺼낸다 = (머리: string, 끝: string) => {
    const 시작 = 글.indexOf(머리);
    return 시작 < 0 ? "" : 글.slice(시작, 글.indexOf(끝, 시작) + 끝.length);
  };
  const 목록글 = 꺼낸다("const 쪽들 = [", "\n];");
  const 찾기글 = 꺼낸다("async function 목록밖옛설명서(", "\n}\n");

  /** 가짜 DB. 받은 SQL 글을 모으고, 정한 줄을 돌려준다(또는 던진다). */
  const 돌린다 = async (names: string[] | Error, env: Record<string, string | undefined> = { DATABASE_URL: "postgres://가짜" }) => {
    const 받은SQL: string[] = [];
    let 붙음 = 0;
    const sql = async (strings: TemplateStringsArray) => {
      받은SQL.push(strings.join("?"));
      if (names instanceof Error) throw names;
      return names.map((name) => ({ name }));
    };
    const 색인DB = () => { 붙음 += 1; return sql; };
    const 찾기 = new Function("색인DB", "process", `${목록글}\n${찾기글}\nreturn 목록밖옛설명서;`)(색인DB, { env }) as () => Promise<void>;
    const 찍음 = vi.spyOn(console, "log").mockImplementation(() => {});
    const 오류 = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await 찾기();
      return { 받은SQL, 붙음, 찍은것: 찍음.mock.calls.map((c) => c.join(" ")), 오류글: 오류.mock.calls.map((c) => c.join(" ")) };
    } finally {
      찍음.mockRestore();
      오류.mockRestore();
    }
  };

  /** 지금 목록의 이름. 앱이 문서 이름을 만드는 그 함수로 만든다(두 벌로 적으면 어긋난다). */
  const 지금이름들 = () => {
    const 쪽들 = new Function(`${목록글}\nreturn 쪽들;`)() as Array<{ href: string; label: string }>;
    const 본문 = `<main data-guide-body><p>${"설명서 본문입니다. ".repeat(10)}</p></main>`;
    return 쪽들.map((쪽) => guideDocumentFrom({ href: 쪽.href, label: 쪽.label, html: 본문 })!.name);
  };

  it("목록에 없는 이름만, 몇 개인지와 이름을 찍는다", async () => {
    const 지금 = 지금이름들();
    expect(지금).toHaveLength(13);
    const got = await 돌린다([지금[0]!, "이용 안내 · 옛 쪽", 지금[5]!, "이용 안내 · 이름 바뀐 쪽"]);
    expect(got.찍은것).toEqual(["목록에 없는 옛 설명서 2개: 이용 안내 · 옛 쪽, 이용 안내 · 이름 바뀐 쪽"]);
  });

  it("지금 목록의 13개 이름은 옛 것으로 안 친다(앱이 만드는 이름과 같다)", async () => {
    const got = await 돌린다(지금이름들());
    expect(got.찍은것).toEqual(["목록에 없는 옛 설명서 0개"]);
  });

  it("설명서 종류의 이름만 읽고, 아무것도 바꾸지 않는다", async () => {
    const got = await 돌린다([]);
    expect(got.받은SQL).toHaveLength(1);
    expect(got.받은SQL[0]).toMatch(/^\s*SELECT DISTINCT name FROM knowledge_documents/);
    expect(got.받은SQL[0]).toContain("WHERE kind = 'guide'");
    expect(got.받은SQL[0], "읽기만 해야 한다").not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP|TRUNCATE)\b/i);
    expect(got.받은SQL[0], "또는(OR)이 섞이면 조건이 풀린다").not.toMatch(/\bOR\b/i);
  });

  it("DB 가 없으면 붙지 않고 아무것도 찍지 않는다", async () => {
    const got = await 돌린다(["이용 안내 · 옛 쪽"], {});
    expect(got.붙음).toBe(0);
    expect(got.찍은것).toEqual([]);
    expect(got.오류글).toEqual([]);
  });

  it("읽다 실패해도 던지지 않고, 오류 원문 없이 고정 글만 찍는다", async () => {
    const got = await 돌린다(new Error("password=SECRET 접속 실패"));
    expect(got.찍은것).toEqual([]);
    expect(got.오류글).toHaveLength(1);
    expect(got.오류글[0]).not.toContain("SECRET");
    expect(찾기글, "오류 글에 값을 끼우면 안 된다").not.toMatch(/console\.error\([^)]*\$\{/);
  });

  it("맛보기 갈래에서만 부른다", () => {
    const 시작 = 글.indexOf("if (맛보기) {");
    const 맛보기갈래 = 글.slice(시작, 글.indexOf("return;", 시작));
    expect(맛보기갈래).toContain("await 목록밖옛설명서();");
    expect(글.split("목록밖옛설명서(").length - 1, "정의 하나 · 부름 하나여야 한다").toBe(2);
  });
});
