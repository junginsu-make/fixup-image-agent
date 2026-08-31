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
    subject: "[PDP STUDIO] 회원 승인이 완료되었습니다",
    text: `회원 승인이 완료되었습니다. 지금 로그인해 계정에 설정된 이미지 크레딧을 사용할 수 있습니다.\n\n${loginUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#2b2024"><h2 style="color:#B0446A">회원 승인이 완료되었습니다</h2><p>이제 PDP STUDIO에 로그인해 계정에 설정된 이미지 크레딧을 사용할 수 있습니다.</p><p><a href="${loginUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#B0446A;color:white;text-decoration:none;font-weight:700">로그인하기</a></p></div>`,
  });
}
