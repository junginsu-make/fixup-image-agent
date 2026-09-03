import type { LandingCopy } from "./landing-content";

export function HowItWorks({ t }: { t: LandingCopy }) {
  return (
    <section id="how" className="mcs-section mcs-ink-section">
      <div className="mcs-shell">
        <div>
          <p className="mcs-kicker">{t.howKicker}</p>
          <h2 className="mcs-h2">{t.howTitle}</h2>
          <p className="mcs-lead">{t.howLead}</p>
        </div>

        <div className="mcs-cards mcs-cards--four">
          {t.loop.map((item) => (
            <article className="mcs-loop-card" key={item.n}>
              <b>{item.n}</b>
              <h3>{item.name}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>

        <p className="mcs-loop-back">
          <span aria-hidden="true">↺</span>
          {t.loopBack}
        </p>

        <div className="mcs-guards">
          {t.guards.map((guard) => (
            <article className="mcs-guard" key={guard.title}>
              <p className="mcs-kicker">{guard.kicker}</p>
              <h3>{guard.title}</h3>
              <p>{guard.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
