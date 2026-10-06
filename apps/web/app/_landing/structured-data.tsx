import { CS_EMAIL } from "../../lib/cs/contact";
import { SITE_NAME, SITE_URL } from "../../lib/seo/site";
import { BUSINESS } from "./legal/business-info";

/**
 * **검색 결과용 회사·사이트 정보(JSON-LD)**(계획 2026-10-06 seo-search-registration).
 *
 * 값은 사업자 정보(`legal/business-info.ts`)에서 받는다 — 여기 따로 적으면 주소·전화가 바뀔 때 어긋난다.
 * 우리 상수만 넣지만, 글 안의 `<` 는 `\u003c` 로 바꿔 스크립트가 중간에 끊기지 않게 한다.
 */
export function structuredData(siteUrl: string = SITE_URL): Array<Record<string, unknown>> {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BUSINESS.companyName,
      alternateName: "fixup",
      url: siteUrl,
      logo: `${siteUrl}/icon-512.png`,
      email: CS_EMAIL,
      telephone: BUSINESS.contact,
      address: { "@type": "PostalAddress", streetAddress: BUSINESS.address, addressCountry: "KR" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${siteUrl}/`,
      inLanguage: "ko-KR",
      publisher: { "@type": "Organization", name: BUSINESS.companyName },
    },
  ];
}

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function StructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData()) }} />;
}
