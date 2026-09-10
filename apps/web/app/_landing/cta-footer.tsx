import type { LandingCopy } from "./landing-content";
import { LegalLinks } from "./legal/LegalLinks";

export function LandingFooter({ t }: { t: LandingCopy }) {
  return (
    <footer className="mcs-footer">
      <div className="mcs-shell mcs-footer-inner">
        <b>MCS</b>
        <span>{t.footerNote}</span>
        {/*
          약관과 처리방침은 **늘 닿는 자리**에 있어야 한다(전자상거래법 ·
          개인정보보호법). 푸터가 그 자리다.
        */}
        <LegalLinks />
        <span className="mcs-footer-right">{t.footerRight}</span>
      </div>
    </footer>
  );
}
