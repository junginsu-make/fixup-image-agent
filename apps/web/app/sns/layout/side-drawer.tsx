"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "@fixup/ui";

/**
 * 오른쪽에서 밀려 나오는 서랍.
 *
 * 틀을 고칠 때 필요한 것은 **레퍼런스와 칸 상자**다. 그려 보기와 세트
 * 만들기는 다 고친 뒤에 한 번 쓰는 것이라, 늘 펼쳐 두면 정작 봐야 할
 * 레퍼런스가 손톱만 해진다. 쓸 때만 덮어 준다.
 *
 * 뒤 화면을 지우지 않고 **덮기만 한다.** 서랍을 닫으면 고치던 자리가 그대로
 * 있어야 한다.
 */
export function SideDrawer({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  // 서랍이 열려 있을 때 Esc 로 닫는다. 덮개를 못 찾아 헤매지 않게.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-hidden={!open}
        aria-label={title}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l bg-background shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>닫기</Button>
        </header>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  );
}
