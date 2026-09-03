import Link from "next/link";
import { LOCAL_BYPASS_ENTRY } from "../../lib/dev-auth";
import type { LandingCopy } from "./landing-content";
import { HOME_AFTER_LOGIN } from "../../lib/routes";

export function CallToAction({
  t, localMode, signedIn,
}: { t: LandingCopy; localMode: boolean; signedIn: boolean }) {
  return (
    <section id="cta" className="mcs-section mcs-deep-section">
      <div className="mcs-shell mcs-cta-grid">
        <div>
          <h2 className="mcs-h2 mcs-h2--cta">{t.ctaTitle}</h2>
          <p className="mcs-lead">{t.ctaLead}</p>
          <div className="mcs-hero-actions">
            {localMode ? (
              <Link href={LOCAL_BYPASS_ENTRY} className="mcs-btn mcs-btn--primary">
                {t.navStudio}
              </Link>
            ) : signedIn ? (
              // 이미 들어와 있는 사람에게 가입·로그인을 다시 권하지 않는다.
              <Link href={HOME_AFTER_LOGIN} className="mcs-btn mcs-btn--primary">
                {t.navStudio}
              </Link>
            ) : (
              <>
                <Link href="/signup" className="mcs-btn mcs-btn--primary">
                  {t.ctaPrimary}
                </Link>
                <Link href="/login" className="mcs-btn mcs-btn--ghost">
                  {t.navLogin}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mcs-facts">
          {t.ctaFacts.map((fact) => (
            <div className="mcs-fact" key={fact.n}>
              <b>{fact.n}</b>
              <strong>{fact.title}</strong>
              <span>{fact.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({ t }: { t: LandingCopy }) {
  return (
    <footer className="mcs-footer">
      <div className="mcs-shell mcs-footer-inner">
        <b>MCS</b>
        <span>{t.footerNote}</span>
        <span className="mcs-footer-right">{t.footerRight}</span>
      </div>
    </footer>
  );
}
