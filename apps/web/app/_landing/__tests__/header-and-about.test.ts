import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ABOUT_EN, ABOUT_KO } from "../about-content";
import { EN, KO } from "../landing-content";

/**
 * 상단바와 `/about` 이 서로 어긋나지 않는지 본다.
 *
 * jsdom 이 없는 저장소라 컴포넌트를 그려 볼 수 없다. 대신 **파일을 글자로 읽어
 * 관계를 맞댄다** — 메뉴가 가리키는 자리가 실제로 있는지, 그 화면이 로그인 앞에
 * 열려 있는지처럼 «둘이 갈리면 화면에서만 드러나는» 것들이다.
 */
const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

const header = read("app/_landing/landing-header.tsx");
const landingCss = read("app/_landing/landing.css");
const heroCss = read("app/_landing/hero/hero.css");
const middleware = read("middleware.ts");

/** 상단바 목록이 가리키는 곳. `{ href: "…", key: … }` 에서 뽑는다. */
const navHrefs = [...header.matchAll(/\{ href: "([^"]+)", key: "(\w+)" \}/g)].map((found) => ({
  href: found[1],
  key: found[2],
}));

describe("상단바 목록", () => {
  it("네 곳을 가리킨다", () => {
    // 반복문이 헛돌지 않는지 먼저 본다.
    expect(navHrefs.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * **가리키는 자리가 실제로 있어야 한다.**
   *
   * 전에는 다섯 중 셋(`#gallery`·`#tools`·`#how`)이 사라진 섹션을 가리켰고,
   * `hero.css` 가 `display: none` 으로 감춰 두고 있었다. 감추는 것은 고치는 게
   * 아니다 — 목록에서 지워야 다음 사람이 다시 안 되살린다.
   */
  it("앵커가 가리키는 섹션이 첫 화면에 실제로 있다", () => {
    const sources = [
      "app/_landing/hero/ClaimStrip.tsx",
      "app/_landing/hero/KeyMessage.tsx",
      "app/_landing/hero/HeroStage.tsx",
      "app/_landing/try-section.tsx",
      "app/_landing/difference.tsx",
    ]
      .map(read)
      .join("\n");

    const ids = new Set([...sources.matchAll(/id="([a-z-]+)"/g)].map((found) => found[1]));
    expect(ids.size, "첫 화면에서 id 를 하나도 못 읽었다").toBeGreaterThan(0);

    for (const item of navHrefs) {
      if (!item.href.includes("#")) continue;
      const anchor = item.href.split("#")[1];
      expect(ids.has(anchor), `${item.href} 가 없는 자리를 가리킨다`).toBe(true);
    }
  });

  it("앵커를 `/` 기준으로 적는다 — 하위 화면에서도 같은 헤더를 쓴다", () => {
    // `#try` 라고만 적으면 `/about` 에서 그 화면 안을 찾다 아무 일도 안 한다.
    for (const item of navHrefs) {
      if (!item.href.includes("#")) continue;
      expect(item.href.startsWith("/#"), `${item.href} 가 상대 앵커다`).toBe(true);
    }
  });

  it("페이지로 가는 줄은 실제 라우트를 가리킨다", () => {
    for (const item of navHrefs) {
      if (item.href.includes("#")) continue;
      const page = path.join(WEB, "app", item.href, "page.tsx");
      expect(existsSync(page), `${item.href} 에 페이지 파일이 없다`).toBe(true);
    }
  });

  it("목록에 쓰는 말이 한국어·영어 둘 다 있다", () => {
    for (const item of navHrefs) {
      expect(KO[item.key as keyof typeof KO], `KO 에 ${item.key} 가 없다`).toBeTruthy();
      expect(EN[item.key as keyof typeof EN], `EN 에 ${item.key} 가 없다`).toBeTruthy();
    }
  });

  it("MCS 란이 목록에 있다", () => {
    expect(navHrefs.map((item) => item.href)).toContain("/about");
    expect(KO.navAbout).toBe("MCS란");
  });

  /**
   * **좁은 화면에서는 이 목록이 통째로 접힌다**(`.mcs-nav-links` 가 1080px
   * 아래에서 `display: none`). 헤더에만 두면 휴대폰으로 온 사람은 그 화면에
   * 닿을 길이 아예 없다 — 실제로 390px 에서 「MCS란」이 0개였다.
   */
  it("좁은 화면에서도 MCS 란에 닿을 길이 있다", () => {
    const footer = read("app/_landing/cta-footer.tsx");
    expect(footer).toContain('href="/about"');

    // 접히는 것이 정말 헤더 목록인지 확인한다. 아니면 이 시험의 뜻이 달라진다.
    const fold = landingCss.slice(landingCss.indexOf("@media (max-width: 1080px)"));
    expect(fold.slice(0, 120)).toContain(".mcs-nav-links");
    expect(fold.slice(0, 120)).toContain("display: none");
  });

  /** 감추던 규칙을 지웠는지. 남아 있으면 새 목록의 어느 줄이 또 사라질 수 있다. */
  it("죽은 링크를 감추던 CSS 규칙이 없다", () => {
    expect(heroCss).not.toContain('a[href="#gallery"]');
    expect(heroCss).not.toContain('a[href="#tools"]');
    expect(heroCss).not.toContain('a[href="#how"]');
  });
});

describe("언어 전환", () => {
  /**
   * **눈에 띌 자리가 아니다.** 전에는 테두리 상자 안에 KO·EN 을 넣고 고른 쪽에
   * 강조색을 칠해, 로그인·가입과 같은 무게로 보였다.
   */
  it("상자도 강조색도 쓰지 않는다", () => {
    const block = landingCss.slice(
      landingCss.indexOf(".mcs-lang {"),
      landingCss.indexOf(".mcs-btn-sm {"),
    );
    expect(block, ".mcs-lang 규칙을 못 찾았다").toContain("font-size");
    expect(block).not.toContain("border: 1px solid");
    expect(block).not.toContain("--mcs-ink-accent");
  });

  it("갈 수 있는 쪽 하나만 낸다", () => {
    // 둘을 다 내면 지금 보는 언어를 다시 누르는 길이 생긴다.
    expect(header).toContain("{t.langOther}");
    expect(header).not.toContain('href="/?lang=ko"');
    expect(header).not.toContain('href="/?lang=en"');
  });

  it("언어를 바꿔도 보던 화면에 남는다", () => {
    // `/?lang=en` 로 박으면 `/about` 에서 언어를 바꾼 사람이 첫 화면으로 튕긴다.
    expect(header).toContain("`${path}?lang=${other}`");
  });

  it("한 글자만으로 무슨 뜻인지 알 수 있게 아이콘을 붙인다", () => {
    // `import` 줄이 아니라 **실제로 그리는 자리**를 본다. 이름만 보면
    // 아이콘을 지워도 import 가 남아 통과한다.
    expect(header).toContain("<Languages ");
  });
});

describe("MCS 란 화면", () => {
  it("로그인 앞에 열려 있다", () => {
    // 안 열면 첫 화면 메뉴를 누른 사람이 로그인 화면을 만난다.
    const list = middleware.slice(
      middleware.indexOf("const PUBLIC_PATHS"),
      middleware.indexOf("];", middleware.indexOf("const PUBLIC_PATHS")),
    );
    expect(list).toContain('"/about"');
  });

  it("첫 화면과 같은 스타일을 쓴다 — 제 디자인을 새로 만들지 않는다", () => {
    const page = read("app/about/page.tsx");
    expect(page).toContain('import "../_landing/landing.css"');
    // 이것을 빼면 `.mcs-dark` 의 검은 토큰이 안 와서 이 화면만 아이보리로 뜬다.
    expect(page).toContain('import "../_landing/hero/hero.css"');
    expect(page).toContain('className="mcs mcs-dark');
  });

  it("색을 제 파일에 다시 적지 않는다", () => {
    /**
     * 전용 CSS 가 색을 직접 적기 시작하면 첫 화면과 두 벌이 된다. 토큰만 쓰면
     * 첫 화면의 색이 바뀔 때 여기도 함께 따라온다.
     */
    const css = read("app/about/about.css");
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals, `about.css 가 색을 직접 적었다: ${literals.join(", ")}`).toEqual([]);
  });

  it("첫 화면이 이미 보여 준 결과물 사진을 다시 싣지 않는다", () => {
    const page = read("app/about/page.tsx");
    expect(page).not.toContain("/landing/result-");
    expect(page).not.toContain("/landing/ref-");
  });

  it("한국어와 영어 카피가 빠짐없이 채워져 있다", () => {
    // 타입은 키가 있는지만 본다. 빈 문자열은 못 잡는다.
    for (const [key, value] of Object.entries(ABOUT_KO)) {
      const other = ABOUT_EN[key as keyof typeof ABOUT_EN];
      expect(other, `EN 에 ${key} 가 없다`).toBeTruthy();
      if (typeof value === "string") {
        expect(String(other).trim().length, `EN 의 ${key} 가 비어 있다`).toBeGreaterThan(0);
        expect(other, `EN 의 ${key} 가 한국어 그대로다`).not.toBe(value);
      }
    }
  });

  it("마지막에 내는 문은 하나뿐이다", () => {
    // 여기까지 읽은 사람에게 갈림길을 주면 둘 다 안 누른다.
    const page = read("app/about/page.tsx");
    const cta = page.slice(page.indexOf('className="about-cta"'));
    expect((cta.match(/mcs-btn /g) ?? []).length).toBe(1);
    expect(cta).toContain('href="/signup"');
    expect(cta).not.toContain('href="/demo"');
  });

  it("상단바가 이 화면에서도 고정이다 — 하위 화면이지 별개 사이트가 아니다", () => {
    // `hero.css` 가 `.mcs.mcs-dark .mcs-header` 를 `position: fixed` 로 둔다.
    // 그 규칙이 사라지면 이 화면의 상단바가 스크롤에 밀려 올라간다.
    expect(heroCss).toContain(".mcs.mcs-dark .mcs-header");
    const rule = heroCss.slice(heroCss.indexOf(".mcs.mcs-dark .mcs-header"));
    expect(rule.slice(0, 160)).toContain("position: fixed");

    // 다만 바탕은 이 화면 것으로 덮는다. 히어로가 없어서 그늘이 투명해지는
    // 아래쪽으로 글이 지나가면 겹쳐 읽힌다.
    const aboutCss = read("app/about/about.css");
    /**
     * **`hero.css` 보다 무거운 선택자여야 한다.** 저쪽이 클래스 셋
     * (`.mcs.mcs-dark .mcs-header`)이라 둘로는 못 이긴다 — 실제로 그렇게
     * 적었다가 브라우저에서 아무것도 안 먹는 것을 봤다.
     */
    expect(aboutCss).toContain(".mcs.mcs-dark.about .mcs-header");
    expect(aboutCss).toContain("backdrop-filter");

    const weigh = (selector: string) => (selector.match(/\./g) ?? []).length;
    expect(weigh(".mcs.mcs-dark.about .mcs-header")).toBeGreaterThan(
      weigh(".mcs.mcs-dark .mcs-header"),
    );
  });

  it("사람이 손대는 걸음은 하나뿐이다", () => {
    // 이 화면이 하는 주장 자체다. 둘이 되면 문장과 그림이 어긋난다.
    for (const copy of [ABOUT_KO, ABOUT_EN]) {
      expect(copy.steps.filter((step) => step.human)).toHaveLength(1);
      expect(copy.steps).toHaveLength(5);
    }
  });
});

describe("만들기 버튼", () => {
  const block = landingCss.slice(
    landingCss.indexOf(".mcs-run {"),
    landingCss.indexOf(".mcs-log {"),
  );

  it("누를 수 있는 것으로 보이게 부른다", () => {
    expect(block, ".mcs-run 규칙을 못 찾았다").toContain("background: var(--mcs-accent)");
    expect(block).toContain("@keyframes mcsInvite");
    expect(block).toContain("animation: mcsInvite");
  });

  it("도는 동안에는 멈춘다", () => {
    // 이미 눌린 버튼이 계속 부르면 두 번 누르게 된다.
    const running = block.slice(block.indexOf('.mcs-run[data-running="true"]'));
    expect(running).toContain("animation: none");
  });

  it("움직임을 줄여 달라고 한 사람에게도 테두리는 남는다", () => {
    // 파일 끝 전역 규칙이 `animation: none !important` 로 위를 끈다.
    expect(block).toContain("prefers-reduced-motion");
    expect(block).toContain("box-shadow: 0 0 0 3px var(--mcs-accent-soft)");
  });
});
