"use client";

import { Badge } from "@fixup/ui";
import { approveMember, deleteMember, resendApproval, resendConfirmation, setMemberStatus } from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { MoreActions } from "../member-actions";
import type { AdminMemberRow } from "./types";

type RowProfile = AdminMemberRow["profile"];

/*
  회원 한 줄의 승인·정지·지우기. 원래 `/admin` 서버 화면에 있던 것을 그대로 옮겼다 —
  표가 선택·일괄 처리 때문에 클라이언트가 되면서 같이 넘어왔다. 동작은 같은
  서버 액션(`../actions`)을 부른다.
*/

export function MemberActions({ profile, fullWidth = false }: { profile: RowProfile; fullWidth?: boolean }) {
  const formClass = fullWidth ? "min-w-[10rem] flex-1" : "";
  const buttonClass = fullWidth ? "w-full" : undefined;
  const locked = profile.status === "pending" && !profile.email_confirmed_at;

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {/*
        자주 쓰는 것만 밖에 둔다. 승인 · 정지 · 정지 해제 셋이다.

        나머지(메일 재발송 · 지우기)는 「⋯」 안으로 넣었다. 회원 하나가 세로로
        다섯 줄을 차지하고 있었는데, 스무 명을 훑을 때 한 화면에 열 명이
        들어오느냐 두 명이 들어오느냐가 갈린다.
      */}
      {profile.status === "pending" ? (
        <form action={approveMember} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <ConfirmSubmitButton
            className={buttonClass}
            disabled={locked}
            confirmMessage={`${profile.email} 회원을 승인하고 승인 완료 메일을 보낼까요?`}
            pendingLabel="승인 중..."
          >
            승인
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {profile.status === "active" ? (
        <form action={setMemberStatus} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <input type="hidden" name="status" value="suspended" />
          <ConfirmSubmitButton
            className={buttonClass}
            variant="destructive"
            confirmMessage={`${profile.email} 회원의 스튜디오 이용을 정지할까요?`}
            pendingLabel="정지 중..."
          >
            이용 정지
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {profile.status === "suspended" ? (
        <form action={setMemberStatus} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <input type="hidden" name="status" value="active" />
          <ConfirmSubmitButton
            className={buttonClass}
            confirmMessage={`${profile.email} 회원의 이용 정지를 해제할까요?`}
            pendingLabel="해제 중..."
          >
            정지 해제
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {/*
        왜 승인이 잠겼는지 말해 준다. 버튼만 회색이고 설명이 없어서 관리자가
        고장으로 봤다(2026-09-04). 전에는 두 줄짜리 문구를 늘 깔아 뒀는데,
        잠긴 버튼 바로 옆에 한 줄이면 같은 말을 한다.
      */}
      {locked ? (
        <span className="mt-1.5 text-[11px] leading-snug text-amber-700">
          이메일 인증 대기
        </span>
      ) : null}

      <MoreActions label={profile.email}>
        {!profile.email_confirmed_at ? (
          <form action={resendConfirmation}>
            <input type="hidden" name="userId" value={profile.id} />
            <ConfirmSubmitButton
              className="w-full"
              variant="outline"
              confirmMessage={`${profile.email} 주소로 이메일 인증 메일을 다시 보낼까요?`}
              pendingLabel="발송 중..."
            >
              인증 메일 재발송
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {profile.status === "active" ? (
          <form action={resendApproval}>
            <input type="hidden" name="userId" value={profile.id} />
            <ConfirmSubmitButton
              className="w-full"
              variant="outline"
              confirmMessage={`${profile.email} 주소로 승인 완료 메일을 다시 보낼까요?`}
              pendingLabel="발송 중..."
            >
              승인 메일 재발송
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {/*
          아주 지우기.

          관리자에게는 안 보인다 — 서로 지우기 시작하면 되돌릴 방법이 없다.
          내리려면 먼저 일반 회원으로 낮춘 뒤 지운다.

          **이메일을 그대로 입력해야 눌린다.** 표에서 줄을 잘못 짚는 일이 흔한데,
          이건 되돌릴 수 없다 — 그 사람이 만든 작업물·참고 이미지·캐릭터가
          같이 사라진다. 다시 못 들어오게만 할 생각이면 「이용 정지」를 쓴다.
        */}
        {profile.role !== "admin" ? (
          <form action={deleteMember} className="grid gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2">
            <input type="hidden" name="userId" value={profile.id} />
            <p className="text-[11px] leading-snug text-destructive">
              되돌릴 수 없습니다. 이 회원이 만든 작업물·참고 이미지·캐릭터가 함께 사라집니다.
              다시 못 들어오게만 하려면 「이용 정지」를 쓰세요.
            </p>
            <input
              name="confirmEmail"
              required
              autoComplete="off"
              placeholder={profile.email}
              aria-label="지울 회원의 이메일 확인"
              className="h-8 rounded-md border bg-background px-2 text-xs"
            />
            <ConfirmSubmitButton
              variant="destructive"
              confirmMessage={`${profile.email} 회원을 아주 지웁니다. 되돌릴 수 없습니다. 계속할까요?`}
              pendingLabel="지우는 중..."
            >
              아주 지우기
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </MoreActions>
    </div>
  );
}

export function StatusBadge({ profile }: { profile: Pick<RowProfile, "status"> }) {
  return profile.status === "active" ? <Badge variant="green">활성</Badge> : profile.status === "suspended" ? <Badge variant="destructive">정지</Badge> : <Badge variant="secondary">승인 대기</Badge>;
}
