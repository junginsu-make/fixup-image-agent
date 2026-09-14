"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from "@fixup/ui";
import type { ShowcaseAdminView } from "../api/showcase/core";
import { keyboardTarget, moveItem, orderChanged, orderOf } from "./showcase-board";

/**
 * 첫 화면 갤러리 관리판.
 *
 * ── 왜 새로 짰나 ─────────────────────────────────────────────
 *
 * 전에는 줄마다 서버 액션 폼이 넷이었다(앞으로·뒤로·내리기·지우기). 서버
 * 액션은 끝나면 `/admin` 으로 되돌려 보내므로 **한 칸 옮길 때마다 관리자
 * 페이지가 통째로 다시 그려졌다** — 회원 명단도, 비용 표도, 모델 단가도 함께.
 * 열 칸을 옮기려면 그 일을 열 번 한다.
 *
 * 여기서는 화면이 먼저 바뀌고 서버는 뒤따라온다. 실패하면 되돌린다.
 *
 * **설명·종류 칸은 뺐다**(운영자 요청 2026-09-14). 화면에 안 보이는 값을
 * 고치려고 줄마다 입력칸 둘과 저장 버튼이 있었는데, 그것이 자리의 절반을
 * 먹어 정작 그림이 88px 로 눌려 있었다. 이미 적힌 값은 그대로 남는다.
 */
export function ShowcasePanel({ items }: { items: ShowcaseAdminView[] | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>첫 화면 갤러리</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          첫 화면에 걸 그림은 <Link href="/library" className="underline">라이브러리 → 작업물</Link>에서 그림을 열고
          「첫 화면에 걸기」로 고릅니다. 아무것도 안 걸면 첫 화면은 미리 넣어 둔 네 장을 그대로 보여줍니다.
        </p>

        {items === null ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            갤러리 표를 읽지 못했습니다. <code>supabase/migrations/202609040011_showcase.sql</code> 을 아직 안 돌린 서버일 수 있습니다.
            표가 없으면 그림을 걸어도 걸리지 않습니다.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 아무것도 걸지 않았습니다. 첫 화면은 미리 넣어 둔 네 장을 보여주고 있습니다.
          </p>
        ) : (
          <Board initial={items} />
        )}
      </CardContent>
    </Card>
  );
}

function Board({ initial }: { initial: ShowcaseAdminView[] }) {
  const [items, setItems] = React.useState(initial);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [over, setOver] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  /**
   * 서버가 준 목록이 바뀌면 따라간다.
   *
   * 다른 창에서 하나를 걸면 이 판이 낡은 채로 남는다. 끌어 옮기는 중에는
   * 안 따라간다 — 손에 쥔 것이 발밑에서 바뀌면 엉뚱한 데로 놓인다.
   */
  React.useEffect(() => {
    if (dragging === null) setItems(initial);
  }, [initial, dragging]);

  /** 화면을 먼저 바꾸고 서버는 뒤따른다. 실패하면 되돌린다. */
  const commit = React.useCallback(async (next: ShowcaseAdminView[], before: ShowcaseAdminView[]) => {
    if (!orderChanged(orderOf(before), orderOf(next))) return;
    setItems(next);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/showcase/manage", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: orderOf(next) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setItems(before);
        setNotice(payload?.message ?? "차례를 바꾸지 못했습니다.");
      }
    } catch {
      setItems(before);
      setNotice("서버에 닿지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  const toggle = React.useCallback(async (item: ShowcaseAdminView) => {
    const before = items;
    const next = items.map((entry) =>
      entry.id === item.id ? { ...entry, visible: !entry.visible } : entry,
    );
    setItems(next);
    setNotice("");
    try {
      const response = await fetch("/api/showcase/manage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, visible: !item.visible }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setItems(before);
        setNotice(payload?.message ?? "바꾸지 못했습니다.");
      }
    } catch {
      setItems(before);
      setNotice("서버에 닿지 못했습니다.");
    }
  }, [items]);

  const remove = React.useCallback(async (item: ShowcaseAdminView) => {
    // 되돌릴 수 없는 일이라 한 번 묻는다. 원본 작업물은 안 지워진다.
    if (!window.confirm("첫 화면에서 지웁니다. 원본 작업물은 그대로 남습니다. 계속할까요?")) return;
    const before = items;
    setItems(items.filter((entry) => entry.id !== item.id));
    setNotice("");
    try {
      const response = await fetch("/api/showcase/manage", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setItems(before);
        setNotice(payload?.message ?? "지우지 못했습니다.");
      }
    } catch {
      setItems(before);
      setNotice("서버에 닿지 못했습니다.");
    }
  }, [items]);

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        칸을 끌어서 차례를 바꿉니다. 키보드로는 칸에 초점을 두고 방향키를 누르세요.
        {busy ? <span className="ml-2 text-primary">저장하는 중…</span> : null}
      </p>

      {notice ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {notice}
        </p>
      ) : null}

      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5"
        onDragOver={(event) => event.preventDefault()}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable
            tabIndex={0}
            aria-label={`${index + 1}번 자리${item.visible ? "" : " · 내림"}`}
            onDragStart={() => setDragging(index)}
            onDragEnter={() => setOver(index)}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging === null) return;
              const before = items;
              commit(moveItem(items, dragging, index), before);
              setDragging(null);
              setOver(null);
            }}
            onKeyDown={(event) => {
              const to = keyboardTarget(index, event.key, items.length);
              if (to === index) return;
              event.preventDefault();
              commit(moveItem(items, index, to), items);
            }}
            className={cn(
              "group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              dragging === index && "opacity-40",
              over === index && dragging !== null && dragging !== index && "ring-2 ring-primary",
              !item.visible && "opacity-60",
            )}
          >
            {item.visible ? (
              // 작은 자리다. 원본을 넣으면 200장까지 내려받는다.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              // 끈 그림은 주소까지 막힌다 — 껐는데 주소를 아는 사람이 계속 볼 수
              // 있으면 껐다고 할 수 없다. 그래서 여기서도 안 보인다.
              <span className="grid h-full place-items-center px-2 text-center text-[11px] leading-tight text-muted-foreground">
                꺼 놓아<br />안 보입니다
              </span>
            )}

            {/* 몇 번째 자리인가. 끌어 옮기는 동안 눈이 따라갈 표지다. */}
            <span className="pointer-events-none absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-background/85 px-1 text-[10px] font-bold tabular-nums">
              {index + 1}
            </span>

            {!item.visible ? (
              <Badge variant="secondary" className="pointer-events-none absolute right-1.5 top-1.5 h-5 px-1.5 text-[10px]">
                내림
              </Badge>
            ) : null}

            {/*
              **손잡이와 단추는 올려야 보인다.** 늘 보이면 칸마다 아이콘이 셋씩
              깔려 그림이 안 보인다 — 지금 화면이 딱 그 상태였다.
              키보드로 초점을 두면 함께 보인다.
            */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <GripVertical className="h-4 w-4 text-white/80" aria-hidden />
              <span className="pointer-events-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => void toggle(item)}
                  aria-label={item.visible ? "첫 화면에서 내리기" : "다시 걸기"}
                  title={item.visible ? "첫 화면에서 내리기" : "다시 걸기"}
                  className="grid h-6 w-6 place-items-center rounded bg-white/90 text-foreground hover:bg-white"
                >
                  {item.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  aria-label="갤러리에서 지우기"
                  title="갤러리에서 지우기"
                  className="grid h-6 w-6 place-items-center rounded bg-white/90 text-destructive hover:bg-white"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
