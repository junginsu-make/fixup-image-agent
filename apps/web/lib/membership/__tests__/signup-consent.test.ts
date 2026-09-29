import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNUP_TERMS_VERSION, signupConsentError, signupConsentMetadata } from "../signup-consent";
import { TERMS_DOC } from "../../../app/_landing/legal/documents";

/**
 * **가입할 때 약관 동의와 만 14세 확인을 받는다**(2026-09-29).
 *
 * ── 왜 ─────────────────────────────────────────────────────
 *
 * 약관 제3조는 「약관에 동의하고 가입을 신청」한다고 적고, 처리방침은 만 14세
 * 이상만 받는다고 적는다. 그런데 가입 화면에는 둘 다 없었다. 동의를 안 받은
 * 약관은 회원에게 적용하기 어렵다.
 *
 * ── 개인정보는 「동의」가 아니라 「안내」 ─────────────────────
 *
 * 처리방침은 가입 정보를 **계약 이행**(개인정보 보호법 제15조 제1항 제4호)을
 * 근거로 처리한다고 적는다. 그 근거는 동의가 필요 없다. 그래서 체크 칸은
 * 둘(만 14세 · 약관)이고, 처리방침은 읽을 수 있게 **안내**만 한다
 * (2026-09-29 사용자 결정).
 */

describe("동의 확인", () => {
  it("만 14세 확인이 없으면 막는다", () => {
    expect(signupConsentError({ ageConfirmed: false, termsAgreed: true })).toContain("만 14세");
  });

  it("약관 동의가 없으면 막는다", () => {
    expect(signupConsentError({ ageConfirmed: true, termsAgreed: false })).toContain("이용약관");
  });

  it("둘 다 없으면 만 14세부터 말한다", () => {
    expect(signupConsentError({ ageConfirmed: false, termsAgreed: false })).toContain("만 14세");
  });

  it("둘 다 있으면 통과한다", () => {
    expect(signupConsentError({ ageConfirmed: true, termsAgreed: true })).toBeNull();
  });
});

describe("동의 기록", () => {
  /**
   * 다툼이 나면 「언제, 어느 판에」 동의했는지가 증거다.
   *
   * **시각은 브라우저가 찍지 않는다**(2026-09-29 독립 리뷰). 브라우저 시계는
   * 틀릴 수 있다. 동의는 가입과 같은 순간이므로, 서버가 찍는 가입 시각
   * (`auth.users.created_at`)이 동의 시각이다.
   */
  it("약관 판과 만 14세 확인을 남기고, 시각은 서버에 맡긴다", () => {
    expect(signupConsentMetadata()).toEqual({
      terms_version: SIGNUP_TERMS_VERSION,
      age_14_confirmed: true,
    });
  });

  /**
   * **게시한 약관이 바뀌면 이 값도 바뀌어야 한다.** 안 바꾸면 새 약관에 동의한
   * 사람이 옛 판에 동의한 것으로 기록된다.
   */
  it("기록하는 판이 게시된 약관의 시행일과 같다", () => {
    const [, 년, 월, 일] = TERMS_DOC.body.match(/시행일: (\d{4})년 (\d{1,2})월 (\d{1,2})일/) ?? [];

    expect(년, "약관에서 시행일을 못 읽었다").toBeTruthy();
    expect(SIGNUP_TERMS_VERSION).toBe(`${년}-${월.padStart(2, "0")}-${일.padStart(2, "0")}`);
  });
});

describe("가입 화면", () => {
  const 화면 = readFileSync(join(__dirname, "..", "..", "..", "app", "signup", "page.tsx"), "utf8");

  it("체크 칸이 둘이다", () => {
    expect(화면.match(/type="checkbox"/g) ?? []).toHaveLength(2);
  });

  /**
   * **새 탭으로 연다.** 같은 탭에서 열면 적던 이름·비밀번호가 사라진다.
   * 첫 화면의 `#terms`·`#privacy` 주소는 그 문서를 바로 연다(`LegalLinks`).
   */
  it("약관과 처리방침을 새 탭에서 읽을 수 있다", () => {
    expect(화면).toContain('href="/#terms"');
    expect(화면).toContain('href="/#privacy"');
    expect(화면.match(/target="_blank"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  /** 부르기만 하고 결과로 멈추지 않으면 막은 것이 아니다. 멈추는 줄까지 본다. */
  it("동의가 빠지면 가입을 보내기 전에 멈춘다", () => {
    const 멈춤 = 화면.search(
      /const consentProblem = signupConsentError\(\{ ageConfirmed, termsAgreed \}\);\s*if \(consentProblem\) return setError\(consentProblem\);/,
    );
    const 보냄 = 화면.indexOf("supabase.auth.signUp(");

    expect(멈춤, "동의를 확인하고 멈추는 줄이 없다").toBeGreaterThan(0);
    expect(멈춤, "가입을 보낸 뒤에 확인하면 막지 못한다").toBeLessThan(보냄);
  });

  it("두 체크 칸이 확인하는 값에 묶여 있다", () => {
    expect(화면).toContain("checked={ageConfirmed}");
    expect(화면).toContain("checked={termsAgreed}");
  });

  /** 미리 체크해 두면 동의를 받은 것이 아니다. */
  it("두 칸 모두 비어 있는 채로 시작한다", () => {
    expect(화면).toContain("const [ageConfirmed, setAgeConfirmed] = React.useState(false);");
    expect(화면).toContain("const [termsAgreed, setTermsAgreed] = React.useState(false);");
  });

  /** 화면 낭독기 사용자에게 새 탭이 열린다는 것을 알린다. */
  it("새 탭으로 열린다고 알린다", () => {
    expect(화면.match(/새 탭에서 열림/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("동의 기록을 가입 정보에 담는다", () => {
    expect(화면).toContain("...signupConsentMetadata(");
  });
});
