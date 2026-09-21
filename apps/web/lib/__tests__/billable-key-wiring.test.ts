import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **크레딧이 깎이는 주소에는 요청 식별자를 붙여야 한다.**
 *
 * 서버는 예약 전에 `x-idempotency-key` 를 요구하고, 없으면 400 「요청 식별자가
 * 올바르지 않습니다」로 막는다(`lib/membership/api.ts`). 붙이는 일은
 * `billableFetch`·`billableHeaders`·`apiJson` 이 맡는다.
 *
 * **같은 사고가 두 번 났다.**
 *
 *   2026-09-04  캐릭터 화면이 생 `fetch` 를 써서 만들기가 통째로 400
 *   2026-09-17  「내 카드뉴스 만들기」의 「칸 읽어내기」가 같은 이유로 400
 *   2026-09-21  Easy 모드의 이미지 만들기가 같은 이유로 400
 *
 * 세 번째는 **이 검사도 비켜 갔다.** Easy 의 주소는 제가 예약하지 않는다 —
 * 안에서 포스터 생성 라우트를 대신 부르며 원래 요청의 헤더를 그대로 넘긴다.
 * 밖에서 보이는 주소는 Easy 것뿐이라, 열쇠를 안 붙이면 안쪽이 400 이 된다.
 * 그래서 **대신 부르는 자리**도 목록에 넣는다.
 *
 * 둘 다 **로컬에서는 안 드러난다** — 인증 우회가 헤더 검사보다 먼저 지나간다.
 * 그래서 화면을 열어 보는 것으로는 못 잡는다.
 *
 * ── 파일이 아니라 **부르는 자리**를 본다 ───────────────────────────
 *
 * 처음에는 파일 전체에서 열쇠 글자를 찾았다. 그러면 이미 `billableFetch` 를 쓰는
 * 파일에 새 요청을 맨 `fetch` 로 더해도 안 잡힌다 — 고친 자리를 되돌려도 초록이었다
 * (2026-09-17 독립 리뷰가 실증). 그래서 주소가 나온 **그 자리 둘레**만 본다.
 *
 * 읽기만 하는 부름(GET)은 열쇠가 필요 없다. 쓰는 부름만 고른다.
 */

const web = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const files = walk(join(web, "app"));
const isRoute = (path: string) => /[\\/]api[\\/].*route\.tsx?$/.test(path);

/**
 * 예약을 요구하는 **주소**.
 *
 * **첫 인자 이름을 따지지 않는다.** `request` 만 찾았더니 16개 중 2개만 걸렸다 —
 * 아홉 곳이 `req` 를 쓰는데, 거기에 2026-09-04 사고의 그 주소(`/api/characters`)가
 * 있었다(2026-09-17 독립 리뷰).
 */
const reservingPaths = files
  .filter(isRoute)
  .filter((path) => /reserveAiUsage\(/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(path.indexOf(join("app", "api")) + 3).replace(/\\/g, "/").replace(/\/route\.tsx?$/, ""))
  // 칸이 든 주소는 화면이 문자열을 이어 붙여 부르므로 원문으로 못 짝짓는다. 그쪽은
  // 화면마다 「길목 하나만 쓴다」로 따로 잠가 두었다(`poster-client` 의
  // `billableRequest`, `sns/[id]` 의 `billableHeaders`).
  .filter((url) => !url.includes("["));

/**
 * **남의 라우트를 대신 부르는 주소.**
 *
 * 헤더를 그대로 넘겨 다른 라우트의 처리기를 부르면, 그 안쪽의 요구가 이 주소의
 * 요구가 된다. 안쪽 주소는 칸(`[id]`)이 들어 원문으로 못 짝짓는데, **밖에서
 * 부르는 주소는 짝지을 수 있다.**
 */
const relayingPaths = files
  .filter(isRoute)
  .filter((path) => {
    const source = readFileSync(path, "utf8");
    /*
      **모양이 아니라 뜻으로 찾는다.** 처음에는 `headers: request.headers` 라는
      글자를 찾았는데, 열쇠를 갈아 끼우려고 `new Headers(request.headers)` 로
      바꾸자 **고친 그 순간 검사가 이 주소를 놓쳤다**(2026-09-21).

      대신 부르는 자리의 뜻은 둘이다 — 남의 라우트 처리기를 들여오고,
      그 처리기에 넘길 요청을 손수 만든다.
    */
    return /from "[^"]*\/route"/.test(source) && /new Request\(/.test(source);
  })
  .map((path) => path.slice(path.indexOf(join("app", "api")) + 3).replace(/\\/g, "/").replace(/\/route\.tsx?$/, ""));

/** 열쇠를 붙이는 길. 어느 것이든 하나면 된다. */
const ATTACHES_KEY = /billableFetch|billableHeaders|x-idempotency-key|apiJson/;
/**
 * 쓰는 부름인가. 읽기(GET)는 열쇠가 필요 없다.
 *
 * **본문을 실으면 쓰는 것으로 본다.** `method` 를 안 적고 감싸개의 기본 POST 에
 * 기대는 자리가 있어, 메서드만 보면 그 자리를 놓친다(2026-09-17 독립 리뷰).
 */
const WRITES = /method:\s*"(POST|PUT|PATCH)"|billableFetch\s*\(|apiJson\s*[<(]|body:/;
/**
 * 크레딧과 상관없는 부름. 예약은 만드는 요청에만 붙는다.
 *
 * `DELETE` 는 본문을 싣기도 해서(캐릭터 지우기) 위 규칙에 걸리는데, 지우기는 값을
 * 안 쓴다 — 여기서 걸러 낸다.
 */
const READS = /method:\s*"(GET|DELETE|HEAD)"/;

/**
 * 주소가 나온 **그 부름 하나**만 잘라 낸다.
 *
 * 글자 수로 둘레를 자르면 두 쪽으로 다 틀린다 — 좁으면 열쇠를 못 보고(광고 내보내기가
 * 잘못 걸렸다), 넓으면 옆에 있는 다른 부름의 글자를 주워 온다(캐릭터 목록 읽기가 옆의
 * 올리기 요청 때문에 통과했다). 괄호를 세어 그 부름의 끝을 찾는다.
 */
function enclosingCall(source: string, at: number): string | null {
  const head = source.slice(Math.max(0, at - 200), at);
  /*
    부름 이름과 여는 괄호, 그 사이에 다른 괄호가 없는 자리만 이 주소의 부름이다.

    **제네릭을 허용한다.** `apiJson<Batch>("…")` 처럼 `<…>` 가 끼면 못 찾아, pdp
    다섯 주소가 조용히 검사에서 빠져 있었다(2026-09-17 독립 리뷰).
  */
  const start = head.search(/(fetch|billableFetch|apiJson)\s*(<[^()]*>)?\s*\([^()]*$/);
  if (start < 0) return null;
  const begin = Math.max(0, at - 200) + start;
  let depth = 0;
  for (let i = source.indexOf("(", begin); i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(begin, i + 1);
    }
  }
  return null;
}

/** 이 주소를 부르는 자리들. */
function callSites(source: string, needle: string): string[] {
  const sites: string[] = [];
  for (let at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
    const call = enclosingCall(source, at);
    if (call) sites.push(call);
  }
  return sites;
}

describe("크레딧이 깎이는 주소를 부르는 자리", () => {
  it("예약을 요구하는 주소를 찾았다 — 못 찾으면 아래 검사가 조용히 통과한다", () => {
    // 인자 이름을 안 따지면 열 곳이 넘는다. 둘뿐이면 정규식이 다시 좁아진 것이다.
    expect(reservingPaths.length).toBeGreaterThan(5);
  });

  /** 못 찾으면 대신 부르는 자리가 통째로 검사 밖에 남는다. */
  it("대신 부르는 주소도 찾았다", () => {
    expect(relayingPaths).toContain("/api/easy/generate");
  });

  it.each([...new Set([...reservingPaths, ...relayingPaths])])("%s 를 쓰는 부름은 식별자를 붙인다", (url) => {
    let checked = 0;
    for (const path of files.filter((entry) => !isRoute(entry))) {
      const source = readFileSync(path, "utf8");
      const where = path.slice(web.length + 1);
      /*
        `apiJson("/pdp/images", …)` 처럼 `/api` 를 떼고 부르는 자리도 있다. 두 글자
        모두로 찾는다 — 안 그러면 그 화면들이 통째로 검사에서 빠진다.
      */
      const sites = [
        ...callSites(source, `"${url}"`),
        ...callSites(source, `"${url.replace(/^\/api/, "")}"`),
      ];
      for (const site of sites) {
        if (READS.test(site) || !WRITES.test(site)) continue;
        checked += 1;
        expect(site, `${where} 가 ${url} 을 식별자 없이 부른다 — 운영에서 400 으로 막힌다`)
          .toMatch(ATTACHES_KEY);
      }
    }

    /*
      **못 찾으면 시끄럽게 실패한다.** 못 찾는 것이 곧 통과이면, 주소를 변수로 빼거나
      다른 감싸개로 바꾸는 날부터 조용히 안 보게 된다 — 제네릭 하나 때문에 pdp 다섯
      주소가 실제로 그 상태였다(2026-09-17 독립 리뷰).
    */
    expect(checked, `${url} 을 쓰는 부름을 하나도 못 찾았다 — 이 검사가 헛돈다`).toBeGreaterThan(0);
  });
});
