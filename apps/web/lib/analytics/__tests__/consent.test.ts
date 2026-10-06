import { describe, expect, it } from "vitest";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, clearCookie, consentFrom, readCookie, setCookie, validVisitorId,
} from "../consent";

const ID = "5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";

describe("readCookie", () => {
  it("이름이 정확히 같은 것만, 앞뒤 공백 무시, 인코딩 풀기", () => {
    const header = `sb-x-auth-token=abc; ${CONSENT_COOKIE}=1;  ${VISITOR_COOKIE}=${encodeURIComponent(ID)}; fx_consent_old=0`;
    expect(readCookie(header, CONSENT_COOKIE)).toBe("1");
    expect(readCookie(header, VISITOR_COOKIE)).toBe(ID);
    expect(readCookie(header, "missing")).toBeNull();
    expect(readCookie(null, CONSENT_COOKIE)).toBeNull();
  });
  it("값에 = 가 들어 있어도 자르지 않는다, 깨진 인코딩은 null", () => {
    expect(readCookie("a=b=c", "a")).toBe("b=c");
    expect(readCookie("a=%E0%A4%A", "a")).toBeNull();
  });
});

describe("consentFrom", () => {
  it.each([["1", "yes"], ["0", "no"], [null, "unset"], ["yes", "unset"], ["", "unset"]])("%s → %s", (value, expected) =>
    expect(consentFrom(value)).toBe(expected));
});

describe("validVisitorId — 서버가 만든 모양만 믿는다", () => {
  it("UUID v4 는 소문자로", () => expect(validVisitorId(ID.toUpperCase())).toBe(ID));
  it.each([null, "", "abc", "5b1f0c1e-2a3b-1c5d-8e9f-0a1b2c3d4e5f", `${ID}x`, "' or 1=1 --"])("버림: %s", (value) =>
    expect(validVisitorId(value)).toBeNull());
});

describe("setCookie / clearCookie", () => {
  it("동의 번호 쿠키 — HttpOnly·Lax·Secure·365일", () => {
    expect(setCookie(VISITOR_COOKIE, ID, { secure: true, httpOnly: true, days: ANALYTICS_COOKIE_DAYS })).toBe(
      `fx_vid=${ID}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`,
    );
  });
  it("동의 여부 쿠키 — 화면이 읽어야 하므로 HttpOnly 아님, http 면 Secure 없음", () => {
    expect(setCookie(CONSENT_COOKIE, "0", { secure: false, httpOnly: false, days: 365 })).toBe(
      "fx_consent=0; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
  it("지우기는 Max-Age=0", () => {
    expect(clearCookie(VISITOR_COOKIE, true)).toBe("fx_vid=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure");
  });
});
