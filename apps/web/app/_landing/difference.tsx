import type { LandingCopy } from "./landing-content";

export function Difference({ t }: { t: LandingCopy }) {
  return (
    <section id="diff" className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-head">
          <div>
            <p className="mcs-kicker">{t.diffKicker}</p>
            <h2 className="mcs-h2">{t.diffTitle}</h2>
            <p className="mcs-lead">{t.diffLead}</p>
          </div>
        </div>

        {/* 좁은 화면에서는 표만 가로로 스크롤한다. 페이지 자체는 가로로 밀리지 않는다. */}
        <div className="mcs-table-wrap">
          <table className="mcs-table">
            <thead>
              <tr>
                <th scope="col">{t.diffColItem}</th>
                <th scope="col">{t.diffColA}</th>
                <th scope="col">{t.diffColB}</th>
                <th scope="col" className="mcs-col-mcs">
                  MCS
                </th>
              </tr>
            </thead>
            <tbody>
              {t.diffRows.map((row) => (
                <tr key={row.item}>
                  <th scope="row">{row.item}</th>
                  <td>{row.a}</td>
                  <td>{row.b}</td>
                  <td className="mcs-col-mcs">{row.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mcs-footnote">{t.diffFootnote}</p>
      </div>
    </section>
  );
}
