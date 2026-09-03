"use client";

import { Button, Input, Label, Textarea } from "@fixup/ui";

/**
 * 원고를 꽂아 보고, 만들기 전에 값을 본다.
 *
 * 미리보기에서는 fal 을 부르지 않는다 — 미리 보는 데 돈이 나가면 아무도
 * 미리 보지 않는다. 대신 **부를 횟수와 값**을 같이 보여 준다. 그림 칸이
 * 둘이면 두 번 부르고 비용도 두 배다.
 */

export interface PreviewCopy {
  headline: string;
  body: string;
  accent: string;
  footnote: string;
}

export interface SlotEstimate {
  slot: number;
  modelLabel: string;
  request: string;
  unitCostUsd: number;
  cropped: boolean;
  notes: string[];
}

export interface PreviewResult {
  image: string;
  warnings: string[];
  estimate: { calls: number; totalUsd: number; slots: SlotEstimate[] };
}

export function PreviewPanel({ copy, onCopyChange, result, busy, onPreview }: {
  copy: PreviewCopy;
  onCopyChange(copy: PreviewCopy): void;
  result: PreviewResult | null;
  busy: boolean;
  onPreview(): void;
}) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">원고 넣어 보기</h3>
          <p className="text-sm text-muted-foreground">
            실제로는 이미 만든 원고가 칸에 꽂힙니다. 여기서는 길이가 맞는지 보려고 직접 넣습니다.
          </p>
        </div>
        <label className="grid gap-1"><Label>제목</Label>
          <Input value={copy.headline} onChange={(event) => onCopyChange({ ...copy, headline: event.target.value })} />
        </label>
        <label className="grid gap-1"><Label>본문</Label>
          <Textarea rows={3} value={copy.body} onChange={(event) => onCopyChange({ ...copy, body: event.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1"><Label>강조</Label>
            <Input value={copy.accent} onChange={(event) => onCopyChange({ ...copy, accent: event.target.value })} />
          </label>
          <label className="grid gap-1"><Label>작은 글씨</Label>
            <Input value={copy.footnote} onChange={(event) => onCopyChange({ ...copy, footnote: event.target.value })} />
          </label>
        </div>
        <Button type="button" onClick={onPreview} disabled={busy}>
          {busy ? "그리는 중…" : "이 틀로 그려 보기"}
        </Button>
      </section>

      {result ? (
        <section className="grid gap-3 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">그려 본 결과</h3>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL 이라 최적화 대상이 아니다. */}
          <img src={result.image} alt="이 틀로 그린 카드" className="w-full rounded-md border" />

          <div className="grid gap-1 text-sm">
            <p>
              <strong>fal 호출 {result.estimate.calls}번</strong>
              {result.estimate.calls > 0 ? ` · 약 $${result.estimate.totalUsd.toFixed(3)}` : " · 그림 칸이 없어 비용이 들지 않습니다."}
            </p>
            {result.estimate.slots.map((entry) => (
              <p key={entry.slot} className="text-xs text-muted-foreground">
                {entry.slot}번 칸 · {entry.modelLabel} · {entry.request} · ${entry.unitCostUsd.toFixed(3)}
                {entry.cropped ? " · 가운데를 잘라 넣습니다" : ""}
                {entry.notes.length ? ` · ${entry.notes.join(" ")}` : ""}
              </p>
            ))}
          </div>

          {result.warnings.length ? (
            <ul className="grid gap-1 rounded-md bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
