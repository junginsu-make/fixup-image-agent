"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button, cn } from "@fixup/ui";
import { BrandMark } from "@fixup/ui";
import type { EasyConversationRecord } from "../../../lib/easy/store-core";

/**
 * 왼쪽 레일 — 새 대화 · 지난 대화 · 출구 (설계 §4).
 *
 * ChatGPT·Claude·Gemini 가 모두 여기에 지난 대화를 쌓는다. **그것이 없으면
 * 모양만 채팅이고 돌아갈 곳이 없다** — 그래서 대화를 표에 남기기로 했다(§4-1).
 *
 * **「자세한 모드로」가 맨 아래에 있다.** 설계 §11-④ 의 출구다. 고를 것을
 * 없애면 원하는 것을 못 만드는 사람이 생기고, **출구가 없으면 Easy 는 막다른
 * 길이다.**
 */

export function EasyRail({ conversations }: { conversations: EasyConversationRecord[] }) {
  const pathname = usePathname();
  const router = useRouter();
  /*
   * **좁은 화면에서만 접힌다.** 여는 손잡이는 입력창 옆에 있다 — 화면 위에
   * 떠 있던 것을 거기로 옮겼다(2026-09-18 사용자). 상단바가 생겨 그 자리에
   * 두 개가 겹쳤다.
   */
  const [open, setOpen] = React.useState(false);

  // 입력창 옆 손잡이가 이 값을 올린다. 창 하나에 레일 하나라 id 로 찾는다.
  React.useEffect(() => {
    const toggle = () => setOpen((current) => !current);
    window.addEventListener("easy-rail-toggle", toggle);
    return () => window.removeEventListener("easy-rail-toggle", toggle);
  }, []);

  const [list, setList] = React.useState(conversations);
  const [removing, setRemoving] = React.useState<string | null>(null);

  // 서버에서 새 목록이 오면 따라간다. 대화를 만들고 옮겨 간 직후다.
  React.useEffect(() => setList(conversations), [conversations]);

  /**
   * 대화를 지운다.
   *
   * **그림은 안 지워진다.** 라이브러리에 남는다 — 대화 줄은 가리키기만 했다
   * (설계 §4-1). 그 사실을 묻는 말에 적는다. 안 적으면 그림까지 사라지는 줄
   * 알고 못 지운다.
   */
  async function remove(id: string, title: string) {
    const 이름 = title || "제목 없는 대화";
    if (!window.confirm(`「${이름}」을 지울까요?\n\n만든 그림은 라이브러리에 남습니다.`)) return;
    setRemoving(id);
    try {
      const response = await fetch(`/api/easy/conversations/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!body.ok) throw new Error(body.message ?? "지우지 못했습니다.");
      setList((current) => current.filter((one) => one.id !== id));
      // 지금 보고 있던 대화를 지웠으면 새 대화로 간다.
      if (pathname === `/easy/${id}`) router.push("/easy");
      else router.refresh();
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "지우지 못했습니다.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      {/* 좁은 화면에서 레일을 열면 뒤를 덮는다. 눌러서 닫는다. */}
      {open ? (
        <button
          type="button"
          aria-label="닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      ) : null}

      <nav
        className={cn(
          "z-40 flex h-dvh w-64 shrink-0 flex-col border-r border-border",
          /*
            **좁은 화면에서는 불투명해야 한다.** 떠 있는 판이라 반투명이면 뒤의
            대화가 그대로 비쳐 글자가 겹쳐 보인다(2026-09-18 확인). 넓은
            화면에서는 자리를 차지하므로 옅은 바탕이 낫다.
          */
          "bg-background md:bg-muted/30",
          "fixed inset-y-0 left-0 -translate-x-full transition-transform md:static md:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <BrandMark className="h-5" />
          <span className="text-meta text-subtle-foreground">Easy</span>
        </div>

        <div className="px-3 pb-2">
          <Button asChild className="w-full justify-start gap-2" variant="secondary">
            <Link href="/easy" onClick={() => setOpen(false)}>
              <Plus className="h-4 w-4" />
              새 대화
            </Link>
          </Button>
        </div>

        {/*
          **지난 대화.** 자기 안에서만 스크롤한다 — 레일 전체가 늘어나면 아래의
          출구가 화면 밖으로 밀린다.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
          {list.length === 0 ? (
            <p className="px-2 py-3 text-meta text-subtle-foreground">
              아직 대화가 없습니다.
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {list.map((one) => {
                const active = pathname === `/easy/${one.id}`;
                return (
                  <li key={one.id} className="group relative">
                    <Link
                      href={`/easy/${one.id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block truncate rounded-md py-2 pl-2 pr-8 text-sm",
                        active ? "bg-background font-medium" : "hover:bg-background/60",
                      )}
                    >
                      {/* 제목은 코드가 지어내지 않는다(`title.ts`). 화면이 정한다. */}
                      {one.title || <span className="text-subtle-foreground">제목 없는 대화</span>}
                    </Link>
                    <button
                      type="button"
                      aria-label="대화 지우기"
                      disabled={removing === one.id}
                      onClick={() => void remove(one.id, one.title)}
                      className="absolute right-1 top-1.5 rounded p-1.5 text-subtle-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/*
          **출구 하나만 둔다.** 설계 §11-④ — 고를 것을 없애면 원하는 것을 못
          만드는 사람이 생긴다. 출구가 없으면 Easy 는 막다른 길이다.

          **라이브러리와 계정은 뺐다**(2026-09-18 사용자). 라이브러리는 첨부
          고르는 창이 이미 열고, 계정은 상단바에 있다 — 둘 다 **중복**이었다.
        */}
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" className="w-full justify-start gap-2 text-sm">
            <Link href="/poster">
              <ArrowLeft className="h-4 w-4" />
              자세한 모드로
            </Link>
          </Button>
        </div>
      </nav>
    </>
  );
}
