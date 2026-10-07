import Link from "next/link";
import { FeatureCards } from "../features/feature-body";
import { FEATURE_PAGES } from "./features-content";
import type { LandingCopy } from "./landing-content";

/**
 * 첫 화면 「무엇을 만들 수 있나요」(계획 2026-10-07 seo-keyword-pages).
 *
 * 키워드별 기능 소개 여섯으로 잇는다. 검색엔진은 첫 화면에서 이 링크를 따라 새 화면을 찾고,
 * 사람은 도구마다 무엇을 넣고 무엇을 받는지 보러 간다. 카드 글은 한국어 한 벌뿐이라
 * 영어 화면에서도 한국어로 보이고, 구획 머리만 영어다.
 */
export function FeaturesSection({ t }: { t: LandingCopy }) {
  return (
    <section id="features" className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-head">
          <div>
            <p className="mcs-kicker">{t.featKicker}</p>
            <h2 className="mcs-h2">{t.featTitle}</h2>
            <p className="mcs-lead">{t.featLead}</p>
          </div>
        </div>
        <FeatureCards pages={FEATURE_PAGES} moreLabel={t.featCardMore} />
        <div className="feature-more">
          <Link className="mcs-btn mcs-btn--ghost" href="/features">
            {t.featMore}
          </Link>
        </div>
      </div>
    </section>
  );
}
