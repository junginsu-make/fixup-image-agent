"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, cn } from "@fixup/ui";
import type { EasyConversationRecord } from "../../../lib/easy/store-core";

/**
 * 지난 대화 목록.
 *
 * ── 사이드바가 아니라 **대시보드 안**이다 ────────────────────
 *
 * 2026-09-21 사용자가 짚었다 — 「이지모드만 페이지가 완전히 바뀝니다. 채팅
 * 목록도 대시보드에서 표시해도 충분한 공간이라고 생각이 들어서요.」
 *
 * 전에는 이 목록이 **제 사이드바**였고, 그 사이드바가 셸의 사이드바를 밀어냈다.
 * 다른 도구(카드뉴스·이미지 만들기)는 사이드바와 상단바가 고정된 채 오른쪽
 * 대시보드만 바뀌는데 **Easy 만 화면을 통째로 갈아엎었다.**
 *
 * 이제는 셸 안이다. 왼쪽 사이드바는 도구 목록, 이 칸은 대화 목록이다.
 *
 * ── 그래서 여기 없는 것 둘 ───────────────────────────────────
 *
 *   로고         셸이 이미 낸다. 두 개가 세로로 서면 무엇이 제품 이름인지 모른다
 *   자세한 모드   셸 사이드바의 **「이미지 만들기」가 그것이다**. 중복이다
 *
 * ChatGPT·Claude·Gemini 가 모두 지난 대화를 쌓는다. **그것이 없으면 모양만
 * 채팅이고 돌아갈 곳이 없다** — 그래서 대화를 표에 남긴다(설계 §4-1).
 */

/** 좁은 화면에서 이 칸을 여닫는 신호. 입력창 옆 손잡이가 보낸다. */
export const TOGGLE_EVENT = "easy-conversations-toggle";

export function EasyConversationList({
  conversations,
  width,
}: {
  conversations: EasyConversationRecord[];
  /**
   * 끌어서 정한 너비. `null` 이면 아직 안 쟀다는 뜻이라 기본 너비로 둔다 —
   * 서버가 그린 것과 같아야 화면이 한 번 튀지 않는다(`split-handle.tsx`).
   */
  width: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  /*
   * **좁은 화면에서만 접힌다.** 여는 손잡이는 입력창 옆에 있다 — 화면 위에
   * 떠 있던 것을 거기로 옮겼다(2026-09-18 사용자).
   */
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const toggle = () => setOpen((current) => !current);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
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
      {/* 좁은 화면에서 목록을 열면 뒤를 덮는다. 눌러서 닫는다. */}
      {open ? (
        <button
          type="button"
          aria-label="닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      ) : null}

      <div
        /*
          **넓어졌고, 끌 수 있다**(2026-09-21 사용자 — 「채팅목록 사이즈 더
          넓혀주세요」). 224 에서는 「따뜻한 느낌의 카페 오픈 포스터」 같은
          제목이 반도 못 가고 잘렸다.

          재기 전 한 프레임은 CSS 가 맡는다 — `w-[18rem]` 이 `LIST_DEFAULT`
          288px 이다. 두 벌이 되는 값이라 시험이 둘을 묶어 둔다.
        */
        style={width === null ? undefined : { width }}
        className={cn(
          /*
            **오른쪽 테두리가 없다**(2026-09-21 사용자 — 「여기는 왜 2줄인가요?
            결과는 1줄인데」).

            이 칸이 제 테두리를 긋고 구분선이 제 선을 또 그어서 **줄이 둘**이었다.
            결과 칸에는 테두리가 없어 하나였고, 그래서 양쪽이 달라 보였다.

            **선은 구분선이 긋는다.** 끌면 따라 움직이는 쪽이 그어야 맞다.
          */
          /*
            **`z-40` 은 떠 있을 때만이다**(2026-09-21 사용자 — 「아이콘이 채팅
            목록 섹션보다 밑에 있어서 가려지고 있습니다」).

            넓은 화면에서 이 칸은 **flex 자식**이고, flex 자식에는 자리를 안 줘도
            `z-index` 가 먹는다. 그래서 `z-40` 이 그대로 살아 **구분선 손잡이를
            덮었다** — 손잡이는 8px 선 위에 20px 짜리라 양옆으로 6px 씩 나오는데
            그 왼쪽 절반이 이 칸 밑으로 들어갔다.
          */
          "flex w-[18rem] shrink-0 flex-col bg-background",
          "max-md:z-40",
          /*
            **좁은 화면에서는 떠 있는 판이다.** 넓은 화면에서는 대시보드의 첫
            칸으로 자리를 차지한다 — 그때는 셸이 이미 화면 높이를 정해 줬으므로
            제 높이를 다시 못 박지 않는다(`h-dvh` 가 남아 있으면 셸 안에서 넘친다).
          */
          "fixed inset-y-0 left-0 h-dvh -translate-x-full transition-transform",
          "md:static md:h-auto md:translate-x-0",
          // 떠 있는 판일 때는 끌어 둔 너비를 안 쓴다. 옆 칸을 밀어낼 일이 없다.
          "max-md:!w-[18rem]",
          open && "translate-x-0",
        )}
      >
        <div className="p-2">
          <Button asChild className="w-full justify-start gap-2" variant="secondary">
            <Link href="/easy" onClick={() => setOpen(false)}>
              <Plus className="h-4 w-4" />
              새 대화
            </Link>
          </Button>
        </div>

        {/* **자기 안에서만 스크롤한다.** 이 칸이 늘어나면 대화가 밀린다. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                        active ? "bg-muted font-medium" : "hover:bg-muted/60",
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
      </div>
    </>
  );
}
