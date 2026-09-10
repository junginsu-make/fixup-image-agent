import { isLocalAuthBypass } from "../lib/dev-auth";
import { getMembership } from "../lib/membership/server";
import { listPublicShowcase } from "./api/showcase/store";
import { LandingFooter } from "./_landing/cta-footer";
import { Difference } from "./_landing/difference";
import { BackToTop } from "./_landing/hero/BackToTop";
import { ClaimStrip } from "./_landing/hero/ClaimStrip";
import { HeroStage } from "./_landing/hero/HeroStage";
import { KeyMessage } from "./_landing/hero/KeyMessage";
import { slidesFromShowcase } from "./_landing/hero/slides";
import { CONTENT, type Locale } from "./_landing/landing-content";
import { LandingHeader } from "./_landing/landing-header";
import { TrySection } from "./_landing/try-section";
import "./_landing/landing.css";
import "./_landing/hero/hero.css";

/**
 * 첫 화면.
 *
 * 차례는 **말로 듣고 → 눌러 보고 → 견주는** 순이다.
 * 캐러셀 · 슬로건 · 레퍼런스↔결과 · 직접 해보기 · 차별점.
 *
 * 언어는 `?lang=` 로 받아 서버에서 렌더한다. 클라이언트 상태로 두면 검색엔진이
 * 한 언어만 보게 되고, 첫 화면이 자바스크립트를 기다려야 한다.
 *
 * 캐러셀에 무엇을 걸지는 **관리자가 고른다**(`/admin` 의 쇼케이스). 회원이 만든
 * 것을 전부 자동으로 걸면 출시 전 기획물이 즉시 공개된다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];

  // 첫 화면이 로그인 상태를 알아야 한다. 모르면 로그인한 사람에게도
  // 「로그인」만 보이고, 눌러도 세션이 있어 스튜디오로 튕겨 들어간다.
  const [signedIn, showcase] = await Promise.all([
    getMembership().then(Boolean),
    listPublicShowcase(),
  ]);

  return (
    <div className="mcs mcs-dark">
      {/*
        상단바가 히어로 **위에 얹힌다.** 자리를 차지하지 않으므로 첫 화면이
        온전히 한 화면을 쓰고, 경계선도 없어 메뉴와 히어로가 한 덩어리로 읽힌다.
      */}
      <LandingHeader t={t} locale={locale} localMode={isLocalAuthBypass} signedIn={signedIn} />

      <main>
        <HeroStage slides={slidesFromShowcase(showcase)} />
        <KeyMessage locale={locale} />
        <ClaimStrip locale={locale} />
        <TrySection t={t} />
        <Difference t={t} />
      </main>

      <LandingFooter t={t} />

      {/* 바닥에 닿았을 때만 나온다. 첫 화면까지 올라갈 길을 남긴다. */}
      <BackToTop />
    </div>
  );
}
