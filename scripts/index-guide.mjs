/**
 * 사용 설명서를 CS 응답 AI 의 지식으로 넣는다.
 *
 *   node scripts/index-guide.mjs --base http://127.0.0.1:3000
 *   node scripts/index-guide.mjs --base https://example.com --dry
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

  let 조각 = 0;
  for (const 문서 of 문서들) {
    const result = await indexKnowledgeDocument({ name: 문서.name, text: 문서.text, kind: "guide" });
    if (!result.indexed) { console.error(`  못 넣음 ${문서.name} — ${result.reason}`); continue; }
    조각 += result.chunks;
    console.log(`  넣음 ${문서.name} — 조각 ${result.chunks}개`);
  }

  console.log(`\n설명서 ${문서들.length}쪽 · 조각 ${조각}개를 넣었습니다.`);
}

await main();
