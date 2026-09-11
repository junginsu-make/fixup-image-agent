import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COST_LAB_DIR,
  COST_LAB_DOCS,
  COST_LAB_FONT_CSS,
  COST_LAB_HEADERS,
  COST_LAB_TOKEN_CSS,
  canOpenCostLab,
  costLabDocPath,
  costLabDocument,
  costLabThemeCss,
  costLabThemeScript,
  extractBlock,
  isCostLabDoc,
  recolorChart,
} from "../cost-lab";
import { canAccessPage } from "../../access/core";
import { PAGE_ACCESS } from "../../access/routes";

/*
  **`fileURLToPath` 를 쓴다.** `new URL(...).pathname` 은 윈도에서 `/C:/...` 로
  나와 맨 앞 `/` 를 떼야 하는데, 리눅스에서는 `/home/...` 이라 떼면 상대 경로가
  된다 — 로컬에서는 되고 CI 에서만 ENOENT 가 난다(2026-09-11 실제로 겪음).
*/
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

describe("누가 열 수 있나", () => {
  it("관리자만 연다", () => {
    expect(canOpenCostLab({ role: "admin" })).toBe(true);
    expect(canOpenCostLab({ role: "member" })).toBe(false);
  });
});

/**
 * **문이 둘이다.** 하나만 시험하면 다른 하나가 언제 무너졌는지 모른다.
 * 여기서는 미들웨어가 쓰는 판단 함수를 **실제로 실행해** 본다.
 */
describe("미들웨어가 먼저 막는다", () => {
  it("회원은 못 들어온다", () => {
    expect(canAccessPage("/admin/cost-lab", { userId: "u", role: "member" }, PAGE_ACCESS)).toBe(false);
    expect(
      canAccessPage("/admin/cost-lab/doc/index.html", { userId: "u", role: "member" }, PAGE_ACCESS),
    ).toBe(false);
  });

  it("관리자는 들어온다", () => {
    expect(canAccessPage("/admin/cost-lab", { userId: "u", role: "admin" }, PAGE_ACCESS)).toBe(true);
  });

  it("전제 확인 — 규칙이 실제로 걸려 있다", () => {
    expect(PAGE_ACCESS["/admin"]?.allowedRoles).toEqual(["admin"]);
  });
});

describe("어떤 문서를 내주나", () => {
  it("아는 이름만 연다", () => {
    expect(isCostLabDoc("index.html")).toBe(true);
    expect(isCostLabDoc("prepaid.html")).toBe(true);
  });

  /** 주소에서 받은 값을 경로에 붙이면 `../../.env` 가 들어온다. */
  it("빠져나가는 이름을 막는다", () => {
    const bad = ["../../.env", "index.html/../../../etc/passwd", "engine.js", "", "INDEX.HTML"];
    for (const name of bad) expect(isCostLabDoc(name), name).toBe(false);
  });

  it("두 문서가 실제로 있다", () => {
    for (const doc of COST_LAB_DOCS) {
      expect(existsSync(path.join(WEB, COST_LAB_DIR, doc)), doc).toBe(true);
    }
  });

  it("자리는 작업 디렉터리 기준이다 — 서버가 apps/web 에서 돈다", () => {
    expect(costLabDocPath("index.html", "/srv/app")).toBe(
      path.join("/srv/app", COST_LAB_DIR, "index.html"),
    );
  });

  /**
   * **`import` 되지 않는 파일이라 Next 의 추적이 못 따라간다.** 추적 목록에서
   * 빠지면 로컬에서는 되고 배포본에서만 404 가 된다 — 가장 늦게 발견되는 갈래다.
   */
  it("셋 다 빌드 추적 목록에 적혀 있다", () => {
    const config = read("next.config.mjs");
    expect(config).toContain("app/admin/cost-lab/assets/*.html");
    expect(config).toContain(COST_LAB_FONT_CSS);
    expect(config).toContain(COST_LAB_TOKEN_CSS);
  });
});

describe("시스템 겉모습을 입힌다", () => {
  const tokenCss = read(COST_LAB_TOKEN_CSS);
  const themed = costLabThemeCss(tokenCss);

  it("덩이를 통째로 꺼낸다", () => {
    expect(extractBlock("a { x: 1 } b { y: 2 }", "b")).toBe("b { y: 2 }");
    expect(extractBlock("x { a: 1 }", "없는것")).toBe("");
  });

  /**
   * 팔레트를 베껴 적으면 두 벌이 되고 디자인이 바뀌는 날 한쪽만 낡는다.
   * **읽어서 넣는다** — 그래서 실제 값이 들어왔는지 본다.
   */
  it("시스템 토큰을 읽어서 넣는다 — 베껴 적지 않는다", () => {
    expect(tokenCss, "전제: 원본에 값이 있다").toContain("--background: #f5f4ed");
    expect(themed).toContain("--background: #f5f4ed");
    expect(themed, "어두운 벌도 함께").toContain("--background: #1c1b19");
  });

  it("도구의 토큰을 시스템 값으로 잇는다", () => {
    const pairs = [
      "--ink: var(--foreground)",
      "--line: var(--border)",
      "--bg: var(--background)",
      "--blue: var(--primary)",
    ];
    for (const pair of pairs) expect(themed, pair).toContain(pair);
  });

  it("글꼴을 시스템 글꼴로 바꾼다", () => {
    expect(themed).toContain("font-family: var(--font-sans)");
  });

  /**
   * 글꼴 이름은 Tailwind 의 `@theme inline` 안에 있다. **브라우저는 그 at-rule 을
   * 통째로 무시한다** — 그대로 넣었더니 글꼴만 안 붙었다(2026-09-11 실측).
   * `:root` 로 바꿔 넣어야 창 안에서 값이 산다.
   */
  it("그 이름이 창 안에서 실제로 정의된다", () => {
    expect(tokenCss, "전제: 원본은 @theme 안에 둔다").toContain("@theme inline");
    expect(themed).toContain("--font-sans:");
    expect(themed).toContain("Pretendard Variable");
    // at-rule 째로 넣으면 브라우저가 버린다.
    expect(themed, "@theme 를 그대로 넣지 않는다").not.toContain("@theme");
  });

  /** 도구가 스스로 그리는 상표 칸이 앱 머리말과 겹친다. */
  it("도구의 상표 칸을 숨긴다", () => {
    expect(themed).toContain("header.top .brand { display: none; }");
  });

  /**
   * 사이드바 옆에서는 폭이 1270px 쯤으로 줄어든다. 오른쪽 칸이 열을 안 정한
   * 격자라 암시적 열이 **내용 크기**로 잡히고, 그 열이 제 부모를 넘어 **가로
   * 스크롤이 79px** 생겼다(2026-09-11 실측). 열을 못 박아야 안쪽이 따라 준다.
   */
  it("좁은 폭에서 가로로 안 넘치게 열을 못 박는다", () => {
    expect(themed).toContain(".stack { grid-template-columns: minmax(0, 1fr); }");
  });

  /** 어두운 화면에서 그 자리만 하얗게 남던 곳들. */
  it("박아 둔 흰색 자리를 토큰으로 덮는다", () => {
    const spots = ["header.top", "button", "select, .inputbox", ".bar-track", ".control-title"];
    for (const spot of spots) expect(themed, spot).toContain(spot);
  });
});

describe("만들어진 CSS 가 성한가", () => {
  const css = costLabThemeCss(read(COST_LAB_TOKEN_CSS));

  /**
   * 덩이를 잘못 잘라 오면 중괄호가 안 맞고, 그 뒤 규칙이 **통째로 무시된다.**
   * 화면은 뜨는데 색만 안 맞아서 원인을 찾기 어렵다.
   */
  it("중괄호가 맞는다", () => {
    let depth = 0;
    for (const ch of css) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      expect(depth, "닫는 괄호가 먼저 나왔다").toBeGreaterThanOrEqual(0);
    }
    expect(depth, "여는 괄호가 남았다").toBe(0);
  });

  /** 브라우저가 통째로 버리는 at-rule 이 섞이면 그 안의 값이 전부 사라진다. */
  it("브라우저가 모르는 at-rule 을 넣지 않는다", () => {
    expect(css).not.toContain("@theme");
    expect(css).not.toContain("@layer");
    expect(css).not.toContain("@apply");
  });
});

describe("테마를 창에 전한다", () => {
  const script = costLabThemeScript();

  it("보낸 곳을 확인한다", () => {
    expect(script).toContain("event.origin !== window.location.origin");
  });

  it("시스템과 같은 표시를 쓴다", () => {
    expect(script).toContain("classList.toggle");
    expect(script).toContain("dark");
  });
});

describe("문서를 만든다", () => {
  const tokenCss = read(COST_LAB_TOKEN_CSS);
  const sample = "<head><style>a{}</style></head><body>x</body>";

  it("도구의 style 뒤에 넣는다 — 그래야 이긴다", () => {
    const made = costLabDocument(sample, "/*f*/", tokenCss);
    expect(made.indexOf("/*f*/")).toBeGreaterThan(made.indexOf("</style>"));
    expect(made.indexOf("/*f*/")).toBeLessThan(made.indexOf("</head>"));
  });

  /** 엉뚱한 자리에 끼워 문서를 깨뜨리는 것보다, 겉모습이 예전 그대로인 편이 낫다. */
  it("닫는 머리를 못 찾으면 손대지 않는다", () => {
    expect(costLabDocument("<body>x</body>", "/*f*/", tokenCss)).toBe("<body>x</body>");
  });

  it("실제 문서에도 들어간다", () => {
    const made = costLabDocument(read(COST_LAB_DIR + "/index.html"), "/*font*/", tokenCss);
    expect(made).toContain("/*font*/");
    expect(made).toContain("--ink: var(--foreground)");
  });
});

describe("그래프 막대의 박힌 색", () => {
  /** 막대는 JS 가 인라인 스타일로 칠한다. 인라인은 CSS 로 못 덮는다. */
  it("따옴표로 감싼 것만 바꾼다", () => {
    expect(recolorChart("x='#2356dc';")).toBe("x='var(--blue)';");
  });

  /**
   * 같은 값이 `:root` 에도 있다. 거기까지 바꾸면 `--blue: var(--blue)` 가 되어
   * 스스로를 가리키고 **색이 통째로 사라진다.**
   */
  it("토큰 선언은 건드리지 않는다", () => {
    expect(recolorChart(":root{--blue:#2356dc}")).toBe(":root{--blue:#2356dc}");
  });

  it("실제 문서의 막대가 바뀐다", () => {
    const before = read(COST_LAB_DIR + "/index.html");
    expect(before, "전제: 원본에 박혀 있다").toContain("'#2356dc'");
    const after = recolorChart(before);
    expect(after).toContain("'var(--blue)'");
    expect(after).toContain("'var(--amber)'");
    expect(after, "선언은 남는다").toContain("--blue:#2356dc");
  });
});

describe("내주는 방식", () => {
  it("가격을 다룬 화면이라 캐시에 안 남긴다", () => {
    expect(COST_LAB_HEADERS["cache-control"]).toBe("no-store");
    expect(COST_LAB_HEADERS["x-robots-tag"]).toContain("noindex");
  });
});

describe("라우트 배선", () => {
  const route = read("app/admin/cost-lab/doc/[file]/route.ts");

  it("라우트가 스스로 한 번 더 본다", () => {
    expect(route).toContain("canOpenCostLab");
    expect(route).toContain("isCostLabDoc");
  });

  /** 403 은 「여기 뭔가 있다」를 알려 준다. 없는 화면으로 둔다. */
  it("못 들어오면 404 다", () => {
    expect(route).not.toContain("status: 403");
    expect(route.match(/status: 404/g) ?? []).toHaveLength(3);
  });
});

describe("도구 자체", () => {
  const html = read(COST_LAB_DIR + "/index.html");

  it("혼자 도는 한 장이다 — 바깥에서 받아오는 것이 없다", () => {
    const external = /<(?:script|link)[^>]+(?:src|href)=["'](?:https?:)?\/\//;
    expect(external.test(html)).toBe(false);
  });

  it("이 시스템의 화면이라고 적혀 있다", () => {
    expect(html).toContain("<title>MCS 비용 전략실</title>");
  });
});
