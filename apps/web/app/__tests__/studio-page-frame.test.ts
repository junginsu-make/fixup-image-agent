import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **도구 화면들이 같은 틀 안에 있다.**
 *
 * ── 무엇이 어긋났었나 ──────────────────────────────────────
 *
 * 네 도구(상세페이지·리디자인·카드뉴스·포스터)는 전부 `StudioLayout` 을
 * 쓴다. 그 안의 `AppShell` 이 본문에 여백을 준다.
 *
 * ```
 * px-[clamp(16px,2.2vw,52px)] pb-6 pt-4
 * ```
 *
 * 그런데 **상세페이지만 그 위에 자기 여백을 한 번 더 얹고 있었다.**
 *
 * ```
 * mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6
 * ```
 *
 * 그래서 같은 셸 안인데도 양옆이 더 좁고 위아래가 더 벌어졌다. `max-w-6xl`
 * 로 너비까지 따로 잡아, 넓은 화면에서는 다른 도구보다 좁게 보였다
 * (2026-09-22 사용자 지적).
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────────
 *
 * 여백은 **틀려도 아무도 안 아프다.** 화면은 돌고 시험도 통과한다. 새 화면을
 * 만들며 옆 파일을 베끼면 조용히 되돌아온다.
 */

const WEB = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const 도구화면 = [
  { 이름: "상세페이지", path: "app/create/PdpMakerClient.tsx" },
  { 이름: "리디자인", path: "app/redesign/redesign-wizard.tsx" },
  { 이름: "카드뉴스", path: "app/sns/new-client.tsx" },
  { 이름: "포스터", path: "app/poster/new-client.tsx" },
];

const 읽기 = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("도구 화면들이 같은 셸을 쓴다", () => {
  it("**넷 다 `StudioLayout` 아래에 있다**", () => {
    const 셸밖 = [
      { 이름: "상세페이지", layout: "app/create/layout.tsx" },
      { 이름: "리디자인", layout: "app/redesign/layout.tsx" },
      { 이름: "카드뉴스", layout: "app/sns/new/page.tsx" },
      { 이름: "포스터", layout: "app/poster/new/page.tsx" },
    ].filter(({ layout }) => {
      /*
        **들여온 것만으로는 부족하다.** `import { StudioLayout }` 이 남아
        있어도 실제로 안 감싸면 셸 밖이다 — 실측으로 확인했다.
        **쓰는 것**을 본다.
      */
      return !/<StudioLayout[\s>]/.test(읽기(layout));
    });

    expect(셸밖.map((entry) => entry.이름), "셸 밖에 있는 화면").toEqual([]);
  });
});

/**
 * **셸을 두 번 씌우지 않는다.**
 *
 * ── 무엇이 어긋났었나 ──────────────────────────────────────
 *
 * `/library/works/[id]`(상세페이지 과정 보기)와 `/characters/[id]`(캐릭터
 * 과정 보기)는 페이지가 `<StudioLayout>` 으로 감쌌다. 카드뉴스·포스터
 * 페이지를 본뜬 것인데, 그쪽은 폴더에 레이아웃이 없어 페이지가 감싸야 한다.
 * **이 둘은 폴더의 `layout.tsx` 가 이미 감싸고 있었다.** 그래서 사이드바와
 * 상단바가 한 벌 더 안쪽에 그려져, 대시보드 안에 대시보드가 보였다
 * (2026-10-02 사용자 지적).
 *
 * ── 왜 폴더를 다 훑나 ─────────────────────────────────────
 *
 * 위 검사처럼 이름을 적어 두면 **새 페이지는 못 잡는다.** 이번 것도 옆
 * 파일을 베끼며 생겼다. 페이지마다 위쪽 레이아웃을 따라 올라가 본다.
 */
describe("셸을 두 번 씌우지 않는다", () => {
  const 코드만 = (body: string) =>
    body
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const 셸을씌운다 = (rel: string) => /<StudioLayout[\s>]/.test(코드만(읽기(rel)));

  const 페이지들 = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : 페이지들(join(dir, entry.name));
      return entry.name === "page.tsx" ? [relative(WEB, join(dir, entry.name))] : [];
    });

  /** `app/a/b/page.tsx` → `app/a/b`, `app/a`, `app` — 레이아웃이 감쌀 수 있는 폴더. */
  const 위폴더들 = (rel: string): string[] => {
    const dir = dirname(rel);
    return dir === "." ? [] : [dir, ...위폴더들(dir)];
  };

  const 셸을씌운레이아웃이있다 = (page: string) =>
    위폴더들(page).some((dir) => {
      const layout = join(dir, "layout.tsx");
      return existsSync(join(WEB, layout)) && 셸을씌운다(layout);
    });

  const 슬래시로 = (rel: string) => rel.replace(/\\/g, "/");

  /**
   * **아래 검사가 빈 배열로만 통과하지 않게 한다.** 경로 셈이 어긋나 레이아웃을
   * 못 찾으면 두 겹 목록은 늘 비고, 검사는 아무것도 못 잡은 채 초록이 된다.
   */
  it("훑는 목록에 과정 보기 두 페이지가 들어 있고, 위에 셸 레이아웃을 찾는다", () => {
    const 목록 = 페이지들(join(WEB, "app")).map(슬래시로);
    expect(목록).toContain("app/library/works/[id]/page.tsx");
    expect(목록).toContain("app/characters/[id]/page.tsx");
    expect(셸을씌운레이아웃이있다(join("app", "library", "works", "[id]", "page.tsx"))).toBe(true);
    expect(셸을씌운레이아웃이있다(join("app", "characters", "[id]", "page.tsx"))).toBe(true);
  });

  it("**레이아웃이 이미 씌운 셸을 페이지가 또 씌우지 않는다**", () => {
    const 두겹 = 페이지들(join(WEB, "app"))
      .filter(셸을씌운다)
      .filter(셸을씌운레이아웃이있다)
      .map(슬래시로);

    expect(두겹, "셸을 두 번 씌운 페이지").toEqual([]);
  });
});

/**
 * **셸이 주는 여백을 또 주지 않는다.**
 *
 * ── 무엇만 보는가 ──────────────────────────────────────────
 *
 * `max-w-3xl` 이 문단에 붙어 있으면 그것은 **읽기 너비**다 — 글줄이 너무
 * 길어지지 않게 하는 것이고 셸과 다투지 않는다. 처음에 이것까지 잡아
 * 카드뉴스가 잘못 빨개졌다.
 *
 * 다투는 것은 **가운데 정렬(`mx-auto`) + 너비 + 좌우/위아래 여백**을
 * 한꺼번에 잡는 바깥 칸이다. 그것이 셸의 여백 위에 또 얹힌다.
 *
 * 떠 있는 것(`fixed`·`absolute`·`sticky`)은 셸 흐름 밖이라 뺀다 — 토스트·
 * 모달은 제 너비를 가져야 한다.
 */
describe("셸 위에 여백을 또 얹지 않는다", () => {
  /*
    **주석을 걷고 본다.**

    이 저장소는 주석에 고친 까닭을 적고, 그러려면 **옛 클래스 이름을
    인용해야 한다.** 실제로 이 자리를 고치자마자 제 주석에 걸렸다. 같은
    함정을 다른 검사에서도 겪었다.
  */
  const 코드만 = (body: string) =>
    body
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  const 다투는줄 = (body: string) =>
    코드만(body)
      .split(/\r?\n/)
      .filter((line) => {
        if (/fixed|absolute|sticky/.test(line)) return false;
        return /mx-auto/.test(line) && /max-w-\d?xl/.test(line) && /\bp[xy]-\d/.test(line);
      })
      .map((line) => line.trim().slice(0, 100));

  for (const { 이름, path } of 도구화면) {
    it(`**${이름} 이 바깥 칸에서 셸과 다투지 않는다**`, () => {
      expect(다투는줄(읽기(path)), `${이름} 이 셸 위에 여백을 또 얹는다`).toEqual([]);
    });
  }
});
