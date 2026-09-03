"use client";

import { useState } from "react";
import type { LayoutSlot } from "@fixup/layout-core";
import { SLOT_LABEL, TEXT_FIELD_LABEL } from "./slot-defaults";

/**
 * 레이어 목록 — 디자인 도구가 하는 그대로.
 *
 * 전에는 칸을 고른 뒤 「위로 / 아래로」 버튼을 눌러야 순서를 바꿨다. 지금 몇
 * 층인지, 무엇이 무엇을 덮고 있는지 볼 수가 없었다. **끌어서 옮기고 눈으로
 * 확인하는 것**이 이 일의 본래 모습이다.
 *
 * **맨 위 줄이 맨 위 층이다.** 칸 배열은 뒤쪽이 위에 그려지므로 여기서는
 * 뒤집어 보여 준다 — 화면에서 위에 있는 것이 목록에서도 위에 있어야 한다.
 */

export interface LayerListProps {
  slots: LayoutSlot[];
  selected: number | null;
  onSelect(offset: number): void;
  /** `from` 번째 칸을 `to` 번째 자리로 옮긴다. 둘 다 칸 배열 기준이다. */
  onReorder(from: number, to: number): void;
  onRemove(offset: number): void;
}

/** 그 줄만 보고도 무엇인지 알 수 있게. */
function describe(slot: LayoutSlot): string {
  if (slot.kind === "text") {
    return slot.source.from === "fixed"
      ? `「${slot.source.text.slice(0, 14)}」`
      : `원고의 ${TEXT_FIELD_LABEL[slot.source.field]}`;
  }
  if (slot.kind === "background") return slot.fill;
  if (slot.kind === "logo") return slot.referenceImageId ? "고른 그림" : "아직 안 고름";
  return slot.brief?.slice(0, 16) ?? "AI 가 그림";
}

const DOT: Record<LayoutSlot["kind"], string> = {
  background: "bg-slate-400",
  image: "bg-sky-500",
  logo: "bg-amber-500",
  text: "bg-emerald-500",
};

export function LayerList({ slots, selected, onSelect, onReorder, onRemove }: LayerListProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // 위가 위층. 배열 뒤쪽이 위에 그려지므로 뒤집어 보여 준다.
  const rows = slots.map((slot, offset) => ({ slot, offset })).reverse();

  return (
    <div className="grid gap-1">
      <p className="text-[11px] text-muted-foreground">레이어 · 위가 앞에 보입니다. 끌어서 순서를 바꿉니다.</p>
      <ul className="grid gap-1">
        {rows.map(({ slot, offset }) => (
          <li
            key={offset}
            draggable
            onDragStart={() => setDragging(offset)}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={(event) => { event.preventDefault(); setOver(offset); }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== offset) onReorder(dragging, offset);
              setDragging(null);
              setOver(null);
            }}
            onClick={() => onSelect(offset)}
            className={`flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
              selected === offset ? "border-primary bg-primary-soft" : "bg-card"
            } ${over === offset && dragging !== offset ? "ring-2 ring-primary/50" : ""}`}
          >
            <span aria-hidden className="text-muted-foreground">⠿</span>
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${DOT[slot.kind]}`} />
            <strong className="shrink-0">{SLOT_LABEL[slot.kind]}</strong>
            <span className="truncate text-muted-foreground">{describe(slot)}</span>
            <button
              type="button"
              aria-label={`${offset + 1}번 칸 삭제`}
              className="ml-auto shrink-0 rounded px-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(event) => { event.stopPropagation(); onRemove(offset); }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
