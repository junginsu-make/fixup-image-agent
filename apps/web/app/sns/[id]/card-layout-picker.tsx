"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Label } from "@fixup/ui";
import { CARD_RATIOS } from "@fixup/sns-core";
import { DEFAULT_TEMPLATES, templateSummary, type CardTemplate } from "@fixup/layout-core";
import type { SnsFlowCard } from "../../api/sns/flow-service";
import { TemplateFacts, TemplateThumb } from "../_components/template-thumb";

/**
 * 이 카드 하나만 다른 틀로.
 *
 * 세트는 자리별로 한 번에 붙이는 편의이고, 여기는 그 위에 얹는 예외다 —
 * 「3번 속지만 다른 모양으로」가 실제로 자주 필요하다. 여기서 고르면 그
 * 카드만 바뀌고 나머지는 세트가 준 것을 그대로 쓴다.
 *
 * 고르지 않으면 **지금까지 방식**(카드를 통째로 AI 가 그리기)이다. 기존
 * 동작을 건드리지 않는다.
 *
 * ── 왜 드롭다운이 아닌가 ──────────────────────────────────────
 *
 * 예전에는 이름만 늘어선 드롭다운이었다. 「속지 · 왼쪽 글, 오른쪽 그림」과
 * 「속지 · 글 위, 그림 아래」는 **글자로 읽으면 비슷하고 그림으로 보면 한눈에
 * 다르다.** 어떻게 생겼는지 보려면 편집기로 건너가 직접 짜 보는 수밖에
 * 없었다 — 가장 쉬워야 할 주 경로가 가장 안 보였다. 설계 문서가 처음부터
 * 「고르면 그 자리에서 뼈대 미리보기를 보여 준다」고 한 것이 이것이다.
 */

interface SavedTemplate extends CardTemplate {
  createdAt: string;
}

/** 고른 뒤에는 접어 둔다. 카드마다 아홉 칸이 펼쳐져 있으면 원고가 안 보인다. */
function useCollapsed(hasChoice: boolean) {
  const [open, setOpen] = useState(!hasChoice);
  return { open, setOpen };
}

export function CardLayoutPicker({ projectId, card, ratioId, onChanged }: {
  projectId: string;
  card: SnsFlowCard;
  /** 작업의 비율. 손톱 그림을 실제 카드 모양으로 그리려면 있어야 한다. */
  ratioId?: string;
  onChanged(): void;
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { open, setOpen } = useCollapsed(Boolean(card.layout));

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/sns/layout/templates", { cache: "no-store" });
        const payload = await response.json();
        if (payload.ok) setSaved(payload.saved as SavedTemplate[]);
      } catch {
        // 저장한 틀을 못 불러온 것뿐이다. 기본 틀은 코드에 있어 그대로 쓸 수 있다.
      }
    })();
  }, []);

  const choices = [...DEFAULT_TEMPLATES, ...saved].filter((entry) => entry.role === card.role);
  const chosen = card.layout
    ? choices.find((entry) => entry.id === card.layout!.templateId)
    : undefined;
  const currentName = card.layout ? chosen?.name ?? "직접 고친 틀" : undefined;
  const shape = CARD_RATIOS.find((entry) => entry.id === ratioId)?.pixel;

  const send = useCallback(async (body: unknown, done: string) => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/sns/layout/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message ?? "틀을 바꾸지 못했습니다.");
      setNote(done);
      onChanged();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "틀을 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  if (card.kind !== "generated") return null;

  /** 지금 붙어 있는 칸들. 직접 고친 틀이면 목록에 없으므로 카드 것을 쓴다. */
  const currentSlots = card.layout?.slots ?? chosen?.slots;
  const emptyLogos = currentSlots ? templateSummary(currentSlots).emptyLogos : 0;

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>이 카드의 틀</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {currentName ?? "고르지 않음 · 통째로 그리기"}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? "접기" : "바꾸기"}
          </Button>
          {card.layout ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void send({ projectId, cardIndex: card.index, clear: true }, "틀을 뗐습니다. 통째로 그립니다.")}
            >
              떼기
            </Button>
          ) : null}
        </div>
      </div>

      {/* 지금 붙은 틀은 접어 둬도 보인다 — 「무엇이 붙었더라」를 펼쳐서 확인하게 하면 안 된다. */}
      {!open && currentSlots ? (
        <div className="flex items-center gap-2">
          <TemplateThumb slots={currentSlots} ratio={shape} className="w-12" />
          <TemplateFacts slots={currentSlots} />
        </div>
      ) : null}

      {open ? (
        /*
          **폭을 못 박는다.** 늘어나는 격자로 두면 넓은 화면에서 하나가
          300px 이 되어 카드 한 장의 틀 고르기가 화면을 다 먹었다. 카드가
          넷이면 그만큼 곱해진다. 배치를 알아보는 데 7rem 이면 넉넉하다.
        */
        <div className="flex flex-wrap gap-2">
          {/* 「고르지 않음」도 하나의 선택지다. 목록 밖에 두면 되돌릴 길이 안 보인다. */}
          <button
            type="button"
            disabled={busy || !card.layout}
            onClick={() => void send({ projectId, cardIndex: card.index, clear: true }, "틀을 뗐습니다. 통째로 그립니다.")}
            className={`grid w-28 gap-1 rounded-md border p-1.5 text-left ${!card.layout ? "border-primary bg-primary-soft" : "bg-background hover:border-primary/60"}`}
          >
            <div
              className="flex items-center justify-center rounded border border-dashed bg-muted/50 text-[10px] text-muted-foreground"
              style={{ aspectRatio: shape ? `${shape.width} / ${shape.height}` : "4 / 5" }}
            >
              통째로
            </div>
            <span className="truncate text-[11px] font-medium">고르지 않음</span>
            <span className="text-[11px] text-muted-foreground">AI 가 다 그림</span>
          </button>

          {choices.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={busy}
              onClick={() => void send(
                { projectId, cardIndex: card.index, templateId: entry.id, slots: entry.slots },
                `「${entry.name}」 로 바꿨습니다.`,
              )}
              className={`grid w-28 gap-1 rounded-md border p-1.5 text-left ${card.layout?.templateId === entry.id ? "border-primary bg-primary-soft" : "bg-background hover:border-primary/60"}`}
            >
              <TemplateThumb slots={entry.slots} ratio={shape} />
              {/* 이름에서 자리(「속지 · 」)를 뗀다. 같은 자리 것만 늘어서 있어 군더더기다. */}
              <span className="truncate text-[11px] font-medium">{entry.name.split(" · ").at(-1)}</span>
              <TemplateFacts slots={entry.slots} />
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {card.layout
          ? "칸마다 그림을 만들고 글은 서버가 직접 그립니다. 글자 위치가 장마다 달라지지 않습니다."
          : "고르지 않으면 카드를 통째로 AI 가 그립니다. 「내 카드뉴스 만들기」 화면에서 세트로 한 번에 붙일 수도 있습니다."}
        {emptyLogos > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">
            {" "}· 로고 자리가 {emptyLogos}개 비어 있습니다. 「내 카드뉴스 만들기」에서 그림을 골라야 채워집니다.
          </span>
        ) : null}
        {note ? ` · ${note}` : ""}
      </p>
    </div>
  );
}
