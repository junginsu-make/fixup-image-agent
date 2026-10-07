import type { Metadata } from "next";
import Link from "next/link";
import { isLocalAuthBypass } from "../../lib/dev-auth";
import { getMembership } from "../../lib/membership/server";
import { pageMetadata } from "../../lib/seo/metadata";
import { LandingFooter } from "../_landing/cta-footer";
import { FEATURE_CTA, FEATURE_PAGES, FEATURES_HUB } from "../_landing/features-content";
import { CONTENT } from "../_landing/landing-content";
import { LandingHeader } from "../_landing/landing-header";
import { WheelBoost } from "../_landing/hero/WheelBoost";
import { FeatureCards } from "./feature-body";
import "../_landing/landing.css";
import "../_landing/hero/hero.css";
import "../about/about.css";
import "./features.css";

/** 기능 모아 보기 `/features`(계획 2026-10-07 seo-keyword-pages). 키워드 화면 여섯으로 잇는다. */
export const metadata: Metadata = {
  ...pageMetadata({ path: FEATURES_HUB.path, title: FEATURES_HUB.metaTitle, description: FEATURES_HUB.metaDescription }),
  keywords: [FEATURES_HUB.keyword, ...FEATURES_HUB.keywords],
};

export default async function FeaturesHub() {
  const signedIn = await getMembership().then(Boolean);

  return (
    <div className="mcs mcs-dark about features">
      <LandingHeader
        t={CONTENT.ko}
        locale="ko"
        localMode={isLocalAuthBypass}
        signedIn={signedIn}
        path={FEATURES_HUB.path}
        showLanguage={false}
      />
      <main>
        <section className="mcs-section about-hero">
          <div className="mcs-shell">
            <p className="mcs-kicker">{FEATURES_HUB.kicker}</p>
            <h1 className="mcs-h1">{FEATURES_HUB.h1}</h1>
            <p className="mcs-lead about-measure">{FEATURES_HUB.lead}</p>
            <FeatureCards pages={FEATURE_PAGES} />
            <p className="about-note about-measure">{FEATURES_HUB.easyNote}</p>
            <div className="about-cta">
              <Link className="mcs-btn mcs-btn--primary" href="/signup">
                {FEATURE_CTA.signup}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter t={CONTENT.ko} locale="ko" />
      <WheelBoost />
    </div>
  );
}
