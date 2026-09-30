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
  view, latest, busy, redrafting, starting, onGenerate, onRedraft,
}: {
  view: EasyCardnewsView;
  latest: boolean;
  busy?: boolean;
  /** 조건을 바꿔 이 원고를 다시 쓰는 중(1~2분). */
  redrafting?: boolean;
  /** 「이대로 만들기」를 보냈고 첫 장을 준비하는 중(몇 분 걸린다, 2026-09-30 실제 생성). */
  starting?: boolean;
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
            {card.body ? <span className="whitespace-pre-line text-subtle-foreground">{card.body}</span> : null}
            {/* 강조 문구 · 각주도 그림에 찍힌다. 만들기 전에 확인할 수 있게 적는다. */}
            {card.accent ? <span className="text-primary">강조: {card.accent}</span> : null}
            {card.footnote ? <span className="text-subtle-foreground">작은 글씨: {card.footnote}</span> : null}
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
          {starting ? (
            <p role="status" className="text-meta text-primary">카드 만들기를 준비하고 있습니다. 첫 장이 나오기까지 몇 분 걸릴 수 있습니다.</p>
          ) : null}
          {redrafting ? (
            <p role="status" className="text-meta text-primary">바꾼 조건으로 원고를 새로 쓰고 있습니다. 1~2분 걸립니다.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-meta text-subtle-foreground">고치고 싶으면 말로 해 주세요. 예: 더 짧게, 20대 말투로</span>
            <Button size="sm" disabled={busy} onClick={onGenerate}>이대로 만들기 · {view.cost.label}</Button>
          </div>
        </>
      ) : null}

      {view.issues.length && view.status === "copy_ready" ? (
        <p className="text-meta text-subtle-foreground">{view.issues.join(" ")}</p>
      ) : null}

      {view.status !== "copy_ready" && view.failed.length ? (
        <p className="text-meta text-destructive">
          {view.failed.join(", ")}번 장은 만들지 못했습니다. 만든 장만큼만 값이 듭니다. 카드뉴스 화면에서 다시 만들 수 있습니다.
        </p>
      ) : null}

      {view.status !== "copy_ready" && view.review.length ? (
        <p className="text-meta text-subtle-foreground">
          {view.review.join(", ")}번 장은 자동 검수가 글자를 한 번 확인해 보라고 했습니다. 틀린 곳이 있으면 카드뉴스 화면에서 그 장만 다시 만들 수 있습니다.
        </p>
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
