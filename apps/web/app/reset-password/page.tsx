"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@fixup/ui";
import { AuthShell } from "../_components/auth-shell";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않습니다.");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) return setError("재설정 링크가 만료됐거나 비밀번호를 변경하지 못했습니다.");
    router.replace("/login");
    router.refresh();
  }

  return <AuthShell title="새 비밀번호 설정" description="앞으로 사용할 비밀번호를 입력해 주세요." step={3}><form className="space-y-4" onSubmit={submit}><div className="space-y-1.5"><Label htmlFor="password">새 비밀번호</Label><Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="confirm">비밀번호 확인</Label><Input id="confirm" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button className="w-full" type="submit" disabled={loading}>{loading ? "변경 중..." : "비밀번호 변경"}</Button></form></AuthShell>;
}
