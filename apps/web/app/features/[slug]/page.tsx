import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocalAuthBypass } from "../../../lib/dev-auth";
import { getMembership } from "../../../lib/membership/server";
import { pageMetadata } from "../../../lib/seo/metadata";
import { LandingFooter } from "../../_landing/cta-footer";
import { FEATURE_PAGES, featureBySlug } from "../../_landing/features-content";
import { CONTENT } from "../../_landing/landing-content";
import { LandingHeader } from "../../_landing/landing-header";
import { WheelBoost } from "../../_landing/hero/WheelBoost";
import { FeatureBody } from "../feature-body";
import "../../_landing/landing.css";
import "../../_landing/hero/hero.css";
import "../../about/about.css";
import "../features.css";

/**
 * **키워드별 기능 소개**(계획 2026-10-07 seo-keyword-pages) — `/features/cardnews` 등 여섯.
 *
 * 사람들이 검색하는 말(「AI 카드뉴스 만들기」…)을 제목과 본문에 그대로 쓴 공개 화면이다.
 * 한국어 한 벌만 있고, 여섯 주소만 미리 만든다(`dynamicParams = false` — 나머지는 404).
 * 모양새는 소개 화면(`/about`)과 한 벌이다.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURE_PAGES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = featureBySlug(slug);
  if (!page) return {};
  return {
    ...pageMetadata({ path: page.path, title: page.metaTitle, description: page.metaDescription }),
    keywords: [page.keyword, ...page.keywords],
  };
}

export default async function FeatureRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = featureBySlug(slug);
  if (!page) notFound();
  // 첫 화면·소개 화면과 같은 이유로 로그인 상태를 본다 — 모르면 로그인한 사람에게도 「로그인」만 보인다.
  const signedIn = await getMembership().then(Boolean);

  return (
    <div className="mcs mcs-dark about features">
      <LandingHeader
        t={CONTENT.ko}
        locale="ko"
        localMode={isLocalAuthBypass}
        signedIn={signedIn}
        path={page.path}
        showLanguage={false}
      />
      <FeatureBody page={page} />
      <LandingFooter t={CONTENT.ko} locale="ko" />
      <WheelBoost />
    </div>
  );
}
