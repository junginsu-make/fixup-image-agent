"use client";

import { useRef, useState } from "react";
import { Button } from "@fixup/ui";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { authOrigin, enabledSocialProviders, socialAuthOptions, type SocialProvider } from "../../lib/auth/social-auth";

export function SocialAuthButtons({ next, disabled = false }: { next?: string | null; disabled?: boolean }) {
  const providers = enabledSocialProviders();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  if (!providers.length) return null;
  async function start(provider: SocialProvider) {
    if (busy.current || disabled) return;
    busy.current = true; setPending(provider); setError("");
    try {
      const origin = authOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);
      const client = createSupabaseBrowserClient();
      const { data, error: sessionError } = await client.auth.getUser();
      if (data.user) throw new Error("already_signed_in");
      // A missing session is normal here; a network failure should not choose
      // another account on behalf of an already signed-in member.
      if (sessionError && sessionError.name !== "AuthSessionMissingError") throw new Error("session_unavailable");
      const { error: oauthError } = await client.auth.signInWithOAuth(socialAuthOptions(provider, origin, next));
      if (oauthError) throw new Error("oauth_failed");
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "already_signed_in"
        ? "이미 로그인되어 있습니다. 로그인 화면에서 계정을 확인하거나 로그아웃해 주세요."
        : "간편로그인을 시작하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 가입해 주세요.");
      busy.current = false; setPending(null);
    }
  }
  return <div className="mb-5 space-y-3" aria-label="간편가입 및 로그인">
    {providers.map(provider => <Button key={provider} type="button" variant="outline"
      className={`w-full gap-3 ${provider === "kakao" ? "border-[#FEE500] bg-[#FEE500] text-[#191919] hover:bg-[#F6DC00]" : "border-[#747775] bg-white text-[#1F1F1F] hover:bg-gray-50"}`}
      disabled={disabled || pending !== null} onClick={() => start(provider)}>
      {provider === "google" ? <GoogleMark /> : <KakaoMark />}
      {pending === provider ? "연결 중..." : `${provider === "google" ? "Google" : "카카오"}로 계속하기`}
    </Button>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />또는 이메일로 계속하기<span className="h-px flex-1 bg-border" /></div>
  </div>;
}

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.94 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
function KakaoMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3C6.48 3 2 6.48 2 10.78c0 2.76 1.86 5.18 4.66 6.56l-1.18 4.1c-.1.36.3.65.61.43l4.8-3.19c.37.03.74.05 1.11.05 5.52 0 10-3.48 10-7.78S17.52 3 12 3Z"/></svg>;
}
