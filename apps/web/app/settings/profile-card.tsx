"use client";

import * as React from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@fixup/ui";
import { PROFILE_LIMITS } from "../../lib/membership/profile-extras";
import { updateMyProfile } from "./actions";

const day = (value: string) => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

/** 회원 정보 — 이름·이메일·추천코드·가입일. 이름과 추천코드는 여기서 바로 고친다. */
export function ProfileCard({ email, name, referrer, joinedAt }: { email: string; name: string | null; referrer: string | null; joinedAt: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(name ?? "");
  const [draftReferrer, setDraftReferrer] = React.useState(referrer ?? "");
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await updateMyProfile({ name: draftName, referrer: draftReferrer });
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) setEditing(false);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>회원 정보</CardTitle>
          <CardDescription>가입 {day(joinedAt)}</CardDescription>
        </div>
        {!editing ? <Button size="sm" variant="outline" onClick={() => { setEditing(true); setNotice(null); }}>수정</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-base">
        {editing ? (
          <form className="grid gap-3" onSubmit={save}>
            <div className="grid gap-1.5"><Label htmlFor="profile-name">이름</Label><Input id="profile-name" required maxLength={PROFILE_LIMITS.name} value={draftName} onChange={(event) => setDraftName(event.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-referrer">추천코드 <span className="font-normal text-muted-foreground">· 선택</span></Label>
              <Input id="profile-referrer" maxLength={PROFILE_LIMITS.referrer} placeholder="받으신 추천코드" value={draftReferrer} onChange={(event) => setDraftReferrer(event.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "저장 중..." : "저장"}</Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setDraftName(name ?? ""); setDraftReferrer(referrer ?? ""); }}>취소</Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3">
            <div><dt className="text-xs text-muted-foreground">이름</dt><dd className="text-base font-medium">{name ?? <span className="text-muted-foreground">아직 적지 않았습니다</span>}</dd></div>
            <div><dt className="text-xs text-muted-foreground">이메일</dt><dd className="break-all text-base font-medium">{email}</dd></div>
            <div><dt className="text-xs text-muted-foreground">추천코드</dt><dd className="text-base font-medium">{referrer ?? <span className="text-muted-foreground">없음</span>}</dd></div>
          </dl>
        )}
        {notice ? <p role="status" className={`text-sm ${notice.ok ? "text-muted-foreground" : "text-destructive"}`}>{notice.text}</p> : null}
        <p className="text-xs leading-5 text-muted-foreground">
          회원 정보와 라이브러리에 저장한 결과물·참고 이미지·캐릭터는 서버의 내 계정에 보관되어 다른 기기에서도 보입니다.
          작업 중 초안은 이 브라우저에만 저장됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
