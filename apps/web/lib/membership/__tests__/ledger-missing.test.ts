import { describe, expect, it } from "vitest";
import { ledgerMissing } from "../usage-row";

/**
 * **플래그를 켜고 마이그레이션을 안 돌리면 화면이 통째로 죽는다.**
 *
 * `getUsageSummary` 는 `CREDIT_LEDGER=1` 이면 `credit_summary` 를 부른다. 그
 * 함수가 아직 DB 에 없으면 던지는데, 이 값을 받는 자리가 셋이다 —
 * `/settings`, `/guide/credits`, 그리고 **`StudioLayout`**. 마지막 하나가
 * 만들기 화면 전부를 감싸므로, 순서를 한 번 어기면 회원이 아무것도 못 연다.
 *
 * `docs/DEPLOY.md` 가 「표부터 고치고 배포한다」고 적어 두었지만, 그건 사람이
 * 지키는 순서다. 지켜지지 않았을 때 **화면이 죽는 대신 옛 숫자로 버티는** 것이
 * 낫다 — 그 서버에는 아직 전환한 계정이 하나도 없으므로 옛 숫자가 맞는 답이다.
 *
 * ── 아무 오류에나 떨어지지는 않는다 ────────────────────────────
 *
 * 전환한 계정에서 `credit_summary` 가 **잠깐** 실패한 것이라면, 옛 길은
 * `monthly_quota` 기준의 **뜻이 다른 숫자**를 돌려준다. 그걸 잔액이라고 보여
 * 주면 조용히 거짓말을 하는 것이다. 그래서 「함수가 없다」는 두 코드에만
 * 떨어진다 — PostgREST 의 `PGRST202`(스키마 캐시에 없음)와 PostgreSQL 의
 * `42883`(undefined_function).
 */
describe("장부가 아직 안 깔린 서버인가", () => {
  it("함수가 없다는 오류에만 옛 길로 떨어진다", () => {
    expect(ledgerMissing({ code: "PGRST202" })).toBe(true);
    expect(ledgerMissing({ code: "42883" })).toBe(true);
  });

  it("그 밖의 오류는 떨어지지 않는다 — 옛 숫자는 뜻이 다르다", () => {
    expect(ledgerMissing({ code: "57014" })).toBe(false); // 질의 시간 초과
    expect(ledgerMissing({ code: "42501" })).toBe(false); // 권한 없음
    expect(ledgerMissing({ code: "" })).toBe(false);
    expect(ledgerMissing({})).toBe(false);
    expect(ledgerMissing(null)).toBe(false);
  });
});
