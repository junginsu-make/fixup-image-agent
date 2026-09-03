"use client";

import { Button, Input, Label, Textarea } from "@fixup/ui";
import type { LayoutSlot, SlotKind, TextField } from "@fixup/layout-core";
import { LibraryPicker } from "./library-picker";
import { SLOT_LABEL, TEXT_FIELD_LABEL, convertSlot, roundBox } from "./slot-defaults";

const SELECT_CLASS = "h-9 rounded-md border bg-background px-2 text-sm";
const KINDS: SlotKind[] = ["background", "image", "logo", "text"];
const FIELDS: TextField[] = ["headline", "body", "accent", "footnote"];

export interface SlotInspectorProps {
  slot: LayoutSlot;
  offset: number;
  onChange(slot: LayoutSlot): void;
  onRemove(): void;
}

/** 0~1 비율을 사람이 읽는 퍼센트로 주고받는다. */
function BoxFields({ slot, onChange }: { slot: LayoutSlot; onChange(slot: LayoutSlot): void }) {
  const fields: Array<{ key: keyof LayoutSlot["box"]; label: string }> = [
    { key: "x", label: "왼쪽" },
    { key: "y", label: "위" },
    { key: "width", label: "너비" },
    { key: "height", label: "높이" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {fields.map((field) => (
        <label key={field.key} className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{field.label} %</span>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(slot.box[field.key] * 100)}
            onChange={(event) => onChange({
              ...slot,
              box: roundBox({ ...slot.box, [field.key]: Number(event.target.value) / 100 }),
            })}
          />
        </label>
      ))}
    </div>
  );
}

export function SlotInspector({ slot, offset, onChange, onRemove }: SlotInspectorProps) {
  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">{offset + 1}번 {SLOT_LABEL[slot.kind]} 칸</strong>
        {/* 순서는 레이어 목록에서 끌어 옮긴다. 여기서는 이 칸의 내용만 다룬다. */}
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}>삭제</Button>
      </div>

      <label className="grid gap-1">
        <Label>종류</Label>
        <select
          className={SELECT_CLASS}
          value={slot.kind}
          onChange={(event) => onChange(convertSlot(slot, event.target.value as SlotKind))}
        >
          {KINDS.map((kind) => <option key={kind} value={kind}>{SLOT_LABEL[kind]}</option>)}
        </select>
      </label>

      <BoxFields slot={slot} onChange={onChange} />

      {slot.kind === "background" ? (
        <label className="grid gap-1">
          <Label>색</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-14 rounded border bg-background"
              value={slot.fill}
              onChange={(event) => onChange({ ...slot, fill: event.target.value.toUpperCase() })}
            />
            <span className="text-sm text-muted-foreground">{slot.fill}</span>
          </div>
        </label>
      ) : null}

      {slot.kind === "image" ? (
        <label className="grid gap-1">
          <Label>이 칸에 무엇을 그릴까</Label>
          <Textarea
            rows={3}
            placeholder="비우면 카드 기획의 그림 설명을 씁니다."
            value={slot.brief ?? ""}
            onChange={(event) => onChange({ ...slot, brief: event.target.value || undefined })}
          />
        </label>
      ) : null}

      {slot.kind === "logo" ? (
        <div className="grid gap-2">
          <Label>로고 그림</Label>
          <p className="text-xs text-muted-foreground">
            AI 를 거치지 않고 그대로 놓습니다. 모델이 다시 그리면 항상 다른 로고가 됩니다.
          </p>
          <LibraryPicker
            value={slot.referenceImageId || undefined}
            onPick={(id) => onChange({ ...slot, referenceImageId: id })}
            size="icon"
            emptyHint="라이브러리에 그림이 없습니다. 로고를 먼저 올려 주세요."
          />
        </div>
      ) : null}

      {slot.kind === "text" ? <TextFields slot={slot} onChange={onChange} /> : null}
    </div>
  );
}

function TextFields({ slot, onChange }: {
  slot: Extract<LayoutSlot, { kind: "text" }>;
  onChange(slot: LayoutSlot): void;
}) {
  const style = slot.style;

  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <Label>무엇을 넣나</Label>
        <select
          className={SELECT_CLASS}
          value={slot.source.from === "fixed" ? "fixed" : slot.source.field}
          onChange={(event) => onChange({
            ...slot,
            source: event.target.value === "fixed"
              ? { from: "fixed", text: "자세히 보기" }
              : { from: "copy", field: event.target.value as TextField },
          })}
        >
          {FIELDS.map((field) => <option key={field} value={field}>원고의 {TEXT_FIELD_LABEL[field]}</option>)}
          <option value="fixed">고정 문구</option>
        </select>
      </label>

      {slot.source.from === "fixed" ? (
        <label className="grid gap-1">
          <Label>고정 문구</Label>
          <Input
            value={slot.source.text}
            onChange={(event) => onChange({ ...slot, source: { from: "fixed", text: event.target.value } })}
          />
        </label>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">굵기</span>
          <select
            className={SELECT_CLASS}
            value={style.weight}
            onChange={(event) => onChange({ ...slot, style: { ...style, weight: Number(event.target.value) as 400 | 700 } })}
          >
            <option value={400}>보통</option>
            <option value={700}>굵게</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">칸 높이 대비 글자 %</span>
          <Input
            type="number"
            min={1}
            max={200}
            value={Math.round(style.sizeRatio * 100)}
            onChange={(event) => onChange({ ...slot, style: { ...style, sizeRatio: Math.max(0.01, Number(event.target.value) / 100) } })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">줄 간격</span>
          <Input
            type="number"
            min={0.8}
            max={3}
            step={0.05}
            value={style.lineHeight}
            onChange={(event) => onChange({ ...slot, style: { ...style, lineHeight: Number(event.target.value) } })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">색</span>
          <input
            type="color"
            className="h-9 w-full rounded border bg-background"
            value={style.color}
            onChange={(event) => onChange({ ...slot, style: { ...style, color: event.target.value.toUpperCase() } })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">가로</span>
          <select
            className={SELECT_CLASS}
            value={style.align}
            onChange={(event) => onChange({ ...slot, style: { ...style, align: event.target.value as typeof style.align } })}
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">세로</span>
          <select
            className={SELECT_CLASS}
            value={style.valign}
            onChange={(event) => onChange({ ...slot, style: { ...style, valign: event.target.value as typeof style.valign } })}
          >
            <option value="top">위</option>
            <option value="middle">가운데</option>
            <option value="bottom">아래</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        글자 수 상한은 없습니다. 칸을 넘치면 글꼴을 60%까지 줄여 맞추고, 그래도 넘치면 알려 줍니다.
      </p>
    </div>
  );
}
