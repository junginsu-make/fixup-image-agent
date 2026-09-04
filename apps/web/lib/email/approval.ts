import "server-only";

import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass || !Number.isFinite(port)) {
    throw new Error("승인 메일 SMTP 환경변수가 설정되지 않았습니다.");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
}

export async function sendApprovalEmail(email: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredSiteUrl) {
    throw new Error("운영 사이트 URL이 설정되지 않았습니다.");
  }
  const parsedSiteUrl = new URL(configuredSiteUrl);
  if (!["http:", "https:"].includes(parsedSiteUrl.protocol)) {
    throw new Error("운영 사이트 URL이 올바르지 않습니다.");
  }
  const baseUrl = parsedSiteUrl.toString().replace(/\/$/, "");
  const loginUrl = `${baseUrl}/login`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await createTransport().sendMail({
    from,
    to: email,
    subject: "[MCS] 회원 승인이 완료되었습니다",
    text: `회원 승인이 완료되었습니다. 지금 로그인해 계정에 설정된 이미지 크레딧을 사용할 수 있습니다.\n\n${loginUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#2b2024"><h2 style="color:#B0446A">회원 승인이 완료되었습니다</h2><p>이제 MCS에 로그인해 계정에 설정된 이미지 크레딧을 사용할 수 있습니다.</p><p><a href="${loginUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#B0446A;color:white;text-decoration:none;font-weight:700">로그인하기</a></p></div>`,
  });
}

/**
 * 이메일 인증 링크를 **우리 SMTP 로** 보낸다.
 *
 * Supabase 의 재발송 API(`/auth/v1/resend`)는 캡차를 요구한다. 사용자 화면은
 * 캡차를 띄울 수 있지만 관리자 화면은 그럴 자리가 아니다. 그래서 관리 키로
 * 링크만 만들고, 메일은 우리가 보낸다.
 *
 * 링크는 이미 만들어진 것을 그대로 받는다 — 이 함수는 토큰을 만들지 않는다.
 */
export async function sendConfirmationEmail(email: string, confirmUrl: string) {
  const parsed = new URL(confirmUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("인증 링크가 올바르지 않습니다.");
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await createTransport().sendMail({
    from,
    to: email,
    subject: "[MCS] 이메일 인증을 완료해 주세요",
    text: `아래 주소를 열면 이메일 인증이 끝납니다. 인증 후 관리자 승인을 거쳐 이용할 수 있습니다.\n\n${confirmUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#2b2024"><h2 style="color:#B0446A">이메일 인증을 완료해 주세요</h2><p>아래 버튼을 누르면 인증이 끝납니다. 인증 후 관리자 승인을 거쳐 이용할 수 있습니다.</p><p><a href="${confirmUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#B0446A;color:white;text-decoration:none;font-weight:700">이메일 인증 완료</a></p><p style="font-size:12px;color:#6b6b6b">버튼이 안 눌리면 이 주소를 복사해 주소창에 붙여넣으세요.<br>${confirmUrl}</p></div>`,
  });
}
