/**
 * 사용 설명서를 CS 응답 AI 의 지식으로 넣는다.
 *
 *   node scripts/index-guide.mjs --base https://example.com --dry
 *   node scripts/index-guide.mjs --base https://example.com
 *
 * 실제로 넣을 때는 `--base` 를 꼭 주고, 로컬 주소(localhost · 127.0.0.1)는
 * 받지 않는다. 맛보기(`--dry`)는 주소 없이 돌면 로컬을 긁는다.
 *
 * ── 왜 서버에서 받아 오나 ────────────────────────────────────────────
 *
 * **설명서의 숫자가 소스에 없다.** `guide/credits/page.tsx` 는 손으로 적은
 * 숫자가 틀려 있던 사고(2026-09-21) 뒤로 **쓰는 그 함수로 그 자리에서
 * 셈한다.** 소스를 긁으면 봇은 「5장」이 아니라 `creditUnits(...)` 를 읽고
 * 그것을 사용자에게 옮긴다.
 *
 * 그래서 **그려진 쪽**을 받아 온다. 설명서는 로그인 없이 열리므로
 * (미들웨어 `PUBLIC_PATHS`) 손님으로 받아 오면 되고, 그 글이 정본이다 —
 * 회원에게만 보이는 잔액 같은 것이 지식에 섞이지 않는다.
 *
 * ── 언제 돌리나 ──────────────────────────────────────────────────────
 *
 * 설명서를 고친 뒤, 그리고 값이 바뀐 뒤(모델 단가·플랜). **배포 뒤에
 * 돌린다** — 배포 전에 돌리면 옛 화면을 긁는다.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function 인자(name, fallback = "") {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const 자리 = process.argv.indexOf(`--${name}`);
  return 자리 >= 0 ? (process.argv[자리 + 1] ?? fallback) : fallback;
}

const base = (인자("base", "http://127.0.0.1:3000")).replace(/\/$/, "");
const 맛보기 = process.argv.includes("--dry");

/**
 * **실제로 넣을 때는 주소를 꼭 받고, 로컬 주소는 받지 않는다**(2026-10-07 보안 리뷰).
 *
 * 넣기는 운영 DB 의 옛 판을 지운다(`옛판지우기`). `--base` 를 빼먹으면
 * 기본값(로컬)을 긁어 로컬 화면의 글을 운영에 넣고 운영의 옛 판을 지운다.
 * 그래서 DB 에 붙기 전에 멈춘다. 맛보기는 아무것도 안 바꾸므로 그대로다.
 *
 * `[::1]` · `0.0.0.0` 같은 꼴도 이 컴퓨터다(후속 Task 11 (e)). `new URL()` 이 `0` · `127.1` ·
 * `[0:0:0:0:0:0:0:1]` 같은 꼴을 미리 맞춰 주므로, 맞춘 이름으로 본다.
 */
const 로컬주소들 = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "[::]"];

function 로컬주소인가(hostname) {
  const 이름 = hostname.replace(/\.$/, "");
  return 로컬주소들.includes(이름)
    || 이름.endsWith(".localhost")
    || /^127\.\d+\.\d+\.\d+$/.test(이름)
    || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(이름);
}

function 넣을주소인가() {
  const 받음 = process.argv.some((arg) => arg === "--base" || arg.startsWith("--base="));
  if (!받음) return false;
  try {
    return !로컬주소인가(new URL(base).hostname);
  } catch {
    return false;
  }
}

if (!맛보기 && !넣을주소인가()) {
  console.error("실제로 넣을 때는 --base 로 운영 주소를 주세요. 로컬 주소는 받지 않습니다. 먼저 --dry 로 확인하세요.");
  process.exit(1);
}

/**
 * 어느 쪽을 넣나.
 *
 * **목차(`topics.ts`)를 그대로 따르지 않는다.** 그쪽은 화면에서 꺼진 항목을
 * 빼는데(`isDisabledRoute`), 지식은 꺼진 기능도 알고 있어야 한다 — 「팀
 * 기능이 왜 안 보이나요」에 답하려면 그 글이 있어야 한다.
 *
 * **그래서 목록이 둘이 되고, 둘은 어긋난다.** 2026-09-28 에 실제로 어긋났다 —
 * 설명서 둘을 새로 써서 배포했는데 이 목록에 안 넣어서 **봇은 그 글을 못
 * 봤다.** 화면에는 있고 봇만 모르는 상태라 알아채기도 어렵다.
 *
 * 시험이 본다(`apps/web/app/guide/__tests__/index-coverage.test.ts`) —
 * `app/guide` 아래 쪽이 여기 다 있는지.
 */
const 쪽들 = [
  { href: "/guide", label: "처음 오셨다면" },
  { href: "/guide/easy", label: "쉽게" },
  { href: "/guide/image", label: "다양하게" },
  { href: "/guide/cardnews", label: "카드뉴스" },
  { href: "/guide/detail-page", label: "상세페이지" },
  { href: "/guide/redesign", label: "리디자인" },
  { href: "/guide/character", label: "캐릭터" },
  { href: "/guide/ad", label: "광고 소재" },
  { href: "/guide/library", label: "라이브러리" },
  { href: "/guide/credits", label: "크레딧과 모델" },
  { href: "/guide/team", label: "팀" },
  { href: "/guide/account", label: "계정과 플랜" },
  { href: "/guide/trouble", label: "막혔을 때" },
];

/** 글 다듬기는 앱과 같은 함수를 쓴다. 두 벌로 적으면 한쪽만 고치는 날이 온다. */
async function 다듬개() {
  const result = await build({
    entryPoints: [path.join(root, "apps/web/lib/cs/guide-text.ts")],
    bundle: true, write: false, format: "iife", globalName: "GuideText",
    platform: "neutral", target: "es2022",
  });
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(result.outputFiles[0].text, sandbox);
  return sandbox.GuideText;
}

/**
 * 색인 DB 에 붙는다. `rag.ts` 의 `getSql` 과 같은 드라이버다.
 *
 * 뿌리 `node_modules` 에는 이 드라이버가 없다(작업 패키지 쪽에만 깔린다).
 * 그래서 redesign-core 자리에서 찾는다. `DATABASE_URL` 이 없으면 `null`.
 */
function 색인DB() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  const require = createRequire(path.join(root, "packages/redesign-core/package.json"));
  const { neon } = require("@neondatabase/serverless");
  try {
    return neon(databaseUrl);
  } catch {
    // 드라이버는 틀린 접속 문자열을 오류 글에 통째로(비밀번호 포함) 싣는다. 값 없이 고정 글만 찍는다.
    console.error("DATABASE_URL 이 올바른 접속 주소가 아닙니다. 값은 찍지 않습니다.");
    process.exit(1);
  }
}

/**
 * **같은 설명서의 옛 판을 지운다**(2026-10-07, 사용자 승인).
 *
 * `indexKnowledgeDocument` 는 이름+본문의 해시로 문서를 가른다. 글이 바뀌면
 * 새 판을 더하고 옛 판은 남는다 — 2026-10-06 운영에 13쪽이 39벌 쌓였고,
 * 화면에서 사라진 문장을 도우미가 근거로 쓸 수 있었다.
 *
 * 지우는 것은 **설명서 종류 · 같은 이름 · 방금 넣은 판이 아닌 것**뿐이다.
 * 관리자가 올린 다른 지식은 종류가 달라 안 걸린다. 조각은 `ON DELETE CASCADE`
 * 로 함께 지워진다. 지우다 실패해도 새 판은 이미 들어갔고, 옛 판은 다음에
 * 돌릴 때 같은 조건으로 다시 지운다 — 그래서 멈추지 않고 알리기만 한다.
 */
async function 옛판지우기(sql, name, documentId) {
  if (!documentId) return 0;
  try {
    const rows = await sql`
      DELETE FROM knowledge_documents
      WHERE kind = 'guide' AND name = ${name} AND id <> ${documentId}
      RETURNING id
    `;
    return rows.length;
  } catch {
    // 오류 글을 그대로 찍지 않는다. 접속 정보가 섞일 수 있다.
    console.error(`  옛 판을 못 지웠습니다 ${name} — 다음에 돌릴 때 다시 지웁니다`);
    return 0;
  }
}

/**
 * 맛보기에서 **지울 옛 판이 몇 개인지만** 센다. 읽기만 한다.
 *
 * 해시는 `rag.ts` 의 `sha256(이름:본문)` 과 같은 꼴이다 — 같은 글이면
 * 넣을 때 그 행을 그대로 쓰므로(지우지 않으므로) 셈에서 뺀다. 화면에 찍는
 * 수일 뿐이고, 실제로 지우는 조건은 `옛판지우기` 의 새 판 id 다.
 *
 * `DATABASE_URL` 이 없으면 세지 않는다 — 맛보기는 DB 없이도 돌아야 한다.
 */
async function 지울옛판수(문서들) {
  if (!process.env.DATABASE_URL) return;
  try {
    const sql = 색인DB();
    let 합 = 0;
    for (const 문서 of 문서들) {
      const 해시 = createHash("sha256").update(`${문서.name}:${문서.text}`).digest("hex");
      const rows = await sql`
        SELECT count(*)::int AS n FROM knowledge_documents
        WHERE kind = 'guide' AND name = ${문서.name} AND content_hash <> ${해시}
      `;
      합 += rows[0].n;
    }
    console.log(`지울 옛 판 ${합}개`);
  } catch {
    console.error("옛 판 수를 못 셌습니다. 맛보기라 아무것도 바꾸지 않았습니다.");
  }
}

/**
 * 맛보기에서 **지금 목록(`쪽들`)에 없는 옛 설명서**의 이름을 찍는다(2026-10-07 후속 Task 11 (c)). 읽기만 한다.
 *
 * `옛판지우기` 는 같은 이름의 옛 판만 지운다. 쪽을 목록에서 빼거나 이름을 바꾸면 그 이름의 판은 계속
 * 남는다. 여기서도 지우지 않는다. 무엇이 남았는지 보여 주고, 지울지는 사람이 정한다.
 *
 * 받아 온 문서가 아니라 `쪽들` 로 가른다. 한 쪽을 못 받아 왔다고 그 쪽이 옛 것은 아니다.
 * 이름 꼴은 `guide-text.ts` 의 `guideDocumentFrom` 과 같다(시험이 그 함수로 맞춰 본다).
 */
async function 목록밖옛설명서() {
  if (!process.env.DATABASE_URL) return;
  const 지금이름들 = new Set(쪽들.map((쪽) => `이용 안내 · ${쪽.label}`));
  try {
    const sql = 색인DB();
    const rows = await sql`
      SELECT DISTINCT name FROM knowledge_documents
      WHERE kind = 'guide'
      ORDER BY name
    `;
    const 옛것 = rows.map((row) => row.name).filter((name) => !지금이름들.has(name));
    console.log(`목록에 없는 옛 설명서 ${옛것.length}개${옛것.length ? `: ${옛것.join(", ")}` : ""}`);
  } catch {
    console.error("목록에 없는 옛 설명서를 못 찾았습니다. 맛보기라 아무것도 바꾸지 않았습니다.");
  }
}

async function main() {
  const { guideDocumentFrom } = await 다듬개();

  const 문서들 = [];
  for (const 쪽 of 쪽들) {
    const url = `${base}${쪽.href}`;
    let html;
    try {
      const response = await fetch(url, { headers: { "user-agent": "fixup-guide-indexer" } });
      if (!response.ok) { console.error(`  건너뜀 ${쪽.href} — HTTP ${response.status}`); continue; }
      html = await response.text();
    } catch (error) {
      console.error(`  건너뜀 ${쪽.href} — ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const 문서 = guideDocumentFrom({ href: 쪽.href, label: 쪽.label, html });
    if (!문서) { console.error(`  건너뜀 ${쪽.href} — 본문을 못 찾았습니다`); continue; }
    문서들.push(문서);
    /*
      **얇은 쪽을 눈에 띄게 한다.**

      2026-09-23 실측: 열한 쪽 중 열은 1,500~6,400자인데 `/guide/credits` 만
      270자였다. 결함이 아니라 **그 쪽이 실제로 짧다** — 크레딧 장부를 켠 뒤
      짧은 판을 쓴다. 봇은 문서에 있는 것만 답하므로, 얇은 쪽은 곧 **답 못 하는
      물음**이다. 지나가며 알려 준다.
    */
    const 얇음 = 문서.text.length < 600 ? "  ← 얇습니다. 이 주제는 봇이 잘 못 답합니다" : "";
    console.log(`  읽음 ${쪽.href} — ${문서.text.length}자${얇음}`);
  }

  if (문서들.length === 0) {
    console.error("넣을 것이 없습니다. 서버가 떠 있는지, 주소가 맞는지 확인하세요.");
    process.exit(1);
  }

  /*
    **숫자가 실제로 들어왔는지 본다.** 소스를 긁는 실수로 돌아가면 함수
    이름이 지식이 된다. 넣기 전에 잡는다.
  */
  const 수상한것 = 문서들.filter((doc) => /creditUnits\(|unitPrice\(|\$\{/.test(doc.text));
  if (수상한것.length) {
    console.error(`\n함수 이름이 글에 들어 있습니다: ${수상한것.map((d) => d.href).join(", ")}`);
    console.error("그려진 쪽이 아니라 소스를 읽은 것 같습니다. 넣지 않습니다.");
    process.exit(1);
  }

  if (맛보기) {
    console.log(`\n맛보기입니다. ${문서들.length}쪽을 넣지 않았습니다.`);
    console.log(문서들.map((d) => `  ${d.name} (${d.text.length}자)`).join("\n"));
    await 지울옛판수(문서들);
    await 목록밖옛설명서();
    return;
  }

  /*
    **가리키는 이름이 아니라 길로 부른다.** 이 파일은 저장소 뿌리에 있고
    뿌리의 `node_modules` 에는 `@fixup/*` 가 링크되지 않는다(작업 패키지들이
    쓰는 쪽에만 링크된다). 이름으로 부르면 `ERR_MODULE_NOT_FOUND` 다.

    그리고 그쪽 입구는 **TypeScript** 라(`main: src/index.ts`) 맨 `node` 로는
    못 읽는다. 그래서 `tsx` 로 돈다(`pnpm index:guide`).
  */
  const { indexKnowledgeDocument, isRagConfigured } = await import(
    // 윈도에서는 절대경로를 그대로 주면 `c:` 를 스킴으로 읽는다. URL 로 준다.
    pathToFileURL(path.join(root, "packages/redesign-core/src/index.ts")).href
  );
  if (!isRagConfigured()) {
    console.error("DATABASE_URL 과 OPENAI_API_KEY 가 있어야 합니다.");
    process.exit(1);
  }

  const sql = 색인DB();
  let 조각 = 0;
  let 지운판 = 0;
  // 운영 앱 밖에서 돌므로 ai_cost_events 에는 안 적힌다(설계 2026-09-30 §3.4). 대신 여기서 센다.
  let 임베딩토큰 = 0;
  const onUsage = (usage) => { 임베딩토큰 += usage.inputTokens; };
  for (const 문서 of 문서들) {
    const result = await indexKnowledgeDocument({ name: 문서.name, text: 문서.text, kind: "guide", onUsage });
    if (!result.indexed) { console.error(`  못 넣음 ${문서.name} — ${result.reason}`); continue; }
    조각 += result.chunks;
    // 새 판이 들어간 뒤에만 지운다. 못 넣었으면 옛 판이라도 있어야 도우미가 답한다.
    const 지움 = await 옛판지우기(sql, 문서.name, result.documentId);
    지운판 += 지움;
    console.log(`  넣음 ${문서.name} — 조각 ${result.chunks}개 · 옛 판 ${지움}개 지움`);
  }

  console.log(`\n설명서 ${문서들.length}쪽 · 조각 ${조각}개를 넣었습니다. 옛 판 ${지운판}개를 지웠습니다. 임베딩 토큰 ${임베딩토큰}개.`);
}

await main();
