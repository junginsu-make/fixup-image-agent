import { describe, expect, it } from "vitest";
import { signupResult } from "../signup-result";

describe("signup result", () => {
  it("does not claim mail was sent for an existing confirmed account", () => {
    expect(signupResult({ user: { identities: [] }, session: null }, null).kind).toBe("existing");
  });

  it.each(["user_already_exists", "email_exists"])("recognizes %s before email errors", (code) => {
    expect(signupResult(null, { code, message: "Email already registered" }).kind).toBe("existing");
  });

  it("keeps unconfirmed accounts on the confirmation path", () => {
    expect(signupResult({ user: { identities: [{}] }, session: null }, null).kind).toBe("confirmation");
  });

  it("does not mistake an invited user with hidden identities for a duplicate", () => {
    expect(signupResult({ user: { identities: [], invited_at: "2026-09-29" }, session: null }, null).kind).toBe("confirmation");
  });

  it("handles confirmation-disabled signups without asking for mail", () => {
    expect(signupResult({ user: { identities: [{}] }, session: {} }, null).kind).toBe("authenticated");
  });

  it("does not invent delivery success from an empty response", () => {
    expect(signupResult({ user: null, session: null }, null).kind).toBe("error");
  });

  it("keeps invalid emails out of the mail outage dialog", () => {
    const result = signupResult(null, { code: "email_address_invalid", message: "Email address is invalid" });
    expect(result.kind).toBe("error");
    expect(result.message).toContain("이메일 주소");
  });

  it("reports the email rate limit without promising next-day recovery", () => {
    const result = signupResult(null, { status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" });
    expect(result.kind).toBe("mail-error");
    expect(result.message).toContain("발송 요청이 많아");
    expect(result.message).not.toMatch(/내일|하루|500통/);
  });

  it("distinguishes a database failure from mail delivery failure", () => {
    expect(signupResult(null, { status: 500, code: "unexpected_failure", message: "Database error saving new user" }).kind).toBe("error");
    expect(signupResult(null, { status: 500, code: "unexpected_failure", message: "Error sending confirmation email" }).kind).toBe("mail-error");
  });

  it("handles CAPTCHA and request throttling separately", () => {
    expect(signupResult(null, { code: "captcha_failed", message: "captcha failed" }).message).toContain("보안 확인");
    expect(signupResult(null, { code: "over_request_rate_limit", message: "rate limit" }).kind).toBe("error");
  });
});
