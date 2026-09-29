import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withdrawNotice } from "../withdraw-notice";
import { CS_EMAIL } from "../../../lib/cs/contact";
import { TERMS_DOC } from "../../_landing/legal/documents";

/**
 * **탈퇴 전에 알려야 할 것**(2026-09-29).
 *
 * 약관 제11조는 「탈퇴 전에 잔여 크레딧, 환불 방법, 저장 자료의 삭제와
 * 다운로드 방법을 안내」한다고 약속한다. 그런데 탈퇴 카드는 「남은 크레딧도
 * 함께 사라집니다」라고만 했다. 쓰지 않은 **구매 크레딧은 환불 대상**인데
 * (약관 제7조), 그 말 없이 「사라진다」에 동의받으면 환불받을 길을 모른 채
 * 탈퇴하게 된다.
 */

describe("탈퇴 안내 문장", () => {
  it("남은 크레딧이 있으면 수와 단위를 말하고 환불 신청처를 알린다", () => {
    const 글 = withdrawNotice({ availableCredits: 42, unit: "크레딧" });

    expect(글).toContain("42크레딧");
    expect(글).toContain("구매 크레딧");
    expect(글).toContain("환불");
    expect(글).toContain(CS_EMAIL);
  });

  /** 약관 제7조: 그 달 구독 크레딧을 한 번도 안 썼으면 그 달 구독료도 환불된다. 빠뜨리면 안 된다. */
  it("쓰지 않은 구독의 환불도 알린다", () => {
    expect(withdrawNotice({ availableCredits: 10, unit: "크레딧" })).toContain("한 번도 쓰지 않은 구독");
  });

  /** 약관에 없는 신청 기한처럼 읽히면 안 된다. 권하는 말로 적는다. */
  it("탈퇴 전에만 환불된다고 말하지 않는다", () => {
    const 글 = withdrawNotice({ availableCredits: 10, unit: "크레딧" });

    expect(글).not.toContain("탈퇴하기 전에 ai.dev");
    expect(글).toContain("권합니다");
  });

  it("옛 기준 회원에게는 옛 단위로 말한다", () => {
    expect(withdrawNotice({ availableCredits: 3, unit: "장" })).toContain("3장");
  });

  /** 0 이면 사라질 것도, 환불받을 것도 없다. 말하면 헷갈린다. */
  it("남은 크레딧이 없으면 크레딧과 환불 이야기를 하지 않는다", () => {
    const 글 = withdrawNotice({ availableCredits: 0, unit: "크레딧" });

    expect(글).not.toContain("환불");
    expect(글).not.toContain("남은 크레딧");
  });

  it("작업물을 탈퇴 전에 내려받으라고 알린다", () => {
    expect(withdrawNotice({ availableCredits: 0, unit: "크레딧" })).toContain("내려받아");
  });

  it("되돌릴 수 없다는 것과 기록 보관을 알린다", () => {
    const 글 = withdrawNotice({ availableCredits: 0, unit: "크레딧" });

    expect(글).toContain("되돌릴 수 없습니다");
    expect(글).toContain("결제·크레딧 기록은 법령에 따라 보관됩니다");
  });
});

describe("약관이 약속한 것을 다 알린다", () => {
  it("약관 제11조의 약속이 그대로 있다", () => {
    expect(TERMS_DOC.body).toContain("탈퇴 전에 잔여 크레딧, 환불 방법, 저장 자료의 삭제와 다운로드 방법을 안내");
  });

  it("안내 문장이 그 넷을 모두 담는다", () => {
    const 글 = withdrawNotice({ availableCredits: 5, unit: "크레딧" });

    expect(글, "잔여 크레딧").toContain("5크레딧");
    expect(글, "환불 방법").toContain(CS_EMAIL);
    expect(글, "삭제").toContain("사라집니다");
    expect(글, "다운로드 방법").toContain("라이브러리에서 내려받아");
  });
});

describe("탈퇴 카드", () => {
  const 카드 = readFileSync(join(__dirname, "..", "withdraw-card.tsx"), "utf8");

  it("이 문장을 쓴다", () => {
    expect(카드).toContain("withdrawNotice(");
  });

  /** 단위를 손으로 적으면 전환한 회원에게 「장」으로 보인다(2026-09-22 에 실제로 났다). */
  it("단위를 회원 기준에서 가져온다", () => {
    expect(카드).toContain("useCreditUnit()");
    expect(카드).not.toMatch(/\}장/);
  });
});
