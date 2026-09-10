import Link from "next/link";
import type { LandingCopy, Locale } from "./landing-content";
import { BusinessInfo } from "./legal/BusinessInfo";
import { LegalLinks } from "./legal/LegalLinks";

export function LandingFooter({ t, locale }: { t: LandingCopy; locale: Locale }) {
  return (
    <footer className="mcs-footer">
      <div className="mcs-shell mcs-footer-inner">
        <b>MCS</b>
        <span>{t.footerNote}</span>
        {/*
          **좁은 화면에서는 상단바의 메뉴가 접힌다**(`landing.css` 의
          `.mcs-nav-links` 가 1080px 아래에서 `display: none`). 헤더에만 두면
          휴대폰으로 온 사람은 이 화면에 닿을 길이 아예 없다. 푸터는 늘 보이는
          자리라 여기 한 줄을 더 둔다.
        */}
        <Link className="mcs-footer-link" href="/about">
          {t.navAbout}
        </Link>
        {/*
          약관과 처리방침은 **늘 닿는 자리**에 있어야 한다(전자상거래법 ·
          개인정보보호법). 푸터가 그 자리다.
        */}
        <LegalLinks />
        <span className="mcs-footer-right">{t.footerRight}</span>
      </div>

      {/*
        사업자 정보도 같은 이유로 여기 있다(전자상거래법 제10조). 위 줄과 섞으면
        링크 사이에 번호가 끼어 둘 다 읽기 어려워지므로 **줄을 나눈다.**
      */}
      <div className="mcs-shell mcs-footer-legal">
        <BusinessInfo locale={locale} />
      </div>
    </footer>
  );
}
