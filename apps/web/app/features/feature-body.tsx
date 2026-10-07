import Link from "next/link";
import { FEATURE_CTA, FEATURE_SECTIONS, type FeaturePage } from "../_landing/features-content";

/**
 * **키워드별 소개 화면의 본문**(계획 2026-10-07 seo-keyword-pages).
 *
 * 문구는 전부 `features-content.ts` 에서 온다. 모양새는 소개 화면(`about.css`)의 것을
 * 그대로 쓰고, 이 화면에만 있는 카드·순서·질문 목록만 `features.css` 에 둔다.
 * 훅이 없어 서버에서 그대로 그려진다 — 검색엔진이 자바스크립트 없이 읽는다.
 */
export function FeatureBody({ page }: { page: FeaturePage }) {
  return (
    <main>
      <section className="mcs-section about-hero">
        <div className="mcs-shell">
          <p className="mcs-kicker">{page.kicker}</p>
          <h1 className="mcs-h1">{page.h1}</h1>
          <p className="mcs-lead about-measure">{page.lead}</p>
          <div className="about-cta">
            <Link className="mcs-btn mcs-btn--primary" href="/signup">
              {FEATURE_CTA.signup}
            </Link>
            <Link className="mcs-btn mcs-btn--ghost" href={page.guideHref}>
              {FEATURE_CTA.guide}
            </Link>
          </div>
        </div>
      </section>

      <section className="mcs-section">
        <div className="mcs-shell feature-pair">
          <ListBlock title={FEATURE_SECTIONS.goodFor} items={page.goodFor} />
          <ListBlock title={FEATURE_SECTIONS.inputs} items={page.inputs} />
        </div>
      </section>

      <section className="mcs-section mcs-ink-section">
        <div className="mcs-shell">
          <h2 className="mcs-h2 about-measure">{FEATURE_SECTIONS.steps}</h2>
          <ol className="feature-steps">
            {page.steps.map((step, index) => (
              <li key={step.title}>
                <span className="about-n">{String(index + 1).padStart(2, "0")}</span>
                <span className="about-step-title">{step.title}</span>
                <span className="about-step-desc">{step.body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mcs-section">
        <div className="mcs-shell feature-pair">
          <ListBlock title={FEATURE_SECTIONS.outputs} items={page.outputs} />
          <ListBlock title={FEATURE_SECTIONS.quality} items={page.quality} />
        </div>
      </section>

      <section className="mcs-section">
        <div className="mcs-shell">
          <h2 className="mcs-h2 about-measure">{FEATURE_SECTIONS.faq}</h2>
          <dl className="feature-faq about-measure">
            {page.faq.map((qa) => (
              <div key={qa.q}>
                <dt>{qa.q}</dt>
                <dd>{qa.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mcs-section mcs-deep-section">
        <div className="mcs-shell">
          <div className="about-cta">
            <Link className="mcs-btn mcs-btn--primary" href="/signup">
              {FEATURE_CTA.signup}
            </Link>
            <Link className="mcs-btn mcs-btn--ghost" href={page.guideHref}>
              {page.guideLabel}
            </Link>
            <Link className="mcs-btn mcs-btn--ghost" href="/features">
              {FEATURE_CTA.back}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ListBlock({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="feature-list">
      <h2 className="mcs-h2">{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** 키워드 화면으로 가는 카드 묶음. 모아 보기·첫 화면·소개 화면이 같이 쓴다. */
export function FeatureCards({ pages, moreLabel = FEATURE_CTA.more }: { pages: readonly FeaturePage[]; moreLabel?: string }) {
  return (
    <ul className="feature-cards">
      {pages.map((page) => (
        <li key={page.slug}>
          <Link className="feature-card" href={page.path}>
            <span className="feature-card-kicker">{page.kicker}</span>
            <span className="feature-card-title">{page.keyword}</span>
            <span className="feature-card-desc">{page.card}</span>
            <span className="feature-card-more">{moreLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
