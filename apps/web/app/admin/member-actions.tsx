"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@fixup/ui";

/**
 * 자주 안 쓰는 것을 접어 두는 자리.
 *
 * ── 왜 만들었나 ───────────────────────────────────────────────────
 *
 * 회원 하나가 세로로 다섯 줄을 차지하고 있었다. 「회원 지우기」 상자가 열려
 * 있으면 그 안에 설명 두 줄 · 이메일 입력칸 · 빨간 버튼이 통째로 깔린다.
 * **지우는 일은 거의 없는데 자리는 제일 많이 먹었다.**
 *
 * 승인 대기 안내도 늘 두 줄을 썼다. 그 문구는 왜 승인 버튼이 잠겼는지
 * 설명하는 것이라 필요하지만, 잠긴 버튼 옆에 붙이면 될 일이다.
 *
 * 그래서 자주 쓰는 것(승인 · 정지 · 정지 해제)만 밖에 두고 나머지를 여기
 * 넣는다. 스무 명을 훑을 때 한 화면에 열 명이 들어오느냐 두 명이
 * 들어오느냐가 갈린다.
 */
export function MoreActions({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={`${label} 추가 작업`}
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 p-0"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open ? (
        <>
          {/*
            바깥을 누르면 닫힌다. 열어 둔 채로 다른 줄을 누르면 둘이 겹쳐
            보이는데, 그때 어느 회원의 것인지 알 수 없다.
          */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border bg-card p-3 shadow-lg">
            <div className="grid gap-2">{children}</div>
          </div>
        </>
      ) : null}
    </span>
  );
}
