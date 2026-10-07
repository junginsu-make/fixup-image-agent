import type { MetadataRoute } from "next";

/**
 * **사이트 지도(sitemap.xml)에 넣을 공개 화면**(계획 2026-10-06 seo-search-registration).
 *
 * 첫 화면·소개·사용 설명서 목차만 넣는다. 설명서 목차(`GUIDE_TOPICS`)는 꺼진 화면을 이미 뺀다.
 * 첫 화면과 소개는 영어 판(`?lang=en`)도 따로 한 줄 내고, 두 줄이 서로를 잇는다.
 */
export interface SitemapPage {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  english?: string;
}

export function publicPages(guideHrefs: readonly string[]): SitemapPage[] {
  return [
    { path: "/", priority: 1, changeFrequency: "weekly", english: "/?lang=en" },
    { path: "/about", priority: 0.8, changeFrequency: "monthly", english: "/about?lang=en" },
    ...guideHrefs.map((path) => ({
      path,
      priority: path === "/guide" ? 0.7 : 0.6,
      changeFrequency: "monthly" as const,
    })),
  ];
}

export function sitemapEntries(siteUrl: string, pages: readonly SitemapPage[]): MetadataRoute.Sitemap {
  // 마지막 수정 시각은 일부러 안 단다. 배포마다 바뀌는 값은 구글이 믿지 않게 만든다.
  return pages.flatMap((page): MetadataRoute.Sitemap => {
    const ko = `${siteUrl}${page.path}`;
    const base = { changeFrequency: page.changeFrequency };
    if (!page.english) return [{ url: ko, ...base, priority: page.priority }];
    const en = `${siteUrl}${page.english}`;
    const alternates = { languages: { ko, en, "x-default": ko } };
    return [
      { url: ko, ...base, priority: page.priority, alternates },
      { url: en, ...base, priority: Math.round((page.priority - 0.1) * 10) / 10, alternates },
    ];
  });
}
