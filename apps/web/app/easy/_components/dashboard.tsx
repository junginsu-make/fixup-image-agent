"use client";

import * as React from "react";
import type { EasyConversationRecord } from "../../../lib/easy/store-core";
import { EasyConversationList } from "./conversation-list";
import { EasySplitHandle, useSplitWidth } from "./split-handle";

/**
 * 대시보드 안을 **셋으로 나눈다** — 대화 목록 | 대화 | 결과.
 *
 * ── 왜 레이아웃이 아니라 여기인가 ────────────────────────────
 *
 * 끌 수 있는 구분선은 상태를 들고 있어야 해서 화면 쪽 부품이라야 한다
 * (2026-09-21 사용자 — 「여기도 마우스로 클릭시 선 이동 될 수 있게 하세요」).
 * 레이아웃은 서버에서 도는 것이라 그 자리가 아니다.
 *
 * **목록은 서버가 읽어서 넘긴다.** 첫 그림에 빈 칸이 보이지 않게. 대화 자체
 * (`children`)는 서버 부품 그대로 여기를 지나간다 — 읽지 않고 자리만 내준다.
 *
 * ── 구분선이 둘인데 재는 자리는 다르다 ───────────────────────
 *
 *   이 칸(`나눌자리`)          목록 | 대화 + 결과
 *   대화 안의 칸(`EasyClient`)       대화 | 결과
 *
 * 그래서 목록을 넓히면 대화·결과가 나눠 갖던 너비가 줄어든다. 결과 칸은
 * 그것을 `ResizeObserver` 로 알아채고 스스로 다시 가둔다(`split-handle.tsx`).
 */

export function EasyDashboard({
  conversations,
  children,
}: {
  conversations: EasyConversationRecord[];
  children: React.ReactNode;
}) {
  const 나눌자리 = React.useRef<HTMLDivElement>(null);
  const { width: listWidth, apply: setListWidth } = useSplitWidth(나눌자리, "list");

  return (
    <div ref={나눌자리} className="flex min-h-0 min-w-0 flex-1">
      <EasyConversationList conversations={conversations} width={listWidth} />

      {/*
        **좁은 화면에는 없다.** `md` 미만에서 목록은 떠 있는 판이라 끌 자리가
        없다 — 남겨 두면 붙잡을 것이 없는 선이 화면 왼쪽에 서 있게 된다.
        결과 칸 쪽 선이 `lg` 미만에서 사라지는 것과 같은 까닭이다.
      */}
      {listWidth === null ? null : (
        <EasySplitHandle
          width={listWidth}
          onChange={setListWidth}
          containerRef={나눌자리}
          side="left"
          label="대화 목록과 대화 칸 너비"
          className="hidden md:block"
        />
      )}

      {children}
    </div>
  );
}
