import { describe, expect, it } from "vitest";
import { ABOUT_KO } from "../../../app/_landing/about-content";
import { GUIDE_TOPICS } from "../../../app/guide/_components/topics";
import { GUIDE_COPY, HOME_COPY, KEYWORDS } from "../copy";
import { guideMetadata, languageAlternates, noIndexMetadata, pageMetadata } from "../metadata";
import { OG_IMAGE } from "../site";

/** 화면별 검색 정보(계획 2026-10-06 seo-search-registration). */
describe("pageMetadata", () => {
  const meta = pageMetadata({ path: "/guide/cardnews", title: "카드뉴스 만들기 · 사용 설명서", description: "설명" });

  it("대표 주소는 받은 경로 그대로", () => {
    expect(meta.alternates?.canonical).toBe("/guide/cardnews");
  });
  it("openGraph 는 공유 그림까지 다 갖는다 — Next 가 통째로 바꾸기 때문", () => {
    expect(meta.openGraph).toMatchObject({
      url: "/guide/cardnews", siteName: "FormWith", locale: "ko_KR", type: "website",
      title: "카드뉴스 만들기 · 사용 설명서 | FormWith", description: "설명",
    });
    expect((meta.openGraph as { images: unknown[] }).images).toEqual([OG_IMAGE]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [OG_IMAGE.url] });
  });
  it("absoluteTitle 이면 틀을 안 씌운다", () => {
    const home = pageMetadata({ path: "/", title: "FormWith | X", description: "d", absoluteTitle: true });
    expect(home.title).toEqual({ absolute: "FormWith | X" });
    expect(home.openGraph?.title).toBe("FormWith | X");
  });
  it("영어 판은 en_US, 언어 대응을 단다", () => {
    const en = pageMetadata({ path: "/?lang=en", title: "t", description: "d", locale: "en", languages: languageAlternates("/", "/?lang=en") });
    expect(en.openGraph).toMatchObject({ locale: "en_US" });
    expect(en.alternates?.languages).toEqual({ ko: "/", en: "/?lang=en", "x-default": "/" });
  });
});

describe("pageMetadata selfLinks: false", () => {
  const meta = pageMetadata({ path: "/", title: "t", description: "d", selfLinks: false });
  it("대표 주소·언어 연결·og:url 을 메타데이터에서 뺀다(화면이 직접 낸다)", () => {
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).not.toHaveProperty("url");
  });
  it("그래도 공유 그림·제목은 그대로", () => {
    expect((meta.openGraph as { images: unknown[] }).images).toEqual([OG_IMAGE]);
    expect(meta.openGraph?.title).toBe("t | FormWith");
  });
});

describe("문구", () => {
  const all = [HOME_COPY.ko, HOME_COPY.en, ...Object.values(GUIDE_COPY)];

  it.each(all.map((copy) => [copy.title, copy]))("%s 설명은 40~160자, 줄표 없음", (_title, copy) => {
    expect(copy.description.length).toBeGreaterThanOrEqual(40);
    expect(copy.description.length).toBeLessThanOrEqual(160);
    expect(copy.description).not.toMatch(/[—–]/);
    expect(copy.title).not.toMatch(/[—–]/);
  });
  // 네이버 서치어드바이저 「사이트 간단 체크」가 80자를 넘으면 고치라고 한다(2026-10-07).
  it.each([HOME_COPY.ko, ...Object.values(GUIDE_COPY), { title: "FormWith란", description: ABOUT_KO.metaDescription }]
    .map((copy) => [copy.title, copy]))("%s 한국어 설명은 80자 이내", (_title, copy) => {
    expect(copy.description.length).toBeLessThanOrEqual(80);
  });
  it("첫 화면 제목·설명은 사용자가 정한 문구(2026-10-07, 한글 이름 「프롬위드」 포함)", () => {
    expect(HOME_COPY.ko.title).toBe("FormWith | 프롬위드 AI 이미지·카드뉴스·상세페이지·포스터·광고 소재 만들기");
    expect(HOME_COPY.ko.description).toBe(
      "프롬위드. 레퍼런스 한 장으로 카드뉴스, 상세페이지, 광고 소재, 포스터, 캐릭터를 만드는 AI 마케팅 콘텐츠 제작 스튜디오 FormWith.",
    );
  });
  it("첫 화면 한국어 설명에 핵심 단어의 중심 말이 들어 있다", () => {
    for (const word of ["카드뉴스", "상세페이지", "광고 소재", "포스터", "캐릭터"]) {
      expect(HOME_COPY.ko.description).toContain(word);
    }
    expect(KEYWORDS).toContain("AI 카드뉴스 만들기");
  });
  it("설명서 목차의 모든 쪽에 문구가 있다(꺼진 팀 쪽 포함)", () => {
    for (const topic of GUIDE_TOPICS) expect(GUIDE_COPY[topic.href], topic.href).toBeDefined();
    expect(GUIDE_COPY["/guide/team"]).toBeDefined();
  });
});

describe("guideMetadata", () => {
  it("자기 주소를 대표 주소로, 문구 표의 제목·설명으로", () => {
    const meta = guideMetadata("/guide/cardnews");
    expect(meta.alternates?.canonical).toBe("/guide/cardnews");
    expect(meta.title).toBe(GUIDE_COPY["/guide/cardnews"]!.title);
    expect(meta.description).toBe(GUIDE_COPY["/guide/cardnews"]!.description);
  });
  it("문구가 없는 주소는 빌드에서 바로 멈춘다", () => {
    expect(() => guideMetadata("/guide/nope")).toThrow(/검색 문구/);
    expect(() => guideMetadata("constructor")).toThrow(/검색 문구/);
  });
});

describe("noIndexMetadata", () => {
  it("색인은 막고 링크는 따라가게", () => {
    expect(noIndexMetadata("로그인")).toEqual({ title: "로그인", robots: { index: false, follow: true } });
  });
});
