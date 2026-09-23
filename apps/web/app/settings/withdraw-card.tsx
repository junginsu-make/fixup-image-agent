"use client";

import * as React from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@fixup/ui";
import { withdrawMyAccount } from "./actions";

/**
 * **회원 탈퇴**(2026-09-23 사용자 요청).
 *
 * 「모든 사용자는 계정(개인페이지)에서 탈퇴 할 수 있어야 합니다.」
 *
 * ── 왜 따로, 맨 밑에 ───────────────────────────────────────
 *
 * 다른 카드와 붙여 두면 잘못 누른다. 테두리를 달리하고 **맨 아래**에 둔다.
 * 되돌릴 수 없는 일은 우연히 닿는 자리에 두지 않는다.
 *
 * ── 왜 접어 두나 ───────────────────────────────────────────
 *
 * 펼쳐 두면 「탈퇴하기」 단추가 늘 화면에 있다. 접어 두면 **누르겠다고
 * 마음먹은 사람만** 확인 칸을 본다.
 *
 * ── 남은 크레딧을 숫자로 ───────────────────────────────────
 *
 * 「사라집니다」만으로는 얼마가 사라지는지 모른다. 42장이 적혀 있으면 한 번
 * 더 생각한다. 0 장이면 그 말을 안 한다.
 */
export function WithdrawCard({ email, availableCredits }: { email: string; availableCredits: number }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await withdrawMyAccount({ confirmEmail: typed });
      /*
        **성공하면 여기서 아무것도 안 그린다.** 계정이 사라졌거나 닫혔으므로
        이 화면을 다시 그리면 로그인으로 튕긴다. 통째로 다시 연다.
      */
      if (result.ok) {
        window.location.href = "/login?notice=withdrawn";
        return;
      }
      setError(result.message);
    });
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">회원 탈퇴</CardTitle>
        <CardDescription>
          탈퇴하면 로그인할 수 없게 되고 만든 작업물과 라이브러리가 모두 사라집니다.
          되돌릴 수 없습니다.
          {availableCredits > 0 ? ` 남은 크레딧 ${availableCredits}장도 함께 사라집니다.` : ""}
          {" "}결제·크레딧 기록은 법령에 따라 보관됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {open ? (
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="withdraw-confirm">
                확인을 위해 <strong>{email}</strong> 을 그대로 입력해 주세요
              </Label>
              <Input
                id="withdraw-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                placeholder={email}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={pending || !typed.trim()}>
                {pending ? "탈퇴하는 중…" : "탈퇴하기"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => { setOpen(false); setTyped(""); setError(""); }}
              >
                취소
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            탈퇴 절차 시작
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
