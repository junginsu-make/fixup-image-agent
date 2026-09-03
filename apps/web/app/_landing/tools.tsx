import type { LandingCopy } from "./landing-content";

export function Tools({ t }: { t: LandingCopy }) {
  return (
    <section id="tools" className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-head">
          <div>
            <p className="mcs-kicker">{t.toolsKicker}</p>
            <h2 className="mcs-h2">{t.toolsTitle}</h2>
            <p className="mcs-lead">{t.toolsLead}</p>
          </div>
        </div>

        <div className="mcs-cards">
          {t.tools.map((tool) => (
            <article className="mcs-card" key={tool.route}>
              <span className="mcs-route">{tool.route}</span>
              <h3>{tool.name}</h3>
              <p>{tool.desc}</p>
              <span>{tool.tag}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
