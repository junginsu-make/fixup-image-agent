import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizePhone, PHONE_CONSENT, PHONE_MAX_INPUT, phoneInputError, signupPhoneMetadata } from "../phone";

/**
 * **전화번호는 선택 항목이다**(2026-10-02 사용자 결정).
 *
 * 「휴대폰 또는 전화번호를 입력하는 칸… 선택적으로 입력하게 확실히 표시」. 적으면
 * 수집·이용 동의(선택)를 받아야 저장한다. 목적은 문의 응대와 서비스 운영 안내다.
 *
 * 형식 규칙은 DB(`public.profile_phone`)와 같아야 한다 — 다르면 앱이 받은 번호를 DB
 * 제약이 거절한다. 그래서 두 시험이 `phone-cases.json` 을 함께 쓴다.
 */
const { cases } = JSON.parse(readFileSync(join(__dirname, "phone-cases.json"), "utf8")) as { cases: [string, string | null][] };

describe("전화번호 형식", () => {
  it.each(cases)("%j → %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("너무 긴 입력은 받지 않는다", () => {
    expect(normalizePhone("0".repeat(PHONE_MAX_INPUT + 1))).toBeNull();
  });
});

describe("전화번호 입력 검사", () => {
  it("비워 두면 문제없다 — 선택 항목이다", () => {
    expect(phoneInputError("", false)).toBeNull();
    expect(phoneInputError("   ", false)).toBeNull();
  });

  it("형식이 틀리면 고칠 방법을 알려 준다", () => {
    expect(phoneInputError("010-12", true)).toContain("010-1234-5678");
  });

  it("번호를 적었는데 동의하지 않으면 저장하지 않는다", () => {
    expect(phoneInputError("010-1234-5678", false)).toContain("동의");
  });

  it("번호와 동의가 있으면 통과한다", () => {
    expect(phoneInputError("010-1234-5678", true)).toBeNull();
  });
});

describe("동의 안내 문구", () => {
  it("목적·항목·보유기간·거부할 수 있음을 모두 담는다", () => {
    expect(PHONE_CONSENT.purpose).toContain("문의");
    expect(PHONE_CONSENT.purpose).toContain("안내");
    expect(PHONE_CONSENT.purpose, "광고 목적으로 읽히면 안 된다").not.toMatch(/광고|마케팅|홍보/);
    expect(PHONE_CONSENT.items).toContain("전화번호");
    expect(PHONE_CONSENT.retention).toContain("탈퇴");
    expect(PHONE_CONSENT.refusal).toContain("가입");
  });
});

/**
 * 이메일 가입은 번호를 가입 정보(`raw_user_meta_data`)에 실어 보낸다. DB 트리거
 * (`profile_phone_from_signup`)는 `phone_consent` 가 true 일 때만 옮긴다.
 */
describe("가입 정보에 싣는 번호", () => {
  it("동의했으면 하이픈 꼴 번호와 동의 표시를 싣는다", () => {
    // 다른 서비스와 겹치지 않는 전용 이름이다(독립 리뷰 M3). DB 트리거는 이 키를 인증 정보에서 지운다.
    expect(signupPhoneMetadata("01012345678", true)).toEqual({ fixup_phone: "010-1234-5678", fixup_phone_consent: true });
  });

  it.each([
    ["", true],
    ["010-1234-5678", false],
    ["010-12", true],
  ])("%j · 동의 %s 이면 아무것도 싣지 않는다", (phone, consent) => {
    expect(signupPhoneMetadata(phone, consent)).toEqual({});
  });
});
