import { SITE_URL } from "../../lib/seo/site";

/**
 * 첫 화면의 대표 주소·언어 연결·공유 주소를 직접 낸다(계획 2026-10-06 seo-search-registration).
 * Next 15.5 는 경로가 `/` 인 주소의 조회 값을 버려서(`?lang=en` → 사라짐) 메타데이터로는 영어 판을
 * 가리킬 수 없다. React 가 이 태그들을 <head> 로 올린다.
 */
export function homeUrls(locale: "ko" | "en", siteUrl: string = SITE_URL) {
  const ko = `${siteUrl}/`;
  const en = `${siteUrl}/?lang=en`;
  return { canonical: locale === "en" ? en : ko, ko, en };
}

export function HomeLinks({ locale }: { locale: "ko" | "en" }) {
  const urls = homeUrls(locale);
  return (
    <>
      <link rel="canonical" href={urls.canonical} />
      <link rel="alternate" hrefLang="ko" href={urls.ko} />
      <link rel="alternate" hrefLang="en" href={urls.en} />
      <link rel="alternate" hrefLang="x-default" href={urls.ko} />
      <meta property="og:url" content={urls.canonical} />
    </>
  );
}
