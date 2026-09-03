"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Label } from "@fixup/ui";
import { MAX_CARDS, MIN_CARDS } from "@fixup/sns-core";
import {
  DECK_ROLE_LABEL,
  validateDeck,
  type CardTemplate,
  type DeckRole,
  type LayoutDeck,
  type LayoutSlot,
} from "@fixup/layout-core";
import type { PreviewCopy } from "./preview-panel";

/**
 * 세트 — 표지 1장 · 속지 N장 · 엔딩 1장을 한 번에 정한다.
 *
 * 장마다 드롭다운을 여는 대신 **자리별로 한 번씩만** 고른다. 속지가 넉 장이든
 * 여섯 장이든 고르는 일은 한 번이다.
 *
 * 왼쪽 편집기에서 고친 틀을 그대로 자리에 넣을 수 있다. 편집기는 하나뿐이고,
 * 여기는 그 결과를 자리에 꽂는 곳이다.
 */

const ROLES = Object.keys(DECK_ROLE_LABEL) as DeckRole[];
const SELECT_CLASS = "h-9 rounded-md border bg-background px-2 text-sm";
const COUNTS = Array.from({ length: MAX_CARDS - MIN_CARDS + 1 }, (_unused, offset) => MIN_CARDS + offset);

interface SavedDeck extends LayoutDeck {
  id: string;
  createdAt: string;
}

interface DeckPreview {
  cards: Array<{ index: number; role: DeckRole }>;
  frames: Record<DeckRole, { image: string; warnings: string[] }>;
  estimate: {
    calls: number;
    totalUsd: number;
    roles: Array<{ role: DeckRole; cards: number; usd: number; slots: Array<{ modelLabel: string; request: string; cropped: boolean; notes: string[] }> }>;
    issues: string[];
  };
}

/** 자리마다 어떤 틀을 넣었는지, 그 틀이 어디서 왔는지. */
interface Frame {
  from: string;
  slots: LayoutSlot[];
}

export interface DeckPanelProps {
  ratioId: string;
  modelId: string;
  copy: PreviewCopy;
  /** 왼쪽 편집기가 지금 들고 있는 칸들. */
  editing: LayoutSlot[];
  templates: CardTemplate[];
  /** 저장한 세트를 불러오면 그 세트가 쓰던 비율로 화면을 맞춘다. */
  onRatioChange(ratio: string): void;
}

export function DeckPanel({ ratioId, modelId, copy, editing, templates, onRatioChange }: DeckPanelProps) {
  const [total, setTotal] = useState(6);
  const [frames, setFrames] = useState<Record<DeckRole, Frame | undefined>>({
    cover: undefined,
    body: undefined,
    ending: undefined,
  });
  const [name, setName] = useState("");
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [preview, setPreview] = useState<DeckPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "apply" | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  const ready = ROLES.every((role) => frames[role]?.slots.length);
  const deck: LayoutDeck | null = useMemo(() => {
    if (!ready) return null;
    return {
      name: name.trim() || "이름 없는 세트",
      ratio: ratioId,
      total,
      frames: {
        cover: frames.cover!.slots,
        body: frames.body!.slots,
        ending: frames.ending!.slots,
      },
    };
  }, [frames, name, ratioId, ready, total]);

  const issues = useMemo(() => (deck ? validateDeck(deck) : []), [deck]);
  const blocked = issues.some((issue) => issue.severity === "error");

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/sns/layout/decks", { cache: "no-store" });
      const payload = await response.json();
      if (payload.ok) setDecks(payload.decks as SavedDeck[]);
    } catch {
      setNotes(["저장한 세트를 불러오지 못했습니다."]);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // 비율·모델이 바뀌면 앞서 그려 본 것은 더 이상 이 세트의 모습이 아니다.
  useEffect(() => { setPreview(null); }, [ratioId, modelId]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/sns/projects", { cache: "no-store" });
        const payload = await response.json();
        if (payload.ok) setProjects(payload.projects.map((entry: { id: string; title: string }) => ({ id: entry.id, title: entry.title })));
      } catch {
        setNotes(["작업 목록을 불러오지 못했습니다."]);
      }
    })();
  }, []);

  function putFrame(role: DeckRole, frame: Frame) {
    setFrames((current) => ({ ...current, [role]: frame }));
    setPreview(null);
  }

  function loadDeck(id: string) {
    const found = decks.find((entry) => entry.id === id);
    if (!found) return;
    setTotal(found.total);
    setName(found.name);
    // 세트는 자기 비율을 안다. 지금 화면 비율에 억지로 끼우면 저장할 때 그대로 굳는다.
    if (found.ratio !== ratioId) onRatioChange(found.ratio);
    setFrames({
      cover: { from: "저장한 세트", slots: found.frames.cover },
      body: { from: "저장한 세트", slots: found.frames.body },
      ending: { from: "저장한 세트", slots: found.frames.ending },
    });
    setPreview(null);
  }

  /**
   * 이 세트로 실제 카드뉴스를 만들게 한다.
   *
   * 붙이고 나면 그 작업은 칸마다 그림을 시키고 글은 서버가 그리는 길로 간다.
   * 안 붙인 작업은 지금까지대로 통째로 그린다 — 기존 동작은 그대로다.
   */
  async function applyToProject(clear: boolean) {
    if (!projectId || (!clear && !deck)) return;
    setBusy("apply");
    setNotes([]);
    try {
      const response = await fetch("/api/sns/layout/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(clear ? { projectId, clear: true } : { projectId, deck }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "작업에 붙이지 못했습니다.");
      setNotes([clear
        ? `${payload.total}장에서 틀을 뺐습니다. 지금까지 방식으로 만듭니다.`
        : `${payload.total}장 중 ${payload.applied}장에 이 세트를 붙였습니다. 이제 그 작업에서 만들면 이 틀대로 나옵니다.`]);
    } catch (error) {
      setNotes([error instanceof Error ? error.message : "작업에 붙이지 못했습니다."]);
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: "preview" | "save") {
    if (!deck) return;
    setBusy(kind);
    setNotes([]);
    try {
      const url = kind === "preview" ? "/api/sns/layout/deck-preview" : "/api/sns/layout/decks";
      const body = kind === "preview" ? { deck, modelId, copy } : deck;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "요청이 실패했습니다.");

      if (kind === "preview") {
        setPreview({ cards: payload.cards, frames: payload.frames, estimate: payload.estimate });
      } else {
        setNotes([`「${payload.deck.name}」 세트를 저장했습니다.`]);
        await reload();
      }
    } catch (error) {
      setNotes([error instanceof Error ? error.message : "요청이 실패했습니다."]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">카드 몇 장</h3>
          <p className="text-sm text-muted-foreground">
            표지와 엔딩은 언제나 한 장씩입니다. 나머지가 속지가 됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => { setTotal(count); setPreview(null); }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${total === count ? "border-primary bg-primary-soft" : "bg-background"}`}
            >
              {count}장
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          표지 1장 · 속지 {total - 2}장 · 엔딩 1장
          {" · "}원본 그대로 쓸 장을 넣으면 그만큼 속지가 줄어듭니다.
        </p>
      </section>

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">자리마다 틀</h3>
          <p className="text-sm text-muted-foreground">
            세트에는 <strong>표지·속지·엔딩 세 가지</strong>가 필요합니다. 편집기는 한 번에 하나만 다루므로,
            왼쪽에서 하나 만들고 그 자리에 넣은 뒤 다음 자리를 만듭니다.
          </p>
        </div>
        {ROLES.map((role) => {
          const chosen = frames[role];
          return (
            <div key={role} className="grid gap-1.5 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{DECK_ROLE_LABEL[role]}</strong>
                <span className={`text-xs ${chosen ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                  {chosen ? `${chosen.from} · 칸 ${chosen.slots.length}개` : "아직 안 골랐습니다"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={chosen ? "outline" : "default"}
                  onClick={() => putFrame(role, { from: "지금 만든 것", slots: editing })}
                >
                  지금 만든 것 넣기
                </Button>
                <select
                  className={`${SELECT_CLASS} flex-1`}
                  value=""
                  onChange={(event) => {
                    const found = templates.find((entry) => entry.id === event.target.value);
                    if (found) putFrame(role, { from: found.name, slots: found.slots });
                  }}
                >
                  <option value="" disabled>저장해 둔 틀에서 고르기</option>
                  {templates.filter((entry) => entry.role === role).map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </section>

      {issues.length ? (
        <ul className="grid gap-1 rounded-lg border p-4 text-sm">
          {issues.map((issue) => (
            <li key={issue.message} className={issue.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
              {issue.severity === "error" ? "막힘 · " : "살펴보기 · "}{issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!ready || blocked || busy === "preview"} onClick={() => run("preview")}>
          {busy === "preview" ? "그리는 중…" : "세트 미리보기"}
        </Button>
        <Input
          className="w-56"
          placeholder="세트 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!ready || blocked || !name.trim() || busy === "save"}
          onClick={() => run("save")}
        >
          세트 저장
        </Button>
        {decks.length ? (
          <select className={SELECT_CLASS} defaultValue="" onChange={(event) => loadDeck(event.target.value)}>
            <option value="" disabled>저장한 세트 불러오기</option>
            {decks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.total}장</option>)}
          </select>
        ) : null}
      </div>

      <section className="grid gap-2 rounded-lg border bg-card p-4">
        <h3 className="font-semibold">카드뉴스 작업에 넣기</h3>
        <p className="text-sm text-muted-foreground">
          넣은 작업은 이 틀대로 나옵니다. 안 넣은 작업은 지금까지대로 만들어집니다.
          만드는 중에는 바꿀 수 없습니다.
        </p>
        {projects.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${SELECT_CLASS} min-w-52`} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">작업 고르기</option>
              {projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
            <Button type="button" disabled={!projectId || !ready || blocked || busy === "apply"} onClick={() => applyToProject(false)}>
              이 세트 넣기
            </Button>
            <Button type="button" variant="outline" disabled={!projectId || busy === "apply"} onClick={() => applyToProject(true)}>
              틀 빼기
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">아직 카드뉴스 작업이 없습니다. 먼저 카드뉴스를 만들어 주세요.</p>
        )}
      </section>

      {notes.length ? (
        <ul className="grid gap-1 rounded-lg border bg-muted/40 p-4 text-sm">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}

      {preview ? <DeckResult preview={preview} /> : null}
    </div>
  );
}

function DeckResult({ preview }: { preview: DeckPreview }) {
  const warnings = [
    ...preview.estimate.issues,
    ...ROLES.flatMap((role) => preview.frames[role]?.warnings ?? []),
  ];

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4">
      <h3 className="font-semibold">이렇게 나옵니다</h3>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {preview.cards.map((card) => (
          <figure key={card.index} className="w-32 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL 이라 최적화 대상이 아니다. */}
            <img
              src={preview.frames[card.role].image}
              alt={`${card.index}번 ${DECK_ROLE_LABEL[card.role]}`}
              className="w-full rounded border"
            />
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">
              {card.index} {DECK_ROLE_LABEL[card.role]}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        같은 자리 카드는 같은 틀·같은 원고라 그림도 같습니다. 실제로는 장마다 다른 원고가 들어갑니다.
      </p>

      <div className="grid gap-1 text-sm">
        <p>
          <strong>fal 호출 {preview.estimate.calls}번</strong>
          {preview.estimate.calls > 0
            ? ` · 약 $${preview.estimate.totalUsd.toFixed(3)}`
            : " · 그림 칸이 없어 비용이 들지 않습니다."}
        </p>
        {preview.estimate.roles.map((entry) => (
          <p key={entry.role} className="text-xs text-muted-foreground">
            {DECK_ROLE_LABEL[entry.role]} {entry.cards}장 · 장당 그림 칸 {entry.slots.length}개 · ${entry.usd.toFixed(3)}
            {entry.slots.some((slot) => slot.cropped) ? " · 일부 칸은 가운데를 잘라 넣습니다" : ""}
          </p>
        ))}
      </div>

      {warnings.length ? (
        <ul className="grid gap-1 rounded-md bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
