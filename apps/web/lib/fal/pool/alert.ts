import nodemailer from "nodemailer";

/**
 * fal 계정에 탈이 났을 때 관리자에게 메일 한 통(보충 2026-10-01).
 *
 * 감시 스크립트(`deploy/ec2/monitor.sh`)와 같은 길이다 — `app.env` 의 SMTP 계정으로 `ALERT_EMAIL` 에 보낸다.
 * 해석도 같다: secure = `SMTP_SECURE === "true" || port === 465`, from = `SMTP_FROM || SMTP_USER`
 * (`lib/email/approval.ts`). 운영 `app.env` 는 값을 큰따옴표로 감싸 두지만 systemd 가 벗겨서 넘기므로
 * `process.env` 에는 따옴표가 없다.
 *
 * - 같은 사건은 한 번: 「상태가 바뀐 첫 호출」에만 부른다(`fal_account_mark` 가 참일 때)
 * - **던지지 않는다.** 메일이 실패해도 생성은 다른 계정으로 계속된다. 실패는 서버 기록에만
 * - 한도 걸림(429)은 보내지 않는다 — 잠깐이고 자주 생긴다
 */

export type FalPoolAlertKind = "locked" | "invalid" | "decrypt_failed" | "master_key_missing";

export interface FalPoolAlert {
  kind: FalPoolAlertKind;
  accountName: string;
  detail: string;
}

const TITLE: Record<FalPoolAlertKind, string> = {
  locked: "fal 계정 잔액이 바닥나 잠겼습니다",
  invalid: "fal 계정 키가 거절됐습니다",
  decrypt_failed: "fal 계정 키를 풀지 못했습니다",
  master_key_missing: "fal 계정 풀이 꺼져 있습니다(서버 열쇠 없음)",
};

const NEXT_STEP: Record<FalPoolAlertKind, string> = {
  locked: "fal 대시보드에서 잔액을 충전한 뒤 관리자 화면 「fal 계정」에서 「다시 확인」을 눌러 주세요. 그동안 새 생성은 다른 계정으로 갑니다.",
  invalid: "fal 에서 새 키를 만들어 관리자 화면 「fal 계정」에서 키를 바꿔 주세요. 그동안 새 생성은 다른 계정으로 갑니다.",
  decrypt_failed: "서버의 FAL_KEY_ENCRYPTION_SECRET 이 바뀌었을 수 있습니다. 관리자 화면 「fal 계정」에서 키를 다시 넣어 주세요.",
  master_key_missing: "/etc/fixup-image-agent/app.env 에 FAL_KEY_ENCRYPTION_SECRET 을 넣고 서비스를 다시 시작해 주세요. 그동안은 FAL_KEY 하나로 만듭니다.",
};

export function falPoolAlertMail(event: FalPoolAlert): { subject: string; text: string } {
  const who = event.accountName ? ` (${event.accountName})` : "";
  return {
    subject: `[FormWith] ${TITLE[event.kind]}${who}`,
    text: [`${TITLE[event.kind]}${who}`, "", NEXT_STEP[event.kind], "", `fal 응답: ${event.detail || "없음"}`].join("\n"),
  };
}

type Env = Record<string, string | undefined>;
type Transport = { sendMail(mail: { from?: string; to: string; subject: string; text: string }): Promise<unknown> };
type MakeTransport = (options: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => Transport;

export function sendFalPoolAlert(
  event: FalPoolAlert,
  environment: Env = process.env,
  makeTransport: MakeTransport = nodemailer.createTransport as unknown as MakeTransport,
): Promise<void> {
  const mail = falPoolAlertMail(event);
  console.error(`[fal-pool] ${mail.subject}`, { detail: event.detail });
  const to = environment.ALERT_EMAIL?.trim();
  const host = environment.SMTP_HOST;
  const user = environment.SMTP_USER;
  const pass = environment.SMTP_PASS;
  const port = Number(environment.SMTP_PORT || 465);
  if (!to || !host || !user || !pass || !Number.isFinite(port)) return Promise.resolve();
  return makeTransport({ host, port, secure: environment.SMTP_SECURE === "true" || port === 465, auth: { user, pass } })
    .sendMail({ from: environment.SMTP_FROM || user, to, subject: mail.subject, text: mail.text })
    .then(() => undefined, (cause: unknown) => {
      console.error("[fal-pool] 알림 메일을 보내지 못했습니다", { message: cause instanceof Error ? cause.message : String(cause) });
    });
}
