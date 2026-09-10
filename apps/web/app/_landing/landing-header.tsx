import Image from "next/image";
import Link from "next/link";
import { LOCAL_BYPASS_ENTRY } from "../../lib/dev-auth";
import { HOME_AFTER_LOGIN } from "../../lib/routes";
import { signOutFromLanding } from "./session-actions";
import type { LandingCopy, Locale } from "./landing-content";

const NAV = [
  { href: "#gallery", key: "navGallery" },
  { href: "#tools", key: "navTools" },
  { href: "#how", key: "navHow" },
  { href: "#try", key: "navTry" },
  { href: "#diff", key: "navDiff" },
] as const;

/**
 * 랜딩 전용 다크 헤더.
 *
 * 언어 전환은 클라이언트 상태가 아니라 `?lang=` 링크다. 페이지 전체가 서버에서
 * 렌더되므로 검색엔진이 두 언어를 다 읽을 수 있고, 자바스크립트 없이도 바뀐다.
 */
export function LandingHeader({
  t,
  locale,
  localMode,
  signedIn,
}: {
  t: LandingCopy;
  locale: Locale;
  localMode: boolean;
  /**
   * 로그인한 채로 첫 화면에 왔는가.
   *
   * 모르면 「로그인」만 보이고, 눌러도 세션이 있어 스튜디오로 튕겨 들어간다 —
   * 내가 로그인 상태인지 알 방법이 없었다.
   */
  signedIn: boolean;
}) {
  return (
    <header className="mcs-header">
      <div className="mcs-shell mcs-header-inner">
        <Link href="/" className="mcs-brand" aria-label="MCS 홈">
          {/*
            로고는 그림이지 글자가 아니다 — `alt` 를 비우고 옆 글자가 이름을
            말하게 한다. 둘 다 읽으면 스크린리더에서 「MCS MCS」가 된다.
          */}
          <Image src="/brand/mcs-mark-dark-bg.svg" alt="" width={28} height={28} priority />
          <b>MCS</b>
          <span>Marketing Content Studio</span>
        </Link>

        <nav className="mcs-nav" aria-label={locale === "ko" ? "주요 메뉴" : "Main menu"}>
          <span className="mcs-nav-links">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="mcs-nav-link">
                {t[item.key]}
              </Link>
            ))}
          </span>

          <span className="mcs-lang">
            <Link href="/?lang=ko" aria-current={locale === "ko"} hrefLang="ko">
              KO
            </Link>
            <Link href="/?lang=en" aria-current={locale === "en"} hrefLang="en">
              EN
            </Link>
          </span>

          {localMode ? (
            <Link href={LOCAL_BYPASS_ENTRY} className="mcs-btn-sm mcs-btn-sm--solid">
              {t.navStudio}
            </Link>
          ) : signedIn ? (
            <>
              {/* 폼으로 낸다. 자바스크립트가 없어도 로그아웃은 돼야 한다. */}
              <form action={signOutFromLanding}>
                <button type="submit" className="mcs-btn-sm mcs-btn-sm--quiet">
                  {t.navLogout}
                </button>
              </form>
              <Link href={HOME_AFTER_LOGIN} className="mcs-btn-sm mcs-btn-sm--solid">
                {t.navStudio}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="mcs-btn-sm mcs-btn-sm--quiet">
                {t.navLogin}
              </Link>
              <Link href="/signup" className="mcs-btn-sm mcs-btn-sm--solid">
                {t.navSignup}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
