"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Input, Label } from "@fixup/ui";
import { AuthShell } from "../_components/auth-shell";
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { authAvailability } from "../../lib/supabase/env";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const auth = authAvailability();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(auth.ready ? "" : auth.message);
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!auth.ready) return setError(auth.message);
    if (captchaRequired && !captchaToken) return setError("보안 확인을 완료해 주세요.");
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        captchaToken: captchaToken || undefined,
      });
      if (resetError) {
        setCaptchaToken("");
        setCaptchaVersion((version) => version + 1);
        return setError("재설정 요청을 처리하지 못했습니다. 보안 확인 후 다시 시도해 주세요.");
      }
      setSent(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "재설정 요청을 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="비밀번호 재설정" description="가입한 이메일로 재설정 링크를 보냅니다." step={3}>
      {sent ? <div className="space-y-4 text-sm"><p className="rounded-md bg-primary-soft p-4">계정이 존재하면 재설정 메일이 발송됩니다.</p><Button asChild className="w-full"><Link href="/login">로그인으로 돌아가기</Link></Button></div> : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5"><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Turnstile key={captchaVersion} onToken={setCaptchaToken} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading || !auth.ready}>{loading ? "발송 중..." : "재설정 메일 보내기"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
