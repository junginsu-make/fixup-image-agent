"use client";

import * as React from "react";
import { Button, cn } from "@fixup/ui";
import { LIBRARY_VIEWS, workFilters, type LibraryView, type WorkFilterId } from "./work-filter";

/** 작업물 화면이 위로 알리는 것. 작업물을 아직 못 읽었으면 `null` 이다. */
export interface WorksSummary {
  counts: Record<WorkFilterId, number>;
  /** 쉽게로 만든 작업 목록을 읽었나. 못 읽었으면 쉽게와 다양하게를 못 가른다. */
  easyKnown: boolean;
  /** 캐릭터가 왔나. 다른 결과보다 늦게 온다 — 오기 전에는 「캐릭터」 숫자를 달지 않는다. 없으면 왔다고 본다. */
  charactersReady?: boolean;
}

/**
 * 라이브러리 **한 줄 거르기**(2026-10-08 사용자 요청).
 *
 * 전에는 위 탭 [작업물·참고 이미지·캐릭터] 아래에 작업물 거르기 [전체…리디자인] 가 또 있었다.
 * 「캐릭터」가 두 곳에 있었고, 두 줄을 오가야 했다. 이제 한 줄이 무엇을 보일지 정한다.
 *
 * 작업물 거르기(캐릭터 포함)에는 개수를 단다 — 눌러 보기 전에 비었는지 안다. 참고 이미지는 직접
 * 올린 것이라 다른 화면이고, 낱장·세트가 섞여 아직 숫자가 없다.
 */
export function LibraryViewBar({ value, summary, onChange }: {
  value: LibraryView;
  summary: WorksSummary | null;
  onChange: (next: LibraryView) => void;
}) {
  /** 못 쓰는 단추를 눌렀을 때의 까닭. 다른 단추를 누르면 지운다. */
  const [reason, setReason] = React.useState("");
  // 쉽게 목록을 못 읽었으면 쉽게·다양하게가 까닭을 단다(`workFilters`). 모를 때는 읽은 것으로 둔다 — 아직 못 읽은 것이지 실패가 아니다.
  const blocked = new Map(workFilters(summary?.easyKnown ?? true).map((filter) => [filter.id as LibraryView, filter.unavailable]));
  // 고른 단추를 못 쓰게 되면 작업물 화면은 전체를 보인다(`works-tab.tsx` 의 `chosen`). 단추도 같은 것을 누른다.
  const shown: LibraryView = blocked.get(value) ? "all" : value;

  return (
    <div className="grid gap-2">
      <div role="group" aria-label="라이브러리 거르기" className="flex flex-wrap gap-2">
        {LIBRARY_VIEWS.map((entry) => {
          const unavailable = blocked.get(entry.id);
          const active = shown === entry.id;
          const waiting = entry.id === "character" && summary?.charactersReady === false;
          const count = summary && !unavailable && !waiting && entry.id in summary.counts ? summary.counts[entry.id as WorkFilterId] : null;
          return (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              aria-disabled={unavailable ? true : undefined}
              className={cn("rounded-full", unavailable && "opacity-50")}
              onClick={() => {
                /*
                  **못 쓰는 단추도 누르면 까닭을 말한다.** `disabled` 로 막으면 눌러도
                  아무 반응이 없어 고장으로 읽힌다. 말풍선(`title`)은 안 뜨는 환경이
                  있다(2026-09-17 「과정 보기」에서 겪었다).
                */
                if (unavailable) {
                  setReason(unavailable);
                  return;
                }
                setReason("");
                onChange(entry.id);
              }}
            >
              {entry.label}
              {count === null ? null : <span className="tabular-nums opacity-70">{count}</span>}
            </Button>
          );
        })}
      </div>
      {reason ? (
        <p role="status" className="rounded-md border border-primary/30 bg-primary-soft px-4 py-3 text-sm">{reason}</p>
      ) : null}
    </div>
  );
}
