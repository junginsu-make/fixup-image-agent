"use client";

import Link from "next/link";
import { Button, cn } from "@fixup/ui";
import { IMAGE_LOOKS, IMAGE_LOOK_LABEL } from "@fixup/shared";
import { ImageModelPicker } from "../../_components/image-model-picker";
import { CARD_COUNTS, CARD_LANGUAGES, CARD_LANGUAGE_LABEL, CARD_RATIOS, type CardOptions } from "../cardnews-options";
import type { EasyCardnewsView } from "../cardnews-view";
import { EasyCardnewsCaption } from "./cardnews-caption";
import { EasyCardnewsRow, type EasyCardTools } from "./cardnews-card-row";
import { SLOW_CARD_NOTICE } from "../../sns/slow-card";
import { useSlowCards } from "../../sns/use-slow-cards";

/**
 * **카드뉴스 원고 · 진행 · 결과**(2단계 설계 §7 · §8).
 *
 * 마지막 원고에만 조건 줄과 「이대로 만들기」가 있다. 앞 원고는 접는다. 조건을 바꾸면
 * 원고를 새로 쓴다(앞 작업은 지우지 않는다, 2026-09-30 사용자 결정).
 *
 * **만든 작업**(그림이 한 장이라도 있다)에는 「이대로 만들기」 · 조건 줄을 안 내고, 장마다
 * 손보기 단추와 게시글 · 전부 받기를 단다(3단계 §4). 원고 단계를 상태로만 가르면 안 된다 —
 * 한 장 글을 저장하면 상태가 원고로 돌아와, 누르면 전 장 값이 나간다(3단계 설계 §2 위험).
 */
export function EasyCardnewsCard({
  view, latest, busy, redrafting, starting, onGenerate, onRedraft, tools,
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
  /** 손보기 도구(3단계). 마지막 원고 줄에만 온다. */
  tools?: EasyCardTools;
}) {
  const 원고단계 = view.status === "copy_ready" && !view.made;
  /** fal 에 보낸 지 3분이 넘은 장(2026-10-07 Task 6). 안내만 한다. 훅이라 이른 돌려주기보다 앞에 둔다. */
  const 늦은장 = useSlowCards(view.cards);
  if (원고단계 && !latest) {
    return <p className="text-meta text-subtle-foreground">원고를 다시 썼습니다.</p>;
  }
  const 조건 = <K extends keyof CardOptions>(key: K, value: CardOptions[K]) =>
    onRedraft({ [key]: value } as Partial<CardOptions>);

  return (
    <div className="grid max-w-[85%] gap-3 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
      <p className="text-base leading-7">
        {원고단계 ? `원고를 썼습니다 (${view.total}장) · ${view.sourceLabel}`
          : view.status === "generating" ? `카드를 만드는 중입니다 (${view.done}/${view.total}장)`
            : `카드뉴스 ${view.done}장을 만들었습니다`}
      </p>
      {늦은장.length ? (
        <p role="status" className="text-meta text-primary">{늦은장.join(", ")}번 장: {SLOW_CARD_NOTICE}</p>
      ) : null}
      <ol className="grid gap-1.5 text-meta">
        {view.cards.map((card) => (
          <EasyCardnewsRow key={card.index} card={card} made={view.made} tools={latest ? tools : undefined} />
        ))}
      </ol>

      {원고단계 ? (
        <>
          <div className="flex flex-wrap gap-1.5 text-meta">
            <Choice label="비율" value={view.options.ratio} items={CARD_RATIOS.map((id) => [id, id])}
              onPick={(v) => 조건("ratio", v as CardOptions["ratio"])} disabled={busy} />
            <Choice label="장수" value={String(view.options.count)}
              items={[["auto", `자동 ${view.total}장`], ...CARD_COUNTS.map((n) => [String(n), `${n}장`] as [string, string])]}
              onPick={(v) => 조건("count", v === "auto" ? "auto" : Number(v) as CardOptions["count"])} disabled={busy} />
            <Choice label="언어" value={view.options.language} items={CARD_LANGUAGES.map((id) => [id, CARD_LANGUAGE_LABEL[id]])}
              onPick={(v) => 조건("language", v as CardOptions["language"])} disabled={busy} />
            <ImageModelPicker value={view.options.modelId} legend="모델"
              onChange={(v) => { if (v !== view.options.modelId) 조건("modelId", v); }} disabled={busy} />
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

      {view.issues.length && 원고단계 ? (
        <p className="text-meta text-subtle-foreground">{view.issues.join(" ")}</p>
      ) : null}

      {view.made && view.failed.length ? (
        <p className="text-meta text-destructive">
          {view.failed.join(", ")}번 장은 만들지 못했습니다. 만든 장만큼만 값이 듭니다. 그 장의 「다시 만들기」로 다시 만들 수 있습니다.
        </p>
      ) : null}

      {view.made && view.review.length ? (
        <p className="text-meta text-subtle-foreground">
          {view.review.join(", ")}번 장은 자동 검수가 글자를 한 번 확인해 보라고 했습니다. 틀린 곳이 있으면 그 장의 「다시 만들기」로 다시 만들 수 있습니다.
        </p>
      ) : null}

      {view.made && latest && view.caption ? <EasyCardnewsCaption caption={view.caption} /> : null}

      {view.made ? (
        <div className="flex flex-wrap gap-1.5">
          {latest && tools ? (
            <>
              <Button size="sm" variant="secondary" disabled={tools.busy} onClick={tools.onCaption}>
                {view.caption ? "게시글 다시 쓰기" : "게시글 쓰기"}
              </Button>
              <Button size="sm" variant="secondary" disabled={tools.busy} onClick={tools.onDownload}>전부 받기</Button>
            </>
          ) : null}
          <Button asChild size="sm" variant="ghost" className="w-fit">
            <Link href={`/sns/${view.projectId}`}>카드뉴스 화면에서 이어서 작업</Link>
          </Button>
        </div>
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
