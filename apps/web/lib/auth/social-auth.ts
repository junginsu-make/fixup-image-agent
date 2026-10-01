import { HOME_AFTER_LOGIN, safeNext } from "../routes";

export type SocialProvider = "google" | "kakao";
export function enabledSocialProviders(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
  NEXT_PUBLIC_AUTH_KAKAO_ENABLED: process.env.NEXT_PUBLIC_AUTH_KAKAO_ENABLED,
}): SocialProvider[] {
  return (["google", "kakao"] as const).filter(provider => env[provider === "google" ? "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED" : "NEXT_PUBLIC_AUTH_KAKAO_ENABLED"] === "1");
}

/** Auth redirects never trust incoming Host/Forwarded headers. */
export function authOrigin(configured: string | undefined, environment: string | undefined): string {
  if (!configured) throw new Error("auth_origin_missing");
  const url = new URL(configured);
  const local = environment !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("auth_origin_invalid");
  return url.origin;
}

export function socialNext(value: string | null | undefined): string {
  if (!value) return HOME_AFTER_LOGIN;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\u0000-\u0020\\]/.test(decoded) || !decoded.startsWith("/") || decoded.startsWith("//")) return HOME_AFTER_LOGIN;
    const url = new URL(safeNext(decoded), "https://auth.invalid");
    if (url.origin !== "https://auth.invalid" || /^\/(?:auth|login|signup|access|forgot-password|reset-password)(?:\/|$)/.test(url.pathname)) return HOME_AFTER_LOGIN;
    // Validate the decoded path, but keep the original query encoding intact.
    const original = new URL(safeNext(value), "https://auth.invalid");
    // Dot segments can collapse into "//host"; check the value actually returned.
    if (original.origin !== "https://auth.invalid" || original.pathname.startsWith("//")) return HOME_AFTER_LOGIN;
    return `${original.pathname}${original.search}${original.hash}`;
  } catch { return HOME_AFTER_LOGIN; }
}

export function socialAuthOptions(provider: SocialProvider, origin: string, next?: string | null) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", socialNext(next));
  return { provider, options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } } };
}

const errors: Record<string, string> = {
  oauth_cancelled: "로그인이 취소되었습니다. 원하시는 방법으로 다시 진행해 주세요.",
  oauth_invalid: "로그인 요청이 만료되었거나 유효하지 않습니다. 로그인 버튼을 다시 눌러 주세요.",
  oauth_failed: "간편로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  oauth_email_required: "이메일 정보를 확인할 수 없습니다. 이메일 제공에 동의하거나 다른 가입 방법을 이용해 주세요.",
  profile_unavailable: "회원 정보를 확인하지 못했습니다. 잠시 후 다시 로그인해 주세요.",
  credits_unavailable: "회원 시스템을 준비 중입니다. 잠시 후 다시 로그인해 주세요.",
};
export function socialAuthError(code: string | null): string { return code ? errors[code] ?? "" : ""; }
