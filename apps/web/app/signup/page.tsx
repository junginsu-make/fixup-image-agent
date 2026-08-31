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
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

/**
 * 인증 메일을 못 보낸 것과 입력이 틀린 것은 사용자가 할 일이 다르다.
 *
 * 발송 실패는 대부분 하루 발송 한도(개인 SMTP 릴레이 기준 500통)에 걸린 것이다.
 * 이때 "입력값을 확인해 주세요"라고 하면 맞는 이메일을 몇 번씩 다시 넣게 만든다.
 * 우리 쪽 사정이라는 것과 언제 다시 오면 되는지를 분명히 말한다.
 */
function isMailDeliveryFailure(error: { status?: number; code?: string; message: string }) {
  if (error.status === 500) return true;
  if (error.code === "unexpected_failure") return true;
  return /error sending|smtp|mail/i.test(error.message);
}

export default function SignupPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const [mailBlocked, setMailBlocked] = React.useState(false);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않습니다.");
    if (captchaRequired && !captchaToken) return setError("보안 확인을 완료해 주세요.");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        captchaToken: captchaToken || undefined,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/access`,
      },
    });
    setLoading(false);
    if (signupError) {
      setCaptchaToken("");
      setCaptchaVersion((version) => version + 1);
      if (isMailDeliveryFailure(signupError)) {
        setMailBlocked(true);
        return;
      }
      setError(signupError.message.includes("rate") ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." : "회원가입을 완료하지 못했습니다. 입력값을 확인해 주세요.");
      return;
    }
    setMessage(email.trim());
  }

  return (
    <>
    <Dialog open={mailBlocked} onOpenChange={setMailBlocked}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>오늘은 가입 신청을 더 받을 수 없습니다</DialogTitle>
          <DialogDescription className="pt-2 leading-7">
            가입 신청이 몰려 인증 메일을 보내지 못했습니다. 입력하신 내용에는 문제가 없습니다.
            <br />
            <strong className="text-foreground">내일 다시 시도해 주세요.</strong> 하루가 지나면 정상적으로 가입할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={() => setMailBlocked(false)}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AuthShell title="회원가입" description="이메일 인증만 마치면 바로 이미지 생성 도구를 이용할 수 있습니다." step={message ? 2 : 1}>
      {message ? (
        // 메일을 보냈다는 사실보다 '지금 무엇을 해야 하는지'가 먼저다.
        // 이 화면을 보는 사람은 다음 행동을 몰라서 멈춰 있는 상태다.
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-primary-soft p-4 leading-7 text-foreground">
            <p className="font-bold">메일함을 확인해 주세요</p>
            <p className="mt-1 break-all font-medium">{message}</p>
            <p className="mt-3">
              이 주소로 인증 메일을 보냈습니다. <strong>메일 속 「이메일 인증 완료」 버튼을 눌러</strong>
              주세요. 인증이 끝나면 바로 로그인해서 이용할 수 있습니다.
            </p>
          </div>
          <p className="leading-6 text-muted-foreground">
            메일이 보이지 않으면 <strong className="text-foreground">스팸함</strong>을 확인해 주세요.
            몇 분 지나도 오지 않으면 다시 시도해 주세요.
          </p>
          <Button asChild className="w-full"><Link href="/login">인증을 마쳤어요 · 로그인</Link></Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5"><Label htmlFor="email">이메일</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="password">비밀번호</Label><Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="confirm">비밀번호 확인</Label><Input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <Turnstile key={captchaVersion} onToken={setCaptchaToken} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "가입 처리 중..." : "인증 메일 받기"}</Button>
          <p className="text-center text-sm text-muted-foreground">이미 계정이 있나요? <Link href="/login" className="font-bold text-primary">로그인</Link></p>
        </form>
      )}
    </AuthShell>
    </>
  );
}
