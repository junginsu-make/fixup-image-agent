import Image from "next/image";
import Link from "next/link";
import { Languages } from "lucide-react";
import { LOCAL_BYPASS_ENTRY } from "../../lib/dev-auth";
import { HOME_AFTER_LOGIN } from "../../lib/routes";
import { signOutFromLanding } from "./session-actions";
import type { LandingCopy, Locale } from "./landing-content";

/**
 * 헤더가 **제 목록을 갖는다.**
 *
 * 전에는 여기 다섯 줄이 있었는데 그중 셋(`#gallery`·`#tools`·`#how`)이 가리키는
 * 섹션이 사라졌고, `hero/hero.css` 가 `display: none` 으로 감춰 두고 있었다.
 * 그 규칙 옆에 「이 화면이 정식이 되면 헤더가 제 목록을 갖게 하고 이 규칙은
 * 지운다」고 적혀 있었다. 지금이 그때다 — 목록을 실제 섹션에 맞추고 그 규칙을
 * 지웠다.
 *
 * `href` 는 **`/` 기준**으로 적는다. 하위 화면(`/about`)에서도 같은 헤더를
 * 쓰는데, 거기서 `#try` 는 그 화면 안을 찾다 아무 일도 안 한다.
 */
const NAV = [
  { href: "/about", key: "navAbout" },
  { href: "/#claim", key: "navGallery" },
  { href: "/#try", key: "navTry" },
  { href: "/#diff", key: "navDiff" },
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
  path = "/",
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
  /**
   * 지금 어느 화면인가. 언어를 바꿔도 **보던 화면에 남기려고** 받는다.
   * 없으면 `/about` 에서 언어를 바꾼 사람이 첫 화면으로 튕겨 나간다.
   */
  path?: string;
}) {
  const other: Locale = locale === "ko" ? "en" : "ko";

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

          {/*
            **언어는 눈에 띌 자리가 아니다.**

            전에는 테두리 상자 안에 KO·EN 을 넣고 고른 쪽에 강조색을 칠했다.
            로그인·가입과 같은 무게로 보여 상단바에서 셋이 경쟁했다. 지금은
            **갈 수 있는 쪽 하나만** 조용한 글자로 둔다 — 한국어 화면에서는
            「EN」, 영어 화면에서는 「한」.
          */}
          <Link
            className="mcs-lang"
            href={`${path}?lang=${other}`}
            hrefLang={other}
            aria-label={t.langSwitchLabel}
          >
            <Languages size={13} strokeWidth={1.9} aria-hidden="true" />
            {t.langOther}
          </Link>

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
