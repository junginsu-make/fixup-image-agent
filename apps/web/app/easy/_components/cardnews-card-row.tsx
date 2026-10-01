"use client";

import * as React from "react";
import { Button, Textarea, cn } from "@fixup/ui";
import { changedCopy, type CopyPatch } from "../cardnews-after";
import type { CardTool } from "../cardnews-state";
import type { EasyCardView } from "../cardnews-view";

const 자리이름: Record<string, string> = { cover: "표지", body: "속지", ending: "끝" };

/** 원고 줄이 장마다 쓰는 손보기 도구(3단계 §4). `use-cardnews.ts` 가 그 줄에 맞춰 만든다. */
export interface EasyCardTools {
  tool: CardTool;
  /** 보내는 중이거나 만드는 중이면 잠근다. */
  busy: boolean;
  redoCost(index: number): string;
  onToggle(index: number, mode: "edit" | "redo"): void;
  onClose(): void;
  onEdit(index: number, copy: CopyPatch): void;
  onRedo(index: number, note: string): void;
  onCaption(): void;
  onDownload(): void;
}

/**
 * **원고 · 결과의 장 한 줄**(2 · 3단계). 글을 보이고, 도구가 있으면 단추를 단다 —
 * [글 고치기]는 언제나(무료), [다시 만들기]는 만든 작업에만(값은 확인 줄에서).
 */
export function EasyCardnewsRow({ card, made, tools }: { card: EasyCardView; made: boolean; tools?: EasyCardTools }) {
  const 열림 = tools?.tool?.index === card.index ? tools.tool : null;
  return (
    <li className="grid gap-0.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span><strong>{card.index} {자리이름[card.role] ?? card.role}</strong> {card.headline}</span>
        {tools ? (
          <span className="flex shrink-0 gap-1">
            <SmallToggle on={열림?.mode === "edit"} disabled={tools.busy} onClick={() => tools.onToggle(card.index, "edit")}>글 고치기</SmallToggle>
            {made ? (
              <SmallToggle on={열림?.mode === "redo"} disabled={tools.busy} onClick={() => tools.onToggle(card.index, "redo")}>다시 만들기</SmallToggle>
            ) : null}
          </span>
        ) : null}
      </div>
      {card.body ? <span className="whitespace-pre-line text-subtle-foreground">{card.body}</span> : null}
      {/* 강조 문구 · 각주도 그림에 찍힌다. 만들기 전에 확인할 수 있게 적는다. */}
      {card.accent ? <span className="text-primary">강조: {card.accent}</span> : null}
      {card.footnote ? <span className="text-subtle-foreground">작은 글씨: {card.footnote}</span> : null}
      {tools && 열림?.mode === "edit" ? (
        // 카드 글이 바뀌면(말로 고침 등) 칸을 새로 채운다.
        <CardEditForm key={[card.headline, card.body, card.accent, card.footnote].join("|")} card={card} tools={tools} />
      ) : null}
      {tools && 열림?.mode === "redo" ? <RedoConfirm card={card} note={열림.note ?? ""} tools={tools} /> : null}
    </li>
  );
}

function SmallToggle({ on, disabled, onClick, children }: { on: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-meta transition-colors disabled:opacity-50",
        on ? "border-primary bg-primary-soft text-primary" : "border-border bg-background hover:border-primary/50",
      )}
    >
      {children}
    </button>
  );
}

const 칸들: Array<{ key: keyof CopyPatch; label: string; rows: number }> = [
  { key: "headline", label: "제목", rows: 1 },
  { key: "body", label: "본문", rows: 3 },
  { key: "accent", label: "강조", rows: 1 },
  { key: "footnote", label: "작은 글씨", rows: 1 },
];

/** **글 칸**(설계 §4). 무료. 바뀐 칸만 보내고, 비운 칸은 지운다(제목은 못 지운다). */
function CardEditForm({ card, tools }: { card: EasyCardView; tools: EasyCardTools }) {
  const 처음: CopyPatch = { headline: card.headline, body: card.body ?? "", accent: card.accent ?? "", footnote: card.footnote ?? "" };
  const [글, set글] = React.useState<CopyPatch>(처음);
  const 저장 = () => {
    const 바뀐것 = changedCopy(처음, 글);
    if (Object.keys(바뀐것).length) tools.onEdit(card.index, 바뀐것);
    else tools.onClose();
  };
  return (
    <div className="mt-1 grid gap-1.5 rounded-lg border border-border bg-background p-2">
      {칸들.map((칸) => (
        <label key={칸.key} className="grid gap-0.5">
          <span className="text-subtle-foreground">{칸.label}</span>
          <Textarea
            rows={칸.rows}
            value={글[칸.key] ?? ""}
            onChange={(event) => set글((current) => ({ ...current, [칸.key]: event.target.value }))}
            className="min-h-0 text-meta"
          />
        </label>
      ))}
      <span className="text-subtle-foreground">비운 칸은 지웁니다(제목은 지울 수 없습니다). 그림이 있는 장은 저장 뒤 다시 만들어야 그림에 반영됩니다.</span>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={tools.onClose}>그만두기</Button>
        <Button size="sm" disabled={tools.busy} onClick={저장}>저장</Button>
      </div>
    </div>
  );
}

/** **다시 만들기 확인 줄**(설계 §4). 이 단추를 눌러야 값이 나간다. */
function RedoConfirm({ card, note, tools }: { card: EasyCardView; note: string; tools: EasyCardTools }) {
  const [바라는점, set바라는점] = React.useState(note);
  React.useEffect(() => { set바라는점(note); }, [note]);
  return (
    <div className="mt-1 grid gap-1.5 rounded-lg border border-primary/40 bg-background p-2">
      <label className="grid gap-0.5">
        <span className="text-subtle-foreground">바라는 점(선택) · 예: 글자 크게, 배경 더 밝게</span>
        <Textarea rows={2} maxLength={500} value={바라는점} onChange={(event) => set바라는점(event.target.value)} className="min-h-0 text-meta" />
      </label>
      <span className="text-subtle-foreground">
        {card.hasImage ? "앞 그림은 라이브러리에 보관합니다 · " : ""}{tools.redoCost(card.index)}
      </span>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={tools.onClose}>그만두기</Button>
        <Button size="sm" disabled={tools.busy} onClick={() => tools.onRedo(card.index, 바라는점)}>{card.index}번 다시 만들기</Button>
      </div>
    </div>
  );
}
