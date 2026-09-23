"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Label } from "@fixup/ui";
import { AuthShell } from "../_components/auth-shell";
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { authAvailability } from "../../lib/supabase/env";
import { safeNext } from "../../lib/routes";

export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center">로그인 화면을 불러오는 중입니다.</main>}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [captchaToken, setCaptchaToken] = React.useState("");
  const auth = authAvailability();
  const [error, setError] = React.useState(
    !auth.ready || params.get("error") === "service_not_configured" ? auth.message : "",
  );
  const [loading, setLoading] = React.useState(false);
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  /*
    **이미 로그인돼 있으면 조용히 들여보내지 않는다** (2026-09-23 사용자).

    전에는 미들웨어가 로그인 화면을 그냥 홈으로 돌려보냈다. 그래서 브라우저에
    남의 로그인이 남아 있으면, 내 계정으로 들어가려 한 사람이 **입력 창도 못 보고**
    남의 계정 화면을 만났다. 본인은 자기 계정으로 로그인했다고 기억한다 —
    실제로 그런 신고가 있었다.

    `undefined` 는 아직 확인 중, `null` 은 로그인 없음이다.
  */
  const [signedIn, setSignedIn] = React.useState<{ email: string } | null | undefined>(undefined);
  const [switching, setSwitching] = React.useState(false);
  const expired = params.get("expired") === "1";

  React.useEffect(() => {
    if (!auth.ready) return setSignedIn(null);
    let alive = true;
    createSupabaseBrowserClient().auth.getUser()
      .then(({ data }: { data: { user: { email?: string | null } | null } }) => { if (alive) setSignedIn(data.user ? { email: data.user.email ?? "알 수 없는 계정" } : null); })
      .catch(() => { if (alive) setSignedIn(null); });
    return () => { alive = false; };
  }, [auth.ready]);

  /** 다른 계정으로 들어가려면 지금 로그인을 먼저 끊는다. */
  async function signOut() {
    setSwitching(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
      setSignedIn(null);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.ready) return setError(auth.message);
    if (captchaRequired && !captchaToken) return setError("보안 확인을 완료해 주세요.");
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: captchaToken || undefined },
      });
      if (loginError) {
        setCaptchaToken("");
        setCaptchaVersion((version) => version + 1);
        return setError("이메일 또는 비밀번호를 확인해 주세요.");
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (signedIn) {
    return (
      <AuthShell title="이미 로그인되어 있습니다" description="다른 계정으로 들어가려면 먼저 로그아웃해야 합니다." step={3}>
        <div className="space-y-4">
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            지금 <strong className="break-all">{signedIn.email}</strong> 계정으로 로그인되어 있습니다.
          </p>
          <Button type="button" className="w-full" onClick={() => router.replace(safeNext(params.get("next")))}>
            이 계정으로 계속하기
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={switching} onClick={signOut}>
            {switching ? "로그아웃 중..." : "다른 계정으로 로그인하기"}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="로그인" description="이메일 인증을 마친 회원이면 바로 이용할 수 있습니다." step={3}>
      <form className="space-y-4" onSubmit={submit}>
        {expired ? (
          <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            로그인 유지 시간(24시간)이 지나 로그아웃되었습니다. 다시 로그인해 주세요.
          </p>
        ) : null}
        <div className="space-y-1.5"><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Turnstile key={captchaVersion} onToken={setCaptchaToken} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading || !auth.ready}>{loading ? "로그인 중..." : "로그인"}</Button>
        <div className="flex justify-between text-sm"><Link href="/forgot-password" className="text-muted-foreground">비밀번호 찾기</Link><Link href="/signup" className="font-bold text-primary">회원가입</Link></div>
      </form>
    </AuthShell>
  );
}
