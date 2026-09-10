import type { Metadata } from "next";
import Link from "next/link";
import { isLocalAuthBypass } from "../../lib/dev-auth";
import { getMembership } from "../../lib/membership/server";
import { ABOUT } from "../_landing/about-content";
import { LandingFooter } from "../_landing/cta-footer";
import { CONTENT, type Locale } from "../_landing/landing-content";
import { LandingHeader } from "../_landing/landing-header";
import "../_landing/landing.css";
import "../_landing/hero/hero.css";
import "./about.css";

/**
 * MCS 란 — 브랜드 소개.
 *
 * **첫 화면과 한 벌로 보여야 한다.** 그래서 새 디자인을 만들지 않고
 * `landing.css` 의 토큰과 클래스를 그대로 쓴다(`.mcs-section` · `.mcs-h2` ·
 * `.mcs-lead` …). `hero.css` 까지 함께 부르는 이유는 그 파일이 `.mcs-dark`
 * 에서 라이트 토큰을 검은 바탕용으로 다시 정하기 때문이다 — 안 부르면 이
 * 화면만 아이보리로 뜬다. 이 화면에만 있는 모양새는 `about.css` 에 둔다.
 *
 * **결과물 사진은 싣지 않는다.** 첫 화면이 이미 「넣은 것 → 나온 것」을 보여
 * 준다. 같은 것을 또 보여 주면 이 화면이 하려던 이야기가 묻힌다.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  const a = ABOUT[lang === "en" ? "en" : "ko"];
  return {
    title: a.metaTitle,
    description: a.metaDescription,
    openGraph: { title: `${a.metaTitle} — MCS`, description: a.metaDescription },
  };
}

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];
  const a = ABOUT[locale];

  // 첫 화면과 같은 이유로 로그인 상태를 본다 — 모르면 로그인한 사람에게도
  // 「로그인」만 보이고, 눌러도 세션이 있어 스튜디오로 튕겨 들어간다.
  const signedIn = await getMembership().then(Boolean);

  return (
    <div className="mcs mcs-dark about">
      <LandingHeader
        t={t}
        locale={locale}
        localMode={isLocalAuthBypass}
        signedIn={signedIn}
        path="/about"
      />

      <main>
        <section className="mcs-section about-hero">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.kicker}</p>
            <h1 className="mcs-h1">
              <span>{a.h1a}</span>
              <span>{a.h1b}</span>
            </h1>
            <p className="mcs-lead about-measure">{a.lead}</p>

            <div className="about-two">
              <span className="about-cell">
                <b>1</b>
                {a.inputOne}
              </span>
              <span className="about-cell">
                <b>2</b>
                {a.inputTwo}
              </span>
              <span className="about-rest">— {a.inputRest}</span>
            </div>
          </div>
        </section>

        <section className="mcs-section mcs-ink-section">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.eveningKicker}</p>
            <h2 className="mcs-h2 about-measure">{a.eveningTitle}</h2>

            <div className="about-prose about-measure">
              {a.eveningBody.map(([head, strong, tail]) => (
                <p key={head}>
                  {head}
                  {strong ? <em>{strong}</em> : null}
                  {tail}
                </p>
              ))}
            </div>

            <p className="about-pull about-measure">
              {a.eveningPullA}
              <br />
              {a.eveningPullB}
            </p>
          </div>
        </section>

        <section className="mcs-section">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.offKicker}</p>
            <h2 className="mcs-h2 about-measure">{a.offTitle}</h2>
            <p className="mcs-lead about-measure">{a.offLead}</p>

            {/*
              지워진 일 왼쪽, 대신 오는 것 오른쪽. 취소선이 이 절의 유일한
              장치다 — 「덜어 냈다」를 글로 설명하지 않고 획으로 보여 준다.
            */}
            <ul className="about-lifted">
              {a.lifted.map((item) => (
                <li key={item.gone}>
                  <span className="about-gone">{item.gone}</span>
                  <span className="about-instead">
                    {item.instead[0]}
                    <b>{item.instead[1]}</b>
                    {item.instead[2]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mcs-section mcs-ink-section">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.walkKicker}</p>
            <h2 className="mcs-h2 about-measure">{a.walkTitle}</h2>
            <p className="mcs-lead about-measure">{a.walkLead}</p>

            <ol className="about-steps">
              {a.steps.map((step) => (
                <li key={step.n} data-human={step.human ? "true" : undefined}>
                  <span className="about-n">{step.n}</span>
                  <span className="about-step-title">{step.title}</span>
                  <span className="about-step-desc">{step.desc}</span>
                  <span className="about-by">{step.by}</span>
                </li>
              ))}
            </ol>

            <p className="about-note about-measure">
              <b>{a.walkNoteStrong}</b>
              {a.walkNoteRest}
            </p>
          </div>
        </section>

        <section className="mcs-section">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.feelKicker}</p>
            <h2 className="mcs-h2 about-measure">{a.feelTitle}</h2>
            <p className="mcs-lead about-measure">{a.feelLead}</p>

            <div className="about-moments">
              {a.moments.map((moment) => (
                <div className="about-moment" key={moment.when}>
                  <span className="about-when">{moment.when}</span>
                  <span className="about-now">{moment.now}</span>
                  <p className="about-why">{moment.why}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mcs-section">
          <div className="mcs-shell">
            <p className="mcs-kicker">{a.keepKicker}</p>
            <h2 className="mcs-h2 about-measure">{a.keepTitle}</h2>

            <ul className="about-vows">
              {a.vows.map((vow) => (
                <li key={vow.title}>
                  <b>{vow.title}</b>
                  <p>{vow.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mcs-section mcs-deep-section">
          <div className="mcs-shell">
            <h2 className="mcs-h2 mcs-h2--cta about-measure">
              {a.endA}
              <br />
              {a.endB}
            </h2>
            <p className="mcs-lead about-measure">{a.endLead}</p>

            <div className="about-cta">
              <Link className="mcs-btn mcs-btn--primary" href="/demo">
                {a.endPrimary}
              </Link>
              <Link className="mcs-btn mcs-btn--ghost" href="/signup">
                {a.endSecondary}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter t={t} />
    </div>
  );
}
