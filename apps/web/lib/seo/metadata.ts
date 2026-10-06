import type { Metadata } from "next";
import { GUIDE_COPY } from "./copy";
import { OG_IMAGE, SITE_NAME } from "./site";

/**
 * **화면 하나의 검색 정보 만들기**(계획 2026-10-06 seo-search-registration).
 *
 * Next 는 위아래 메타데이터가 겹치면 `openGraph`·`twitter` 를 **통째로 바꾼다**. 그래서 여기서
 * 공유 그림까지 늘 다 채운다. `path` 는 조회 값 없는 경로만 받는다(영어 판의 `?lang=en` 만 예외) —
 * `/?signup=required&next=…` 같은 주소도 대표 주소는 `/` 가 된다.
 */
export interface PageMetaInput {
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  locale?: "ko" | "en";
  languages?: Record<string, string>;
}

export function pageMetadata(input: PageMetaInput): Metadata {
  const shareTitle = input.absoluteTitle ? input.title : `${input.title} | ${SITE_NAME}`;
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path, ...(input.languages ? { languages: input.languages } : {}) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: input.locale === "en" ? "en_US" : "ko_KR",
      url: input.path,
      title: shareTitle,
      description: input.description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: shareTitle, description: input.description, images: [OG_IMAGE.url] },
  };
}

/** 한국어 판과 영어 판을 서로 잇는다. 모르는 언어로 오면 한국어 판(x-default). */
export function languageAlternates(ko: string, en: string): Record<string, string> {
  return { ko, en, "x-default": ko };
}

/** 설명서 한 쪽. 문구가 없으면 빌드에서 바로 멈춘다 — 조용히 첫 화면 설명으로 떨어지지 않게. */
export function guideMetadata(href: string): Metadata {
  const copy = Object.hasOwn(GUIDE_COPY, href) ? GUIDE_COPY[href] : undefined;
  if (!copy) throw new Error(`설명서 검색 문구가 없습니다: ${href}`);
  return pageMetadata({ path: href, title: copy.title, description: copy.description });
}

/** 로그인·가입처럼 검색 결과에 나올 까닭이 없는 화면. 링크는 따라가게 둔다. */
export function noIndexMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true } };
}
