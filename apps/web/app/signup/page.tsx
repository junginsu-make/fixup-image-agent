"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@fixup/ui";
import { AuthShell } from "../_components/auth-shell";
import { SocialAuthButtons } from "../_components/social-auth-buttons";
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { authAvailability } from "../../lib/supabase/env";
import { cleanProfileText, PROFILE_LIMITS, profileInputError } from "../../lib/membership/profile-extras";
import { signupResult, type SignupResult } from "../../lib/auth/signup-result";
import { signupConsentError, signupConsentMetadata } from "../../lib/membership/signup-consent";

export default function SignupPage() {
  const [name, setName] = React.useState("");
  const [referrer, setReferrer] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [ageConfirmed, setAgeConfirmed] = React.useState(false);
  const [termsAgreed, setTermsAgreed] = React.useState(false);
  const [captchaToken, setCaptchaToken] = React.useState("");
  const auth = authAvailability();
  const [result, setResult] = React.useState<SignupResult | null>(null);
  const [submittedEmail, setSubmittedEmail] = React.useState("");
  const [error, setError] = React.useState(auth.ready ? "" : auth.message);
  const [loading, setLoading] = React.useState(false);
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const [mailError, setMailError] = React.useState("");
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (!auth.ready) return setError(auth.message);
    const profileProblem = profileInputError({ name, referrer });
    if (profileProblem) return setError(profileProblem);
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않습니다.");
    const consentProblem = signupConsentError({ ageConfirmed, termsAgreed });
    if (consentProblem) return setError(consentProblem);
    if (captchaRequired && !captchaToken) return setError("보안 확인을 완료해 주세요.");
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          captchaToken: captchaToken || undefined,
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/access`,
          /*
            이름·추천인은 가입 메타데이터로 보낸다. 가입 트리거(202609220005)가 계정이
            만들어지는 그 한 번에 profiles 로 옮긴다 — 가입 직후 통신이 끊겨도 안 빠진다.
            추천인은 검증하지 않는다. 적은 그대로 담는다(2026-09-22 사용자 결정).
          */
          data: {
            display_name: cleanProfileText(name, PROFILE_LIMITS.name),
            referrer_input: cleanProfileText(referrer, PROFILE_LIMITS.referrer),
            // 어느 판의 약관에 동의했는지. 동의 시각은 서버의 가입 시각이다.
            ...signupConsentMetadata(),
          },
        },
      });
      const outcome = signupResult(data, signupError);
      if (outcome.kind === "mail-error") {
        return setMailError(outcome.message);
      }
      if (outcome.kind === "error") return setError(outcome.message);
      setSubmittedEmail(email.trim());
      setResult(outcome);
      setPassword("");
      setConfirm("");
    } catch {
      setError("회원가입 결과를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setCaptchaToken("");
      setCaptchaVersion((version) => version + 1);
      setLoading(false);
    }
  }

  return (
    <>
    <Dialog open={Boolean(mailError)} onOpenChange={(open) => { if (!open) setMailError(""); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>인증 메일을 보내지 못했습니다</DialogTitle>
          <DialogDescription className="pt-2 leading-7">
            {mailError}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={() => setMailError("")}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AuthShell
      title={result?.kind === "existing" ? "기존 계정 안내" : "회원가입"}
      description={result?.kind === "existing" ? "로그인하거나 비밀번호를 재설정해 주세요." : "계정을 인증하고 가입 정보를 확인해 주세요. AI 기능은 관리자가 크레딧을 지급한 뒤 이용할 수 있습니다."}
      step={!result ? 1 : result.kind === "confirmation" ? 2 : 3}
    >
      {result?.kind === "existing" ? (
        <div className="space-y-4 text-sm">
          <div role="status" className="rounded-md bg-primary-soft p-4 leading-7 text-foreground">
            <p className="font-bold">이미 가입된 이메일입니다</p>
            <p className="mt-1 break-all font-medium">{submittedEmail}</p>
            <p className="mt-3">기존 계정으로 로그인해 주세요. 비밀번호가 기억나지 않으면 비밀번호 찾기를 이용해 주세요.</p>
          </div>
          <Button asChild className="w-full"><Link href="/login">로그인</Link></Button>
          <Button asChild variant="outline" className="w-full"><Link href="/forgot-password">비밀번호 찾기</Link></Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setResult(null)}>다른 이메일로 가입하기</Button>
        </div>
      ) : result?.kind === "authenticated" ? (
        <div className="space-y-4 text-sm">
          <p role="status">회원가입이 완료되었습니다.</p>
          <Button asChild className="w-full"><Link href="/access">시작하기</Link></Button>
        </div>
      ) : result?.kind === "confirmation" ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-primary-soft p-4 leading-7 text-foreground">
            <p className="font-bold">가입 요청을 접수했습니다</p>
            <p className="mt-1 break-all font-medium">{submittedEmail}</p>
            <p className="mt-3">
              이 주소의 메일함을 확인하고 <strong>인증 메일 속 「이메일 인증 완료」 버튼을 눌러</strong>
              주세요. 인증이 끝나면 바로 로그인해서 이용할 수 있습니다.
            </p>
          </div>
          <p className="leading-6 text-muted-foreground">
            메일이 보이지 않으면 <strong className="text-foreground">스팸함</strong>을 확인해 주세요.
            몇 분 지나도 오지 않으면 이메일 주소를 확인하고 다시 시도해 주세요.
            이미 가입한 계정이라면 로그인하거나 비밀번호 찾기를 이용해 주세요.
          </p>
          <Button asChild className="w-full"><Link href="/login">인증을 마쳤어요 · 로그인</Link></Button>
          <Button asChild variant="outline" className="w-full"><Link href="/forgot-password">비밀번호 찾기</Link></Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setResult(null)}>이메일 확인 · 다시 시도</Button>
        </div>
      ) : (
        <>
        <SocialAuthButtons disabled={loading || !auth.ready} />
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5"><Label htmlFor="name">이름</Label><Input id="name" autoComplete="name" required maxLength={PROFILE_LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="confirm">비밀번호 확인</Label><Input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="referrer">추천코드 <span className="font-normal text-muted-foreground">· 선택</span></Label>
            <Input id="referrer" maxLength={PROFILE_LIMITS.referrer} placeholder="받으신 추천코드" value={referrer} onChange={(e) => setReferrer(e.target.value)} />
          </div>
          {/*
            약관·처리방침은 **새 탭**으로 연다. 같은 탭이면 적던 이름·비밀번호가
            사라진다. 첫 화면의 #terms·#privacy 주소가 그 문서를 바로 연다.
            개인정보는 동의 칸이 아니라 안내다 — 까닭은 lib/membership/signup-consent.ts.
          */}
          <fieldset className="space-y-2 rounded-md border border-border p-3 text-sm">
            <legend className="sr-only">가입 동의</legend>
            <label className="flex items-start gap-2 leading-6">
              <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-[var(--primary)]" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} />
              <span><span className="font-bold text-primary">필수</span> 만 14세 이상입니다.</span>
            </label>
            <label className="flex items-start gap-2 leading-6">
              <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-[var(--primary)]" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} />
              <span>
                <span className="font-bold text-primary">필수</span>{" "}
                <a href="/#terms" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">이용약관<span className="sr-only"> (새 탭에서 열림)</span></a>에 동의합니다.
              </span>
            </label>
            <p className="pl-6 text-xs leading-5 text-muted-foreground">
              가입 정보는{" "}
              <a href="/#privacy" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">개인정보 처리방침<span className="sr-only"> (새 탭에서 열림)</span></a>에 따라 처리됩니다.
            </p>
          </fieldset>
          <Turnstile key={captchaVersion} onToken={setCaptchaToken} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading || !auth.ready}>{loading ? "가입 처리 중..." : "인증 메일 받기"}</Button>
          <p className="text-center text-sm text-muted-foreground">이미 계정이 있나요? <Link href="/login" className="font-bold text-primary">로그인</Link></p>
        </form>
        </>
      )}
    </AuthShell>
    </>
  );
}
