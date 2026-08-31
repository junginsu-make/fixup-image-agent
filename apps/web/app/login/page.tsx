"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@fixup/ui";
import { AuthShell } from "../_components/auth-shell";
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center">로그인 화면을 불러오는 중입니다.</main>}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [error, setError] = React.useState(params.get("error") === "service_not_configured" ? "회원 시스템 환경변수가 아직 설정되지 않았습니다." : "");
  const [loading, setLoading] = React.useState(false);
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (captchaRequired && !captchaToken) return setError("보안 확인을 완료해 주세요.");
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken || undefined },
    });
    setLoading(false);
    if (loginError) {
      setCaptchaToken("");
      setCaptchaVersion((version) => version + 1);
      return setError("이메일 또는 비밀번호를 확인해 주세요.");
    }
    const next = params.get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/create");
    router.refresh();
  }

  return (
    <AuthShell title="로그인" description="이메일 인증을 마친 회원이면 바로 이용할 수 있습니다." step={3}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5"><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Turnstile key={captchaVersion} onToken={setCaptchaToken} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "로그인 중..." : "로그인"}</Button>
        <div className="flex justify-between text-sm"><Link href="/forgot-password" className="text-muted-foreground">비밀번호 찾기</Link><Link href="/signup" className="font-bold text-primary">회원가입</Link></div>
      </form>
    </AuthShell>
  );
}
