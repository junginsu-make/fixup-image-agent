"use client";

import * as React from "react";
import { Button, cn } from "@fixup/ui";
import { EASY_LOOKS, EASY_RATIOS } from "../ask";

/**
 * **비율과 결을 한 번 묻는 줄** (2026-09-21 사용자 — 「토글로 최소한 비율은
 * 물어봐주세요」).
 *
 * ── 막지 않는다 ─────────────────────────────────────────────
 *
 * 설계 §6 은 되묻지 않는다고 못 박았다. 그 뜻은 「빈칸을 채우려고 캐묻지
 * 않는다」이지 아무것도 안 묻는다가 아니다. 지금까지는 물을 자리가 없어서
 * **무엇을 적든 정사각형**이 나왔다.
 *
 * 그래서 묻되 **답을 기다리지 않는다.** 「이대로 만들기」가 늘 열려 있고,
 * 누르면 지금까지대로 간다 — 1:1, 결은 말에 맞춰 기획이 정한다.
 *
 * ── 왜 토글인가 ─────────────────────────────────────────────
 *
 * 드롭다운은 눌러야 무엇이 있는지 보인다. 여기는 **선택지가 다섯뿐**이고
 * 한 번 고르면 끝나는 자리라, 펼쳐 두는 편이 누르는 횟수가 적다.
 */
export function EasyAskChoice({
  ratio,
  look,
  onRatio,
  onLook,
  onSubmit,
  disabled,
}: {
  /** 고른 비율. 아직 안 골랐으면 비어 있다. */
  ratio?: string;
  look?: string;
  onRatio: (id: string) => void;
  onLook: (id: string) => void;
  /** 「이대로 만들기」 또는 고른 뒤 만들기. */
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-sm leading-6">
        어떤 모양으로 만들까요? <strong>안 고르셔도 됩니다.</strong> 그때는
        정사각형에, 적어 주신 말에 맞춰 만듭니다.
      </p>

      <Row label="비율" items={EASY_RATIOS} picked={ratio} onPick={onRatio} disabled={disabled} />
      <Row label="그림체" items={EASY_LOOKS} picked={look} onPick={onLook} disabled={disabled} />

      <div className="flex justify-end">
        <Button size="sm" disabled={disabled} onClick={onSubmit}>
          {ratio || look ? "이걸로 만들기" : "이대로 만들기"}
        </Button>
      </div>
    </div>
  );
}

/**
 * 한 줄짜리 토글.
 *
 * **고른 것을 다시 누르면 풀린다.** 실수로 누른 것을 되돌릴 길이 없으면
 * 「안 고름」으로 돌아가려고 새로고침을 하게 된다.
 */
function Row({
  label,
  items,
  picked,
  onPick,
  disabled,
}: {
  label: string;
  items: ReadonlyArray<{ id: string; label: string }>;
  picked?: string;
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-12 shrink-0 text-meta text-subtle-foreground">{label}</span>
      {items.map((item) => {
        const on = picked === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onPick(on ? "" : item.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-meta transition-colors disabled:opacity-50",
              on
                ? "border-primary bg-primary-soft font-medium text-primary"
                : "border-border bg-background hover:border-primary/50",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
