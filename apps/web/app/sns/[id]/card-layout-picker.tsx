"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Label } from "@fixup/ui";
import { DEFAULT_TEMPLATES, type CardTemplate } from "@fixup/layout-core";
import type { SnsFlowCard } from "../../api/sns/flow-service";

/**
 * 이 카드 하나만 다른 틀로.
 *
 * 세트는 자리별로 한 번에 붙이는 편의이고, 여기는 그 위에 얹는 예외다 —
 * 「3번 속지만 다른 모양으로」가 실제로 자주 필요하다. 여기서 고르면 그
 * 카드만 바뀌고 나머지는 세트가 준 것을 그대로 쓴다.
 *
 * 고르지 않으면 **지금까지 방식**(카드를 통째로 AI 가 그리기)이다. 기존
 * 동작을 건드리지 않는다.
 */

const SELECT_CLASS = "h-9 rounded-md border bg-background px-2 text-sm";

interface SavedTemplate extends CardTemplate {
  createdAt: string;
}

export function CardLayoutPicker({ projectId, card, onChanged }: {
  projectId: string;
  card: SnsFlowCard;
  onChanged(): void;
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
  const current = card.layout
    ? choices.find((entry) => entry.id === card.layout!.templateId)?.name ?? "직접 고친 틀"
    : undefined;

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

  return (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
      <Label htmlFor={`layout-${card.index}`}>이 카드의 틀</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`layout-${card.index}`}
          className={`${SELECT_CLASS} min-w-56`}
          value=""
          disabled={busy}
          onChange={(event) => {
            const found = choices.find((entry) => entry.id === event.target.value);
            if (!found) return;
            void send(
              { projectId, cardIndex: card.index, templateId: found.id, slots: found.slots },
              `「${found.name}」 로 바꿨습니다.`,
            );
          }}
        >
          <option value="" disabled>{current ?? "고르지 않음 (통째로 그리기)"}</option>
          {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
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
      <p className="text-xs text-muted-foreground">
        {card.layout
          ? "칸마다 그림을 만들고 글은 서버가 직접 그립니다. 글자 위치가 장마다 달라지지 않습니다."
          : "고르지 않으면 카드를 통째로 AI 가 그립니다. 「카드 틀」 화면에서 세트로 한 번에 붙일 수도 있습니다."}
        {note ? ` · ${note}` : ""}
      </p>
    </div>
  );
}
