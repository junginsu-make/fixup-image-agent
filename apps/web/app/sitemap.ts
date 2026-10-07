import type { MetadataRoute } from "next";
import { publicPages, sitemapEntries } from "../lib/seo/sitemap";
import { SITE_URL } from "../lib/seo/site";
import { FEATURE_PAGES } from "./_landing/features-content";
import { GUIDE_TOPICS } from "./guide/_components/topics";

/** sitemap.xml — 공개 화면만(계획 2026-10-06 seo-search-registration). */
export default function sitemap(): MetadataRoute.Sitemap {
  const features = ["/features", ...FEATURE_PAGES.map((page) => page.path)];
  return sitemapEntries(SITE_URL, publicPages(GUIDE_TOPICS.map((topic) => topic.href), features));
}
