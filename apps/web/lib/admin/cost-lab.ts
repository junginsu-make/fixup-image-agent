import path from "node:path";
import type { UserRole } from "../membership/types";

/**
 * 비용 전략실 — **가격 정책을 세워 보는 시뮬레이션 도구.**
 *
 * 운영 DB·크레딧 장부·생성 경로를 건드리지 않는다. 모델별 단가를 이 저장소
 * 코드에서 읽어다 만든 계산기다.
 *
 * ── **왜 React 로 옮겨 짜지 않았나** ────────────────────────────
 * 도구가 `body`·`button`·`table` 같은 **일반 선택자로 CSS 를 건다.** 앱 안에
 * 그대로 풀면 사이드바와 다른 화면까지 함께 물든다. 그래서 문서를 따로 두고
 * 창(`iframe`) 안에서 연다 — 격리가 공짜로 따라온다.
 *
 * 대신 **겉모습은 시스템에 맞춘다.** 도구가 색과 모서리를 토큰 열 개로만
 * 쓰고 있어서(`--ink`·`--line`·`--bg` …), 그 열 개를 시스템 토큰으로 갈아
 * 끼우면 나머지 CSS 는 손대지 않아도 따라온다. 글꼴도 한 줄이다.
 */

/** 도구 문서들이 있는 자리. 라우트와 추적 설정이 같은 값을 봐야 한다. */
export const COST_LAB_DIR = "app/admin/cost-lab/assets";

/**
 * 내줄 수 있는 문서.
 *
 * **목록으로 막는다.** 주소에서 받은 이름을 경로에 그대로 붙이면
 * `../../.env` 같은 것이 들어온다. 확장자를 떼거나 `..` 를 지우는 식으로
 * 거르면 빠져나가는 모양이 늘 남는다 — 아는 이름만 연다.
 *
 * 도구 안에서 두 문서가 **상대 경로로 서로를 건다**(`href="index.html"`).
 * 그래서 주소 모양을 파일 이름 그대로 둔다 — 그러면 그 링크가 그냥 동작한다.
 */
export const COST_LAB_DOCS = ["index.html", "prepaid.html"] as const;
export type CostLabDoc = (typeof COST_LAB_DOCS)[number];

export function isCostLabDoc(name: string): name is CostLabDoc {
  return (COST_LAB_DOCS as readonly string[]).includes(name);
}

/**
 * 문서가 놓인 자리.
 *
 * 서버는 `apps/web` 에서 돈다(systemd `WorkingDirectory`). 개발 서버도 같다.
 *
 * **`next.config.mjs` 의 `outputFileTracingIncludes` 에 적어야 한다.** Next 의
 * 추적은 `import` 를 따라가는데 이 파일들은 `import` 되지 않으므로, 안 적으면
 * **로컬에서는 되고 배포본에서만 404** 가 된다.
 */
export function costLabDocPath(doc: CostLabDoc, cwd: string = process.cwd()): string {
  return path.join(cwd, COST_LAB_DIR, doc);
}

/** 글꼴 선언이 있는 자리. 창 안은 **다른 문서라 부모의 글꼴이 안 내려간다.** */
export const COST_LAB_FONT_CSS = "app/pretendard.css";

export function costLabFontPath(cwd: string = process.cwd()): string {
  return path.join(cwd, COST_LAB_FONT_CSS);
}

/**
 * 이 사람이 열 수 있나.
 *
 * **이 시스템의 등급은 `member` 와 `admin` 둘뿐이다.** 「최고관리자」라는 칸이
 * 따로 없어서, 지금 표현할 수 있는 가장 좁은 범위가 관리자다. 더 좁히려면
 * 등급을 늘리는 것이 아니라 **여기 한 곳**을 고친다.
 */
export function canOpenCostLab(viewer: { role: UserRole }): boolean {
  return viewer.role === "admin";
}

/**
 * 시스템 토큰을 **한 벌만 둔다.**
 *
 * 창 안은 다른 문서라 앱의 `--foreground` 같은 값이 안 내려간다. 그렇다고
 * 팔레트를 여기 베껴 적으면 두 벌이 되고, 디자인이 바뀌는 날 한쪽만 낡는다.
 * **`globals.css` 에서 읽어 넣는다.**
 */
export const COST_LAB_TOKEN_CSS = "../../packages/ui/src/styles/globals.css";

export function costLabTokenPath(cwd: string = process.cwd()): string {
  return path.join(cwd, COST_LAB_TOKEN_CSS);
}

/**
 * `선택자 { … }` 한 덩이를 통째로 꺼낸다. 못 찾으면 빈 글자다.
 *
 * 값 안에는 중괄호가 없으므로 여는 괄호부터 짝이 맞을 때까지 세면 된다.
 * 정규식으로 하면 중첩을 못 세고, 토큰이 하나 늘어날 때마다 흔들린다.
 */
export function extractBlock(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(at, i + 1);
    }
  }
  return "";
}

/**
 * 도구에 입히는 **시스템 겉모습.**
 *
 * 도구의 `<style>` **뒤에** 넣어야 이긴다. 하는 일은 넷이다.
 *
 *   ① 시스템 토큰을 창 안으로 들여온다(`globals.css` 에서 읽은 그대로)
 *   ② 도구의 토큰 열 개를 그 위에 얹는다
 *   ③ 글꼴을 Pretendard 로 바꾼다
 *   ④ 도구가 스스로 그리는 상표 칸을 숨긴다 — 앱 머리말과 겹친다
 *
 * `--navy` 는 도구에서 **강조 카드의 바탕**이라 흰 글자가 그 위에 얹힌다.
 * 시스템의 `--primary` 로 두면 화면에서 가장 센 자리를 강조색이 통째로 먹는다.
 * 앱의 **어두운 표면**을 쓴다 — 밝은 테마에도 어두운 카드가 하나 있는 것이
 * 도구의 원래 짜임이다.
 *
 * 도구의 `--radius` 는 손대지 않는다. 둘 다 14px 라 바꿀 것이 없다.
 */
export function costLabThemeCss(tokenCss: string): string {
  /*
    **`@theme inline` 은 `:root` 로 바꿔 넣는다.**

    글꼴 이름(`--font-sans`)이 거기 있는데, 그것은 Tailwind 의 at-rule 이라
    **브라우저가 통째로 무시한다.** 앱에서는 Tailwind 가 풀어 주지만 창 안에는
    그 단계가 없다. 그대로 넣었더니 글꼴만 안 붙었다(2026-09-11 실측).
  */
  const theme = extractBlock(tokenCss, "@theme inline");
  const themeVars = theme ? `:root {${theme.slice(theme.indexOf("{") + 1)}` : "";

  return `
/* ── 시스템 토큰 (globals.css 에서 그대로 읽어 옴) ───────────── */
${extractBlock(tokenCss, ":root")}
${extractBlock(tokenCss, ".dark")}
${themeVars}

/* ── 도구의 토큰을 시스템 값으로 ───────────────────────────── */
:root {
  --ink: var(--foreground);
  --muted: var(--muted-foreground);
  --line: var(--border);
  --bg: var(--background);
  --blue: var(--primary);
  --navy: #1c1b19;
  --green: var(--success);
  --red: var(--destructive);
  --amber: var(--warning);
  font-family: var(--font-sans);
}
html.dark { --navy: #26251f; }
body { font-family: inherit; background: var(--background); color: var(--foreground); }

/* 카드·패널은 앱의 카드 색을 따른다. 배경과 같은 색이면 경계가 사라진다. */
.panel, .kpi, .control-group, .sheet, dialog { background: var(--card); }

/*
  ── **겉테두리를 줄인다** ────────────────────────────────────

  도구는 혼자 뜨는 한 장으로 만들어져서 제 머리말과 넉넉한 여백을 들고 있다.
  앱 셸 안에 들어오면 그 머리말이 사이드바·앱 머리말과 겹쳐 「대시보드 안에 또
  대시보드」가 되고, 정작 **볼 내용이 밀려난다**(2026-09-11 운영자 지적).

  위아래 여백을 절반쯤으로 줄이고 제목 크기를 한 단 내린다.

  **상표 칸은 이름만 남긴다.** 처음에는 통째로 숨겼는데, 그러면 화면 어디에도
  「비용 전략실」이 없어진다 — 도구의 큰 제목은 「어떤 가격이면 지속 가능할까?」
  라서 여기가 어디인지 말해 주지 않는다. 사이드바와 겹치는 MCS 네모와 영문
  부제만 빼고, 이름은 버튼 줄 왼쪽의 빈자리에 그대로 둔다.
*/
header.top .brand .mark, header.top .brand .meta { display: none; }
header.top .brand strong { font-size: .95rem; }
header.top { background: var(--card); padding: 8px 16px; }
.shell { max-width: none; padding: 12px 16px 20px; }
.title-row { margin-bottom: 12px; }
h1 { font-size: 1.35rem; letter-spacing: -0.02em; }

/*
  ── **박아 둔 흰색과 옅은 색을 토큰으로** ─────────────────────

  도구는 밝은 화면만 있는 것으로 만들어져서, 표면 몇 곳에 흰색과 옅은 파랑이
  값으로 박혀 있다. 토큰만 갈아 끼우면 **어두운 화면에서 그 자리만 하얗게
  남는다**(2026-09-11 실측 — 머리말 줄·입력칸·막대 바닥이 그랬다).

  아래는 그 자리 목록이다. 도구의 CSS 를 고치지 않고 여기서 덮는다 — 원본을
  건드리면 도구를 새로 받을 때마다 같은 수정을 다시 해야 한다.
*/
button { background: var(--card); color: var(--ink); border-color: var(--line); }
button.primary { background: var(--blue); border-color: var(--blue); color: var(--primary-foreground); }
select, .inputbox { background: var(--card); border-color: var(--input); color: var(--ink); }
input[readonly] { background: var(--muted-surface); color: var(--muted); }
th { background: var(--muted-surface); }
.bar-track { background: var(--muted-surface); }
.selected-row { background: var(--primary-soft); }
.tag { background: var(--primary-soft); color: var(--blue); }
.tag.assume { background: var(--warning-soft); color: var(--amber); }
.notice { background: var(--warning-soft); color: var(--ink); border-color: var(--amber); }
.notice.neutral { background: var(--primary-soft); color: var(--ink); border-color: var(--blue); }
.wallet-unit { background: var(--primary-soft); color: var(--blue); }
.heat td.win { background: var(--success-soft); color: var(--green); }
.heat td.loss { background: var(--danger-soft); color: var(--red); }
dialog { background: var(--card); color: var(--ink); }
:focus-visible { outline-color: var(--blue); }
.control-title, .formula, .sourcebox { background: var(--muted-surface); }
input { background: transparent; color: var(--ink); }
input.wallet-small, input.scenario-name { background: var(--card); border-color: var(--input); }
.heat td, .market-table td, .tariff-table td { background: transparent; }

/*
  ── **사이드바 옆에서도 가로로 안 넘치게** ───────────────────

  도구는 1536px 를 보고 만들어졌는데, 사이드바가 있는 이 화면에서는 1270px 쯤이
  남는다. 그때 가로 스크롤이 79px 생겼다(2026-09-11 실측).

  **범인은 KPI 줄이 아니라 그것을 담은 세로 격자였다.** 오른쪽 칸(.stack)이
  열을 안 정한 격자라 암시적 열이 **내용 크기**로 잡히고, 그 열이 제 부모를
  넘어섰다. 열을 minmax(0, 1fr) 로 못 박으면 안쪽이 따라 줄어든다.

  KPI 줄도 함께 푼다 — 격자 칸의 기본 최소폭(min-width: auto)이 남아 있으면
  더 좁은 화면에서 같은 일이 다시 생기고, 그때는 줄을 바꾸는 편이 낫다.
*/
.stack { grid-template-columns: minmax(0, 1fr); }
.kpis { min-width: 0; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.kpi .value { overflow-wrap: anywhere; }

/*
  **옅은 바탕은 색을 섞어 만든다.** 밝고 어두운 두 벌을 따로 적으면 또 두 벌이
  된다. color-mix 는 지금 토큰에서 바로 만들어 내므로 테마를 따라온다.
*/
:root {
  --muted-surface: color-mix(in srgb, var(--foreground) 6%, transparent);
  --warning-soft: color-mix(in srgb, var(--warning) 14%, transparent);
  --success-soft: color-mix(in srgb, var(--success) 14%, transparent);
  --danger-soft: color-mix(in srgb, var(--destructive) 14%, transparent);
}
`;
}

/**
 * 그래프 막대의 **박아 둔 색**을 토큰으로 바꾼다.
 *
 * 막대 색은 CSS 가 아니라 **JS 가 인라인 스타일로 칠한다**. 인라인은 CSS 로
 * 못 덮으므로 문서를 내주기 전에 글자로 바꾼다.
 *
 * **따옴표로 감싼 것만 바꾼다.** 같은 값이 `:root` 에도 있는데, 거기까지 바꾸면
 * `--blue: var(--blue)` 가 되어 스스로를 가리킨다 — 색이 통째로 사라진다.
 *
 * 뜻이 있는 둘만 손댄다. 매출은 이 화면의 주인공이라 강조색으로, 무료 체험은
 * 비용이라 경고색으로 간다. 나머지 넷은 회색 계열이라 두 테마에서 다 읽힌다 —
 * 넷을 한 색으로 묶으면 서로 구분이 안 된다.
 */
export const COST_LAB_CHART_COLORS: ReadonlyArray<readonly [string, string]> = [
  ["'#2356dc'", "'var(--blue)'"],
  ["'#c79a54'", "'var(--amber)'"],
];

export function recolorChart(html: string): string {
  let out = html;
  for (const [from, to] of COST_LAB_CHART_COLORS) out = out.split(from).join(to);
  return out;
}

/**
 * 창 안에 테마를 전해 주는 조각.
 *
 * 부모가 `postMessage` 로 알려 주면 붙인다. 처음 값은 주소의 `?theme=` 에서
 * 읽는다 — 메시지가 오기 전 한 순간 밝은 화면이 번쩍이는 것을 막는다.
 *
 * **보낸 곳을 확인한다.** 같은 출처가 아니면 무시한다.
 */
export function costLabThemeScript(): string {
  return `
(function () {
  var apply = function (theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
  };
  try {
    apply(new URLSearchParams(location.search).get("theme"));
  } catch (error) {
    // 주소를 못 읽어도 화면은 떠야 한다. 밝은 쪽으로 둔다.
  }
  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === "mcs-theme") apply(event.data.theme);
  });
})();
`;
}

/**
 * 내려보낼 문서를 만든다.
 *
 * **`</head>` 바로 앞에 끼운다.** 도구의 `<style>` 이 `<head>` 안에 있으므로
 * 그 뒤여야 이긴다. 닫는 태그를 못 찾으면 **손대지 않는다** — 엉뚱한 자리에
 * 끼워 문서를 깨뜨리는 것보다, 겉모습이 예전 그대로인 편이 낫다.
 */
export function costLabDocument(html: string, fontCss: string, tokenCss: string, nonce?: string): string {
  const patch =
    `<style>${fontCss}
${costLabThemeCss(tokenCss)}</style>` +
    `<script>${costLabThemeScript()}</script>`;
  const painted = recolorChart(html);
  const close = painted.lastIndexOf("</head>");
  const document = close < 0 ? painted : `${painted.slice(0, close)}${patch}${painted.slice(close)}`;
  if (!nonce) return document;
  if (!/^[A-Za-z0-9+/_=-]{16,128}$/.test(nonce)) throw new Error("invalid_csp_nonce");
  // Only trusted repository HTML reaches this function; this is not an HTML sanitizer.
  return document.replace(/<script\b([^>]*)>/gi, (_tag, attributes: string) =>
    `<script nonce="${nonce}"${attributes.replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")}>`);
}

/**
 * 내줄 때 붙이는 머리.
 *
 * **`no-store` 다.** 가격·마진을 다룬 화면이라 중간 캐시에 남으면 안 된다.
 */
export const COST_LAB_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};
