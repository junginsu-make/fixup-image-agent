import type { LandingCopy } from "./landing-content";
import { TryItDemo } from "./try-it-demo";

export function TrySection({ t }: { t: LandingCopy }) {
  return (
    <section id="try" className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-head">
          <div>
            <p className="mcs-kicker">{t.tryKicker}</p>
            <h2 className="mcs-h2">{t.tryTitle}</h2>
            <p className="mcs-lead">{t.tryLead}</p>
          </div>
        </div>

        <TryItDemo
          presets={t.presets}
          logs={t.logs}
          refLabel={t.refLabel}
          promptLabel={t.promptLabel}
          resultLabel={t.resultLabel}
          qaLine={t.qaLine}
          disclaimer={t.demoDisclaimer}
          runIdle={t.runIdle}
          runRunning={t.runRunning}
          runDone={t.runDone}
        />
      </div>
    </section>
  );
}
