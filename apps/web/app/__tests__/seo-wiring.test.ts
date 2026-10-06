import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **화면마다 검색 정보가 제대로 붙었나**(계획 2026-10-06 seo-search-registration).
 *
 * 화면 파일을 통째로 불러오면 회원 시스템까지 끌려온다. 그래서 각 파일이 **어느 함수를 어느 주소로**
 * 부르는지 읽어 본다 — 주소를 잘못 넣으면(남의 쪽 설명) 바로 걸린다. 함수 자체는 `lib/seo` 시험이 본다.
 */
const APP = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(APP, ...parts), "utf8");

const GUIDE_PAGES: Array<[file: string, href: string]> = [
  ["guide/page.tsx", "/guide"],
  ...["account", "ad", "cardnews", "character", "credits", "detail-page", "easy", "image", "library", "redesign", "team", "trouble"].map(
    (slug): [string, string] => [`guide/${slug}/page.tsx`, `/guide/${slug}`],
  ),
];

describe("설명서 13쪽(목차 첫 쪽 포함)", () => {
  it.each(GUIDE_PAGES)("%s 는 guideMetadata(\"%s\")", (file, href) => {
    const source = read(file);
    expect(source).toContain(`export const metadata = guideMetadata("${href}");`);
    expect(source).not.toMatch(/export const metadata: Metadata = \{ title:/);
  });
});

describe("도움 화면은 검색에 안 싣는다", () => {
  it.each([
    ["login", "로그인"],
    ["signup", "회원가입"],
    ["forgot-password", "비밀번호 찾기"],
    ["reset-password", "비밀번호 바꾸기"],
  ])("%s/layout.tsx 가 noIndexMetadata(\"%s\")", (dir, title) => {
    expect(existsSync(join(APP, dir, "layout.tsx"))).toBe(true);
    expect(read(dir, "layout.tsx")).toContain(`export const metadata = noIndexMetadata("${title}");`);
  });
});

describe("공통 틀·첫 화면·소개", () => {
  it("공통 틀은 주소를 lib/seo 에서 받고, 소유 확인 태그를 달고, 모든 화면에 첫 화면 og:url 을 박지 않는다", () => {
    const layout = read("layout.tsx");
    expect(layout).toContain('from "../lib/seo/site"');
    expect(layout).toContain("verification: verificationMetadata()");
    expect(layout).not.toMatch(/url:\s*SITE_URL/);
    expect(layout).not.toMatch(/const SITE_URL =/);
  });
  it("첫 화면은 언어별 generateMetadata 와 구조화 데이터를 낸다", () => {
    const page = read("page.tsx");
    expect(page).toContain("export async function generateMetadata");
    expect(page).toContain("<StructuredData />");
  });
  it("첫 화면은 대표 주소·언어 연결·og:url 을 직접 낸다(Next 가 / 의 조회 값을 버리므로)", () => {
    const page = read("page.tsx");
    expect(page).toContain("<HomeLinks locale={locale} />");
    expect(page).toContain("selfLinks: false");
    expect(page).not.toContain("languageAlternates(");
  });
  it("소개는 pageMetadata 로 대표 주소와 영어 판을 잇는다", () => {
    const about = read("about", "page.tsx");
    expect(about).toContain('languageAlternates("/about", "/about?lang=en")');
    expect(about).toContain("pageMetadata(");
  });
});
