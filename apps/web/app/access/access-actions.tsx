"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@fixup/ui";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";
import { Turnstile } from "../_components/turnstile";

/**
 * 인증 대기 화면의 버튼들.
 *
 * **재발송이 없으면 여기서 막힌다.** 메일이 스팸함에 묻히거나 링크가 만료되면
 * 사용자가 할 수 있는 일이 없어서, 관리자에게 연락하는 수밖에 없었다.
 * 실제로 그렇게 막혔다(2026-09-04).
 */
export function AccessActions({ email, unconfirmed }: { email: string; unconfirmed: boolean }) {
  const router = useRouter();
  const [sending, setSending] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  /**
   * 재발송에도 보안 확인이 필요하다.
   *
   * Supabase 가 인증 관련 요청에 캡차를 요구한다 — 없으면 `captcha_failed` 로
   * 거절한다(실측 2026-09-04). 가입 화면과 같은 위젯을 쓴다.
   */
  const [captchaToken, setCaptchaToken] = React.useState("");
  const [captchaVersion, setCaptchaVersion] = React.useState(0);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  async function resend() {
    if (captchaRequired && !captchaToken) {
      setNotice("아래 보안 확인을 먼저 완료해 주세요.");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        // 가입할 때와 같은 자리로 되돌아와야 한다. 다르면 인증만 되고 화면이 안 넘어간다.
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/access`,
          captchaToken: captchaToken || undefined,
        },
      });
      // 토큰은 한 번만 쓸 수 있다. 다시 누르려면 새로 받아야 한다.
      setCaptchaToken("");
      setCaptchaVersion((version) => version + 1);
      if (error) {
        // 너무 자주 누르면 Supabase 가 막는다. 그건 고장이 아니라 정상이다.
        setNotice(
          /rate|too many|60 seconds/i.test(error.message)
            ? "조금 전에 보냈습니다. 1분쯤 뒤에 다시 눌러 주세요."
            : `메일을 보내지 못했습니다: ${error.message}`,
        );
        return;
      }
      setNotice(`${email} 으로 인증 메일을 다시 보냈습니다. 메일함과 스팸함을 확인해 주세요.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "메일을 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-2">
      {unconfirmed ? (
        <>
          <Button onClick={() => void resend()} disabled={sending}>
            {sending ? "보내는 중…" : "인증 메일 다시 보내기"}
          </Button>
          {captchaRequired ? <Turnstile key={captchaVersion} onToken={setCaptchaToken} /> : null}
        </>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="sm:flex-1" variant={unconfirmed ? "outline" : "default"} onClick={() => router.refresh()}>
          상태 새로고침
        </Button>
        <Button className="sm:flex-1" variant="outline" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
