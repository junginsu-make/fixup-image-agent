import { isLocalAuthBypass } from "../lib/dev-auth";
import { CallToAction, LandingFooter } from "./_landing/cta-footer";
import { Compare } from "./_landing/compare";
import { Difference } from "./_landing/difference";
import { Gallery } from "./_landing/gallery";
import { Hero } from "./_landing/hero";
import { HowItWorks } from "./_landing/how-it-works";
import { CONTENT, type Locale } from "./_landing/landing-content";
import { LandingHeader } from "./_landing/landing-header";
import { Tools } from "./_landing/tools";
import { TrySection } from "./_landing/try-section";
import "./_landing/landing.css";

/**
 * 랜딩페이지.
 *
 * 언어는 `?lang=` 로 받아 서버에서 렌더한다. 클라이언트 상태로 두면 검색엔진이
 * 한 언어만 보게 되고, 첫 화면이 자바스크립트를 기다려야 한다.
 *
 * 움직이는 부분만 클라이언트 컴포넌트다 — 생성 콘솔 · 비교 슬라이더 ·
 * 직접 해보기 데모 · 모션 카드. 나머지는 전부 서버에서 만든다.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];

  return (
    <div className="mcs">
      <LandingHeader t={t} locale={locale} localMode={isLocalAuthBypass} />
      <main>
        <Hero t={t} />
        <Gallery t={t} />
        <Compare t={t} />
        <Tools t={t} />
        <HowItWorks t={t} />
        <TrySection t={t} />
        <Difference t={t} />
        <CallToAction t={t} localMode={isLocalAuthBypass} />
      </main>
      <LandingFooter t={t} />
    </div>
  );
}
