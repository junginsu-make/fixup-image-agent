import type { Metadata } from "next";
import { isLocalAuthBypass } from "../lib/dev-auth";
import { getMembership } from "../lib/membership/server";
import { HOME_COPY, KEYWORDS } from "../lib/seo/copy";
import { pageMetadata } from "../lib/seo/metadata";
import { listPublicShowcase } from "./api/showcase/store";
import { LandingFooter } from "./_landing/cta-footer";
import { Difference } from "./_landing/difference";
import { FeaturesSection } from "./_landing/features-section";
import { BackToTop } from "./_landing/hero/BackToTop";
import { ClaimStrip } from "./_landing/hero/ClaimStrip";
import { HeroStage } from "./_landing/hero/HeroStage";
import { KeyMessage } from "./_landing/hero/KeyMessage";
import { slidesFromShowcase } from "./_landing/hero/slides";
import { CONTENT, type Locale } from "./_landing/landing-content";
import { LandingHeader } from "./_landing/landing-header";
import { HomeLinks } from "./_landing/home-links";
import { StructuredData } from "./_landing/structured-data";
import { TrySection } from "./_landing/try-section";
import { readSignupGate } from "./_landing/signup-gate";
import { SignupRequiredModal } from "./_landing/signup-required-modal";
import "./_landing/landing.css";
import "./_landing/hero/hero.css";
import "./features/features.css";

/**
 * 첫 화면의 검색 정보. 대표 주소는 언어별로 `/` 또는 `/?lang=en` 하나다 —
 * `/?signup=required&next=…` 로 열려도 대표 주소는 `/` 다(계획 2026-10-06 seo-search-registration).
 * 대표 주소·언어 연결·og:url 은 메타데이터가 아니라 `<HomeLinks />` 가 낸다(Next 가 `/` 의 조회 값을 버림).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = lang === "en" ? "en" : "ko";
  return {
    ...pageMetadata({
      path: "/",
      title: HOME_COPY[locale].title,
      description: HOME_COPY[locale].description,
      absoluteTitle: true,
      locale,
      selfLinks: false,
    }),
    ...(locale === "ko" ? { keywords: [...KEYWORDS] } : {}),
  };
}

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
  searchParams: Promise<{ lang?: string; signup?: string | string[]; next?: string | string[] }>;
}) {
  const { lang, signup, next } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];
  /*
    **비회원이 회원 화면을 열면 여기로 온다**(`middleware.ts`, 설계 §3.5) —
    `/?signup=required&next=/create`. 로그인한 사람에게는 띄우지 않는다(아래
    `!signedIn`): 뒤로 가기·즐겨찾기로 이 주소를 다시 열 수 있다.
  */
  const gate = readSignupGate({ signup, next });

  // 첫 화면이 로그인 상태를 알아야 한다. 모르면 로그인한 사람에게도
  // 「로그인」만 보이고, 눌러도 세션이 있어 스튜디오로 튕겨 들어간다.
  const [signedIn, showcase] = await Promise.all([
    getMembership().then(Boolean),
    listPublicShowcase(),
  ]);

  return (
    <div className="mcs mcs-dark">
      <StructuredData />
      <HomeLinks locale={locale} />
      {/*
        상단바가 히어로 **위에 얹힌다.** 자리를 차지하지 않으므로 첫 화면이
        온전히 한 화면을 쓰고, 경계선도 없어 메뉴와 히어로가 한 덩어리로 읽힌다.
      */}
      <LandingHeader t={t} locale={locale} localMode={isLocalAuthBypass} signedIn={signedIn} />

      <main>
        {/*
          **주 제목은 화면에 안 보인다**(계획 2026-10-07 seo-keyword-pages). 캐러셀이 첫 화면을
          다 쓰므로 보이는 제목을 둘 자리가 없다. 검색엔진과 읽기 도구는 이 줄로 화면의 주제를
          안다. 말은 `<title>` 과 같다 — 숨겨서 다른 말을 하는 글이 아니다.
        */}
        <h1 className="sr-only">{t.homeH1}</h1>
        <HeroStage slides={slidesFromShowcase(showcase)} />
        <KeyMessage locale={locale} />
        <ClaimStrip locale={locale} />
        <TrySection t={t} />
        <Difference t={t} />
        <FeaturesSection t={t} />
      </main>

      <LandingFooter t={t} locale={locale} />

      {/* 바닥에 닿았을 때만 나온다. 첫 화면까지 올라갈 길을 남긴다. */}
      <BackToTop />

      {gate.open && !signedIn ? (
        <SignupRequiredModal next={gate.next} closeHref={locale === "en" ? "/?lang=en" : "/"} />
      ) : null}
    </div>
  );
}
