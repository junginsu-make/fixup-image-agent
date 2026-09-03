import Link from "next/link";
import { HeroConsole } from "./hero-console";
import type { LandingCopy } from "./landing-content";
import { HOME_AFTER_LOGIN } from "../../lib/routes";

/**
 * 로그인한 사람에게 「가입 신청」을 내밀지 않는다. 이미 회원인데 가입하라고
 * 하면 이 화면이 나를 모른다는 뜻으로 읽힌다.
 */
export function Hero({ t, signedIn }: { t: LandingCopy; signedIn: boolean }) {
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
            <Link
              href={signedIn ? HOME_AFTER_LOGIN : "/signup"}
              className="mcs-btn mcs-btn--primary"
            >
              {signedIn ? t.navStudio : t.ctaPrimary}
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
