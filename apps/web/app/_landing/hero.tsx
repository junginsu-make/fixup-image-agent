import Link from "next/link";
import { HeroConsole } from "./hero-console";
import type { LandingCopy } from "./landing-content";

export function Hero({ t }: { t: LandingCopy }) {
  return (
    <section id="top" className="mcs-hero mcs-section">
      <div className="mcs-shell mcs-hero-grid">
        <div>
          <span className="mcs-eyebrow">
            <i className="mcs-dot mcs-dot--accent" aria-hidden="true" />
            {t.eyebrow}
          </span>

          <h1 className="mcs-h1">
            <span>{t.h1a}</span>
            <span>{t.h1b}</span>
          </h1>

          <p className="mcs-lead">{t.heroLead}</p>

          <div className="mcs-hero-actions">
            <Link href="/signup" className="mcs-btn mcs-btn--primary">
              {t.ctaPrimary}
            </Link>
            <Link href="#gallery" className="mcs-btn mcs-btn--ghost">
              {t.ctaSecondary}
            </Link>
          </div>

          <dl className="mcs-stats">
            {t.heroStats.map((stat) => (
              <div className="mcs-stat" key={stat.v}>
                <dt>
                  <b>{stat.v}</b>
                </dt>
                <dd>
                  <span>{stat.k}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroConsole
          typed={t.typed}
          steps={t.steps}
          consoleTitle={t.consoleTitle}
          consoleModel={t.consoleModel}
          promptLabel={t.promptLabel}
          rendering={t.rendering}
          qaPass={t.qaPass}
          resultAlt={t.g1title}
        />
      </div>
    </section>
  );
}
