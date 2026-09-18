"use client";

import * as React from "react";
import { Download, Maximize2 } from "lucide-react";
import { Button } from "@fixup/ui";

/**
 * 오른쪽 **결과 칸** (2026-09-18 사용자 결정).
 *
 * ── 어디서 왔나 ──────────────────────────────────────────────
 *
 * 2026-09-02 첫 기획은 **4분할**이었다 — 메뉴 · 대화 · 작업판 · 결과.
 * Easy 설계(9/17)가 그것을 뺐는데, 뺀 것은 **작업판**이다. 「옆에 칸이 열한 개
 * 있으면 사용자는 결국 그것을 보고, 그러면 쉬워지지 않는다」가 그 까닭이다.
 *
 * **결과 칸은 그 까닭에 안 걸린다.** 고칠 칸이 없고 보여 주기만 한다. 그래서
 * 되살린다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 그림이 대화 속에 섞여 있으면 대화가 길어질수록 **위로 사라진다.** 방금 만든
 * 것을 다시 보려면 올려야 하고, 크게 보려면 눌러야 한다.
 *
 * 여기서는 **마지막 그림이 늘 같은 자리에** 큼직하게 있다.
 */

export function EasyResultPanel({
  url,
  onOpen,
}: {
  /** 마지막으로 만든 그림. 아직 없으면 비어 있다. */
  url?: string;
  onOpen: () => void;
}) {
  return (
    <aside className="hidden w-[22rem] shrink-0 flex-col border-l border-border lg:flex">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-meta text-subtle-foreground">결과</span>
        {url ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="크게 보기" onClick={onOpen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            {/*
              **내려받기는 링크로 한다.** 자바스크립트로 만들면 파일 이름과
              확장자를 우리가 지어내야 하고, 브라우저마다 다르게 군다.
            */}
            <Button asChild variant="ghost" size="icon" aria-label="내려받기">
              <a href={url} download target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {url ? (
          <button
            type="button"
            onClick={onOpen}
            className="block w-full overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="만든 그림" className="block w-full" />
          </button>
        ) : (
          /*
            **빈 칸에도 말을 적는다.** 아무것도 없으면 고장인 줄 안다.
          */
          <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border text-meta text-subtle-foreground">
            만들면 여기에 나옵니다
          </div>
        )}
      </div>
    </aside>
  );
}
