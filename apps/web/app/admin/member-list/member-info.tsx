"use client";

import * as React from "react";
import { Button, Input } from "@fixup/ui";
import { PROFILE_LIMITS } from "../../../lib/membership/profile-extras";
import { adminSendPasswordReset, adminSetMemberPassword, adminUpdateMemberProfile } from "../actions";
import { Field } from "./forms";
import type { AdminMemberRow } from "./types";

type Notice = { ok: boolean; text: string } | null;

/**
 * 회원 정보 — 이름·추천인 고치기, 비밀번호 재설정 메일, 새 비밀번호 직접 지정.
 *
 * 추천인은 **회원이 적은 글자 그대로**다(검증 안 함, 2026-09-22 사용자 결정). 실재하는
 * 회원처럼 보이면 안 되므로 「적은 값」이라고 밝힌다.
 */
export function MemberInfo({ row }: { row: AdminMemberRow }) {
  const [notice, setNotice] = React.useState<Notice>(null);
  const [pending, start] = React.useTransition();
  const run = (work: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const result = await work();
    setNotice({ ok: result.ok, text: result.message });
  });

  return (
    <section className="space-y-4">
      <ProfileForm row={row} pending={pending} run={run} />
      <PasswordControls row={row} pending={pending} run={run} />
      {notice ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${notice.ok ? "border-primary/30 bg-primary-soft" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{notice.text}</p> : null}
    </section>
  );
}

type Run = (work: () => Promise<{ ok: boolean; message: string }>) => void;

function ProfileForm({ row, pending, run }: { row: AdminMemberRow; pending: boolean; run: Run }) {
  const [name, setName] = React.useState(row.name ?? "");
  const [referrer, setReferrer] = React.useState(row.referrer ?? "");
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); run(() => adminUpdateMemberProfile(row.profile.id, { name, referrer })); }}>
      <Field label="이름"><Input className="w-40" required maxLength={PROFILE_LIMITS.name} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="추천인 (회원이 적은 값)"><Input className="w-56" maxLength={PROFILE_LIMITS.referrer} value={referrer} onChange={(event) => setReferrer(event.target.value)} /></Field>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>이름·추천인 저장</Button>
    </form>
  );
}

function PasswordControls({ row, pending, run }: { row: AdminMemberRow; pending: boolean; run: Run }) {
  const [password, setPassword] = React.useState("");
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">비밀번호</span>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => {
          if (window.confirm(`${row.profile.email} 로 비밀번호 재설정 메일을 보낼까요?`)) run(() => adminSendPasswordReset(row.profile.id));
        }}>재설정 메일 보내기</Button>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "직접 지정 닫기" : "새 비밀번호 직접 지정"}</Button>
      </div>
      {open ? (
        <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3" onSubmit={(event) => {
          event.preventDefault();
          if (!window.confirm(`${row.profile.email} 의 비밀번호를 지금 입력한 값으로 바꿉니다. 회원에게 알려 줘야 합니다. 계속할까요?`)) return;
          run(async () => {
            const result = await adminSetMemberPassword(row.profile.id, password);
            if (result.ok) setPassword("");
            return result;
          });
        }}>
          <Field label="새 비밀번호 (8자 이상)"><Input className="w-56" type="text" autoComplete="off" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>비밀번호 바꾸기</Button>
          <p className="basis-full text-xs text-muted-foreground">메일을 못 받는 회원을 급히 도울 때만 씁니다. 바꾼 비밀번호를 회원에게 알려 주고, 로그인한 뒤 계정 화면에서 바꾸라고 안내하세요.</p>
        </form>
      ) : null}
    </div>
  );
}
