import type { LandingCopy } from "./landing-content";
import { ReferenceCompare } from "./reference-compare";

export function Compare({ t }: { t: LandingCopy }) {
  return (
    <section className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-compare">
          <div>
            <p className="mcs-kicker">{t.baKicker}</p>
            <h2 className="mcs-h2 mcs-h2--compare">{t.baTitle}</h2>
            <p className="mcs-lead">{t.baLead}</p>

            <div className="mcs-manuscript">
              <b>{t.baManuscript}</b>
              <dl>
                {t.manuscript.map((row) => (
                  <div key={row.field}>
                    <dt>{row.field}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="mcs-hint">{t.baHint}</p>
          </div>

          <ReferenceCompare
            leftLabel={t.baLeftLabel}
            rightLabel={t.baRightLabel}
            leftAlt={t.baLeftLabel}
            rightAlt={t.g1title}
            ariaLabel={t.baHint}
          />
        </div>
      </div>
    </section>
  );
}
