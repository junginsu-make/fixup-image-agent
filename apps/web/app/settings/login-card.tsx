"use client";

import * as React from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@fixup/ui";
import { Turnstile } from "../_components/turnstile";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

/**
 * 이메일·비밀번호 바꾸기.
 *
 * **현재 비밀번호를 먼저 확인한다.** `updateUser` 는 현재 비밀번호를 묻지 않는다 — 열린
 * 브라우저를 잡은 사람이 그대로 계정을 가져간다. 비밀번호 재설정 화면은 메일 링크가
 * 본인 확인이지만 여기에는 그런 확인이 없다. 이메일도 같다 — 로그인 열쇠이자 비밀번호
 * 재설정 메일이 가는 곳이다.
 *
 * **이 시스템에만 적용한다**(2026-09-22 사용자 결정). 다른 기기의 로그인은 끊지 않는다.
 * 확인은 로그인과 같은 길(`signInWithPassword`)이라 보안 확인(캡차)도 같이 받는다.
 */
export function LoginCard({ email, owner = false }: { email: string; owner?: boolean }) {
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>로그인 정보</CardTitle>
        <CardDescription>바꾸면 이 서비스의 로그인에만 적용됩니다. 이메일을 바꿔도 다른 기기의 로그인은 그대로 유지됩니다. 비밀번호를 바꾸면 다른 기기에서는 다시 로그인해야 할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/*
          소유자 보호는 이메일로 알아본다(OWNER_EMAIL). 여기서 이메일을 바꾸면 보호가 조용히
          풀려 다른 관리자가 소유자를 정지·삭제할 수 있게 된다(독립 리뷰 2026-09-22).
        */}
        {owner ? (
          <p className="text-sm text-muted-foreground">소유자 계정의 이메일은 여기서 바꾸지 않습니다. 바꾸려면 서버 설정(OWNER_EMAIL)도 함께 바꿔야 하니 운영 담당에게 요청하세요.</p>
        ) : <EmailForm email={email} />}
        <PasswordForm email={email} />
      </CardContent>
    </Card>
  );
}

const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/** 현재 비밀번호가 맞는지. 틀리면 아무것도 안 바꾼다. */
async function confirmCurrent(email: string, password: string, captchaToken: string): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } });
  if (!error) return null;
  return /invalid login credentials/i.test(error.message) ? "현재 비밀번호가 맞지 않습니다." : `확인하지 못했습니다: ${error.message}`;
}

function useCaptcha() {
  const [token, setToken] = React.useState("");
  const [version, setVersion] = React.useState(0);
  // 한 번 쓴 토큰은 다시 못 쓴다. 실패하면 새로 받는다.
  const reset = () => { setToken(""); setVersion((value) => value + 1); };
  return { token, reset, widget: <Turnstile key={version} onToken={setToken} /> };
}

function EmailForm({ email }: { email: string }) {
  const [next, setNext] = React.useState("");
  const [current, setCurrent] = React.useState("");
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = React.useState(false);
  const captcha = useCaptcha();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const target = next.trim();
    if (!target || target.toLowerCase() === email.toLowerCase()) return setNotice({ ok: false, text: "지금과 다른 새 이메일을 적어 주세요." });
    if (captchaRequired && !captcha.token) return setNotice({ ok: false, text: "보안 확인을 완료해 주세요." });
    setPending(true);
    try {
      const problem = await confirmCurrent(email, current, captcha.token);
      if (problem) return setNotice({ ok: false, text: problem });
      const { error } = await createSupabaseBrowserClient().auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/settings` },
      );
      if (error) return setNotice({ ok: false, text: `바꾸지 못했습니다: ${error.message}` });
      // 바로 안 바뀐다. 이 말을 안 하면 「안 바뀌었다」가 된다.
      setNotice({ ok: true, text: `${target} 로 확인 메일을 보냈습니다. 메일의 링크를 눌러야 이메일이 바뀝니다. 지금 이메일로도 확인 메일이 가면 그 링크도 눌러 주세요.` });
      setNext(""); setCurrent("");
    } finally {
      captcha.reset();
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <p className="text-sm font-bold">이메일 바꾸기</p>
      <div className="grid gap-1.5"><Label htmlFor="new-email">새 이메일</Label><Input id="new-email" type="email" autoComplete="email" required value={next} onChange={(event) => setNext(event.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="email-current">현재 비밀번호</Label><Input id="email-current" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></div>
      {captcha.widget}
      <div><Button type="submit" size="sm" disabled={pending}>{pending ? "확인 중..." : "확인 메일 보내기"}</Button></div>
      {notice ? <p role="status" className={`text-sm ${notice.ok ? "text-muted-foreground" : "text-destructive"}`}>{notice.text}</p> : null}
    </form>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = React.useState(false);
  const captcha = useCaptcha();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // 가입·재설정과 같은 규칙이다.
    if (next.length < 8) return setNotice({ ok: false, text: "새 비밀번호는 8자 이상이어야 합니다." });
    if (next !== again) return setNotice({ ok: false, text: "새 비밀번호 확인이 일치하지 않습니다." });
    if (captchaRequired && !captcha.token) return setNotice({ ok: false, text: "보안 확인을 완료해 주세요." });
    setPending(true);
    try {
      const problem = await confirmCurrent(email, current, captcha.token);
      if (problem) return setNotice({ ok: false, text: problem });
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password: next });
      if (error) return setNotice({ ok: false, text: `바꾸지 못했습니다: ${error.message}` });
      setNotice({ ok: true, text: "비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요." });
      setCurrent(""); setNext(""); setAgain("");
    } finally {
      captcha.reset();
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3 border-t pt-6" onSubmit={submit}>
      <p className="text-sm font-bold">비밀번호 바꾸기</p>
      <div className="grid gap-1.5"><Label htmlFor="password-current">현재 비밀번호</Label><Input id="password-current" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="password-next">새 비밀번호</Label><Input id="password-next" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(event) => setNext(event.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="password-again">새 비밀번호 확인</Label><Input id="password-again" type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(event) => setAgain(event.target.value)} /></div>
      {captcha.widget}
      <div><Button type="submit" size="sm" disabled={pending}>{pending ? "확인 중..." : "비밀번호 바꾸기"}</Button></div>
      {notice ? <p role="status" className={`text-sm ${notice.ok ? "text-muted-foreground" : "text-destructive"}`}>{notice.text}</p> : null}
    </form>
  );
}
