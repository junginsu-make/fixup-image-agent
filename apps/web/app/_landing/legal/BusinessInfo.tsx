import type { Locale } from "../landing-content";
import { businessLines } from "./business-info";

/**
 * 푸터의 사업자 정보 한 덩어리.
 *
 * 값은 전부 `business-info.ts` 에 있다. 여기에는 **어떻게 보일지만** 둔다.
 *
 * `<dl>` 로 짠 이유는 이름표와 값이 짝이기 때문이다. 화면 낭독기가 「상호,
 * 주식회사 픽스업」처럼 짝지어 읽어 준다. 눈으로 보는 사람에게는 `landing.css`
 * 가 가운뎃점으로 이어 붙여 한 문단처럼 보이게 한다.
 */
export function BusinessInfo({ locale }: { locale: Locale }) {
  return (
    <dl className="mcs-footer-business">
      {businessLines(locale).map((line) => (
        <div key={line.field}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}
