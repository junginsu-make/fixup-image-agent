"use client";

import Link from "next/link";
import { Button, cn } from "@fixup/ui";
import { IMAGE_LOOKS, IMAGE_LOOK_LABEL } from "@fixup/shared";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { CARD_COUNTS, CARD_LANGUAGES, CARD_LANGUAGE_LABEL, CARD_RATIOS, type CardOptions } from "../cardnews-options";
import type { EasyCardnewsView } from "../cardnews-view";

const 자리이름: Record<string, string> = { cover: "표지", body: "속지", ending: "끝" };

/**
 * **카드뉴스 원고 · 진행 · 결과**(2단계 설계 §7 · §8).
 *
 * 마지막 원고에만 조건 줄과 「이대로 만들기」가 있다. 앞 원고는 접는다. 조건을 바꾸면
 * 원고를 새로 쓴다(앞 작업은 지우지 않는다, 2026-09-30 사용자 결정).
 */
export function EasyCardnewsCard({
  view, latest, busy, onGenerate, onRedraft,
}: {
  view: EasyCardnewsView;
  latest: boolean;
  busy?: boolean;
  onGenerate: () => void;
  onRedraft: (options: Partial<CardOptions>) => void;
}) {
  if (view.status === "copy_ready" && !latest) {
    return <p className="text-meta text-subtle-foreground">원고를 다시 썼습니다.</p>;
  }
  const 조건 = <K extends keyof CardOptions>(key: K, value: CardOptions[K]) =>
    onRedraft({ [key]: value } as Partial<CardOptions>);

  return (
    <div className="grid max-w-[85%] gap-3 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
      <p className="text-base leading-7">
        {view.status === "copy_ready" ? `원고를 썼습니다 (${view.total}장) · ${view.sourceLabel}`
          : view.status === "generating" ? `카드를 만드는 중입니다 (${view.done}/${view.total}장)`
            : `카드뉴스 ${view.done}장을 만들었습니다`}
      </p>
      <ol className="grid gap-1.5 text-meta">
        {view.cards.map((card) => (
          <li key={card.index} className="grid gap-0.5">
            <span><strong>{card.index} {자리이름[card.role] ?? card.role}</strong> {card.headline}</span>
            {card.body ? <span className="text-subtle-foreground">{card.body}</span> : null}
          </li>
        ))}
      </ol>

      {view.status === "copy_ready" ? (
        <>
          <div className="flex flex-wrap gap-1.5 text-meta">
            <Choice label="비율" value={view.options.ratio} items={CARD_RATIOS.map((id) => [id, id])}
              onPick={(v) => 조건("ratio", v as CardOptions["ratio"])} disabled={busy} />
            <Choice label="장수" value={String(view.options.count)}
              items={[["auto", `자동 ${view.total}장`], ...CARD_COUNTS.map((n) => [String(n), `${n}장`] as [string, string])]}
              onPick={(v) => 조건("count", v === "auto" ? "auto" : Number(v) as CardOptions["count"])} disabled={busy} />
            <Choice label="언어" value={view.options.language} items={CARD_LANGUAGES.map((id) => [id, CARD_LANGUAGE_LABEL[id]])}
              onPick={(v) => 조건("language", v as CardOptions["language"])} disabled={busy} />
            <Choice label="모델" value={view.options.modelId} items={IMAGE_MODELS.map((m) => [m.id, m.label])}
              onPick={(v) => 조건("modelId", v)} disabled={busy} />
            <Choice label="그림체" value={view.options.look} items={IMAGE_LOOKS.map((id) => [id, IMAGE_LOOK_LABEL[id]])}
              onPick={(v) => 조건("look", v as CardOptions["look"])} disabled={busy} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-meta text-subtle-foreground">고치고 싶으면 말로 해 주세요. 예: 더 짧게, 20대 말투로</span>
            <Button size="sm" disabled={busy} onClick={onGenerate}>이대로 만들기 · {view.cost.label}</Button>
          </div>
        </>
      ) : null}

      {view.issues.length && view.status === "copy_ready" ? (
        <p className="text-meta text-subtle-foreground">{view.issues.join(" ")}</p>
      ) : null}

      {view.status !== "copy_ready" ? (
        <Button asChild size="sm" variant="secondary" className="w-fit">
          <Link href={`/sns/${view.projectId}`}>카드뉴스 화면에서 이어서 작업</Link>
        </Button>
      ) : null}
    </div>
  );
}

function Choice({ label, value, items, onPick, disabled }: {
  label: string;
  value: string;
  items: Array<[string, string]>;
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5", disabled && "opacity-50")}>
      <span className="text-subtle-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => { if (event.target.value !== value) onPick(event.target.value); }}
        className="bg-transparent"
      >
        {items.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}
