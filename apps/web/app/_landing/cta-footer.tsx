import type { LandingCopy, Locale } from "./landing-content";
import { developerLines } from "./developer";
import { BusinessInfo } from "./legal/BusinessInfo";
import { LegalLinks } from "./legal/LegalLinks";

export function LandingFooter({ t, locale }: { t: LandingCopy; locale: Locale }) {
  return (
    <footer className="mcs-footer">
      <div className="mcs-shell mcs-footer-inner">
        <b>MCS</b>
        <span>{t.footerNote}</span>
        {/*
          약관과 처리방침은 **늘 닿는 자리**에 있어야 한다(전자상거래법 ·
          개인정보보호법). 푸터가 그 자리다.

          여기 있던 「MCS란」 링크와 오른쪽 한 줄은 2026-09-14 에 뺐다(운영자 요청).
          **그래서 1080px 아래에서는 `/about` 에 닿을 길이 없다** — 그 폭에서
          상단바 메뉴가 접히고(`landing.css` 의 `.mcs-nav-links`), 이 링크가
          유일한 통로였다. 되살리려면 이 자리에 한 줄을 다시 두면 된다.
        */}
        <LegalLinks />

        {/*
          만든 사람과 만든 날. 오른쪽 끝에 둔다 — 법정 표시가 아니라 서명에
          가깝고, 아래 사업자 정보와 섞이면 둘 다 읽기 어려워진다.
        */}
        <span className="mcs-footer-right mcs-footer-by">
          {developerLines(locale).map((line) => (
            <span key={line.label}>
              <em>{line.label}</em> {line.value}
            </span>
          ))}
        </span>
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
