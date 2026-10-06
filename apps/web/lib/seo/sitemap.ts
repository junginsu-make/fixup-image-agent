import type { MetadataRoute } from "next";

/**
 * **사이트 지도(sitemap.xml)에 넣을 공개 화면**(계획 2026-10-06 seo-search-registration).
 *
 * 첫 화면·소개·사용 설명서 목차만 넣는다. 설명서 목차(`GUIDE_TOPICS`)는 꺼진 화면을 이미 뺀다.
 * 첫 화면과 소개는 영어 판(`?lang=en`)을 잇는다.
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

export function sitemapEntries(siteUrl: string, pages: readonly SitemapPage[], now: Date): MetadataRoute.Sitemap {
  return pages.map((page) => ({
    url: `${siteUrl}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.english
      ? { alternates: { languages: { ko: `${siteUrl}${page.path}`, en: `${siteUrl}${page.english}` } } }
      : {}),
  }));
}
