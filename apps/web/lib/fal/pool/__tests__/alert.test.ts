import { afterEach, describe, expect, it, vi } from "vitest";
import { falPoolAlertMail, sendFalPoolAlert } from "../alert";

/**
 * **관리자 메일**(보충 2026-10-01). 감시 스크립트와 같은 SMTP 해석, `ALERT_EMAIL` 로. 메일이 실패해도 던지지
 * 않는다 — 생성은 다른 계정으로 계속된다.
 */
const 환경 = {
  ALERT_EMAIL: "ops@example.invalid",
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "465",
  SMTP_USER: "bot@example.invalid",
  SMTP_PASS: "pw",
};

afterEach(() => vi.restoreAllMocks());

describe("falPoolAlertMail", () => {
  it("무엇이 났고 무엇을 하면 되는지 — 계정 이름과 fal 원문을 싣는다", () => {
    const mail = falPoolAlertMail({ kind: "locked", accountName: "fal-1 (ai.dev 계정)", detail: "User is locked" });
    expect(mail.subject).toBe("[FormWith] fal 계정 잔액이 바닥나 잠겼습니다 (fal-1 (ai.dev 계정))");
    expect(mail.text).toContain("「다시 확인」");
    expect(mail.text).toContain("fal 응답: User is locked");
  });

  it("**키 원문은 어디에도 없다** — 이름·원문 응답만 받는다", () => {
    const mail = falPoolAlertMail({ kind: "invalid", accountName: "a", detail: "invalid key credentials" });
    expect(Object.keys(mail)).toEqual(["subject", "text"]);
  });
});

describe("sendFalPoolAlert", () => {
  it("app.env 의 SMTP 로 ALERT_EMAIL 에 보낸다 — 465 면 secure, from 은 SMTP_USER", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: unknown[] = [];
    const options: unknown[] = [];
    await sendFalPoolAlert({ kind: "invalid", accountName: "a", detail: "x" }, 환경, (o) => {
      options.push(o);
      return { sendMail: async (mail) => { sent.push(mail); } };
    });
    expect(options).toEqual([{ host: "smtp.example.invalid", port: 465, secure: true, auth: { user: "bot@example.invalid", pass: "pw" } }]);
    expect(sent).toEqual([expect.objectContaining({ from: "bot@example.invalid", to: "ops@example.invalid" })]);
  });

  it("ALERT_EMAIL 이 비면 서버 기록만 남기고 보내지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const make = vi.fn();
    await sendFalPoolAlert({ kind: "locked", accountName: "a", detail: "x" }, { ...환경, ALERT_EMAIL: "" }, make);
    expect(make).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[fal-pool]"), expect.anything());
  });

  it("보내기가 실패해도 던지지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendFalPoolAlert({ kind: "locked", accountName: "a", detail: "x" }, 환경, () => ({
      sendMail: async () => { throw new Error("smtp down"); },
    }))).resolves.toBeUndefined();
  });
});
