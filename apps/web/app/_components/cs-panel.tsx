"use client";

import * as React from "react";
import {
  Button, Input, SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription,
  SidePanelFooter, SidePanelHeader, SidePanelTitle, cn,
} from "@fixup/ui";
import { billableFetch } from "../../lib/billable-fetch";
import { randomId } from "../../lib/browser-safe";

/**
 * **무엇이든 물어보세요** — 사이드바 바닥의 도우미(2026-09-23 사용자 요청).
 *
 * > 왼쪽 사이드바 하단에 다른 버튼과 더 구분하여 거기 클릭시 대화창
 * > 슬라이드로 열리면서 chat 형식으로 대화로 풀어가는 형식이면 더 좋을 것
 * > 같습니다.
 *
 * ── 왜 셸의 바닥인가 ───────────────────────────────────────
 *
 * `AppShell` 의 `sidebarFooter` 주석이 적어 두었다 — 「셸은 화면을 옮겨도
 * 다시 만들어지지 않으므로, **화면이 바뀌어도 계속 돌아야 하는 것이 여기서
 * 살 수 있다**」. 상세페이지를 만들다 물어보고, 답을 보며 계속 작업할 수
 * 있다.
 *
 * ── 왜 옆에서 나오나 ───────────────────────────────────────
 *
 * `SidePanel` 주석의 기준 그대로다 — 「가운데 창과 나누는 기준은 **얼마나
 * 오래 머무르는가**」. 대화는 오래 머무르는 자리다.
 *
 * ── 다른 단추와 결을 달리한다 ──────────────────────────────
 *
 * 사이드바의 다른 항목은 **가는 곳**이고 이것은 **여는 것**이다. 선으로
 * 가르고 옅은 바탕을 깐다.
 */

interface 말 {
  role: "user" | "bot";
  text: string;
  sources?: Array<{ name: string; href: string }>;
  handoff?: boolean;
}

/** 첫 화면에 놓는 물음. 무엇을 물어도 되는지 보여 준다. */
const 맛보기물음 = [
  "크레딧은 어떻게 차감되나요?",
  "남은 크레딧 알려 주세요",
  "상세페이지는 어떻게 만드나요?",
];

export function CsPanel() {
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<말[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");

  /*
    **한 대화의 번호.** 서버가 이것으로 한 시간 동안 대화를 들고 있다
    (`lib/cs/session.ts`). 계정과 무관한 값이라 여기서 만들어도 된다.
  */
  const sessionId = React.useRef<string>("");
  if (!sessionId.current) sessionId.current = `chat-${randomId().replace(/-/g, "").slice(0, 24)}`;

  const [문의중, set문의중] = React.useState(false);
  const [문의결과, set문의결과] = React.useState("");
  /**
   * 이미 보낸 답. **보낸 뒤 단추가 되살아나면 또 누른다.**
   *
   * 서버가 같은 물음을 한 번만 받으므로 줄이 늘지는 않지만, 눌릴 수 있는
   * 단추를 두면 보냈는지 모른다는 뜻이다.
   */
  const [보낸것, set보낸것] = React.useState<ReadonlySet<number>>(new Set());

  const 바닥 = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (open) 바닥.current?.scrollIntoView({ block: "end" });
  }, [turns, open]);

  const 보낸다 = async (question: string) => {
    const 물음 = question.trim();
    if (!물음 || pending) return;

    setDraft("");
    setError("");
    setTurns((before) => [...before, { role: "user", text: 물음 }]);
    setPending(true);
    try {
      /*
        **`billableFetch` 를 쓴다.** 값이 나가는 주소는 요청 식별자가 있어야
        하고(`x-idempotency-key`), 없으면 서버가 400 으로 막는다.
      */
      const response = await billableFetch("/api/cs/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: 물음,
          sessionId: sessionId.current,
          page: window.location.pathname,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean; reply?: string; sources?: 말["sources"]; handoff?: boolean; message?: string;
      };

      if (!response.ok || !body.ok || !body.reply) {
        setError(body.message ?? "지금은 답을 드리지 못했습니다. 잠시 후 다시 물어봐 주세요.");
        return;
      }
      setTurns((before) => [
        ...before,
        { role: "bot", text: body.reply!, sources: body.sources ?? [], handoff: body.handoff },
      ]);
    } catch {
      setError("서버와 통신하지 못했습니다. 잠시 후 다시 물어봐 주세요.");
    } finally {
      setPending(false);
    }
  };

  /**
   * **담당자에게 넘긴다**(설계 §10).
   *
   * 보내는 것은 **물음과 대화 번호뿐이다.** 대화도 근거도 서버가 들고 있는
   * 것을 쓴다 — 통째로 보내면 아무 글이나 「내 대화」로 넣을 수 있고, 근거는
   * 그 주소가 관리자 화면에서 눌리는 링크가 된다.
   */
  const 문의한다 = async (index: number, question: string) => {
    if (문의중 || 보낸것.has(index)) return;
    set문의중(true);
    set문의결과("");
    try {
      const response = await fetch("/api/cs/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          sessionId: sessionId.current,
          page: window.location.pathname,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; mailed?: boolean; message?: string };
      set문의결과(body.ok
        ? body.message ?? "문의를 남겼습니다."
        : body.message ?? "문의를 남기지 못했습니다. 잠시 후 다시 눌러 주세요.");
      // 받았으면 그 단추를 굳힌다. 못 받았으면 다시 누를 수 있어야 한다.
      if (body.ok) set보낸것((before) => new Set(before).add(index));
    } catch {
      set문의결과("서버와 통신하지 못했습니다. 잠시 후 다시 눌러 주세요.");
    } finally {
      set문의중(false);
    }
  };

  /** 이 답 바로 앞의 사용자 물음. 문의에 함께 싣는다. */
  const 앞의물음 = (index: number) => {
    for (let i = index - 1; i >= 0; i -= 1) if (turns[i]!.role === "user") return turns[i]!.text;
    return "";
  };

  return (
    <>
      {/*
        **다른 단추와 결을 달리한다.** 위는 가는 곳, 이것은 여는 것이다.
        접힌 사이드바에서는 캐릭터만 남는다.
      */}
      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="도움말 대화 열기"
          className="flex w-full items-center gap-2 rounded-md bg-primary-soft px-2 py-2 text-left text-sm font-bold text-foreground transition-colors hover:bg-primary-soft/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 128px 고정 장식. 최적화 서버를 거칠 까닭이 없다. */}
          <img src="/easy/assistant.webp" alt="" aria-hidden width={28} height={28} className="size-7 flex-none rounded-full" />
          <span className="truncate">무엇이든 물어보세요</span>
        </button>
      </div>

      <SidePanel open={open} onOpenChange={setOpen}>
        <SidePanelContent className="max-w-[460px]">
          <SidePanelHeader>
            <SidePanelTitle>무엇이든 물어보세요</SidePanelTitle>
            <SidePanelDescription>
              쓰는 방법과 내 크레딧·플랜을 알려 드립니다. 모르는 것은 모른다고 말씀드립니다.
            </SidePanelDescription>
          </SidePanelHeader>

          <SidePanelBody className="grid content-start gap-3">
            {turns.length === 0 ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">이런 것을 물어보실 수 있습니다.</p>
                {맛보기물음.map((질문) => (
                  <button
                    key={질문}
                    type="button"
                    onClick={() => void 보낸다(질문)}
                    className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {질문}
                  </button>
                ))}
              </div>
            ) : null}

            {turns.map((turn, index) => (
              <div key={index} className={cn("grid gap-1", turn.role === "user" && "justify-items-end")}>
                {/*
                  **줄바꿈을 살린다**(2026-09-28 사용자 신고 「한 줄로만 쭉
                  나옵니다」). 글을 그냥 넣으면 HTML 이 `
` 을 빈칸 하나로
                  뭉갠다 — 모델이 줄을 나눠 보내도 소용이 없었다.
                */}
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed",
                    turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {turn.text}
                </div>
                {/*
                  **출처를 보여 준다**(설계 §6.2). 틀렸을 때 사용자가 바로 안다.
                */}
                {turn.sources?.length ? (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {turn.sources.map((source) => (
                      <a
                        key={`${source.name}${source.href}`}
                        href={source.href || undefined}
                        className="rounded-full border px-2 py-0.5 text-muted-foreground hover:bg-muted"
                      >
                        {source.name}
                      </a>
                    ))}
                  </div>
                ) : null}
                {turn.handoff ? (
                  <button
                    type="button"
                    disabled={문의중 || 보낸것.has(index)}
                    onClick={() => void 문의한다(index, 앞의물음(index))}
                    className="justify-self-start text-xs font-bold text-primary underline underline-offset-4 disabled:no-underline disabled:opacity-60"
                  >
                    {보낸것.has(index) ? "문의를 남겼습니다" : 문의중 ? "보내는 중…" : "문의 남기기"}
                  </button>
                ) : null}
              </div>
            ))}

            {문의결과 ? <p role="status" className="text-sm text-primary">{문의결과}</p> : null}
            {pending ? <p className="text-sm text-muted-foreground">답을 찾는 중입니다…</p> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div ref={바닥} />
          </SidePanelBody>

          <SidePanelFooter>
            <form
              className="flex gap-2"
              onSubmit={(event) => { event.preventDefault(); void 보낸다(draft); }}
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="궁금한 것을 적어 주세요"
                aria-label="물어볼 내용"
                disabled={pending}
              />
              <Button type="submit" disabled={pending || !draft.trim()}>보내기</Button>
            </form>
            <p className="mt-2 text-[11px] text-subtle-foreground">
              대화는 한 시간 동안만 남고 그 뒤에는 사라집니다.
            </p>
          </SidePanelFooter>
        </SidePanelContent>
      </SidePanel>
    </>
  );
}
