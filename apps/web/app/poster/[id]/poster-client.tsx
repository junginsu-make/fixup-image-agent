"use client";

import * as React from "react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, Textarea, cn,
} from "@fixup/ui";
import { TYPE_INTERACTIONS, type PosterSlots } from "@fixup/poster-core";

interface PosterImage {
  id: string;
  variantIndex: number;
  selected: boolean;
  url?: string;
  review?: { decision: string; summary: string; issues: string[] } | null;
}

interface PosterProject {
  id: string;
  title: string;
  status: string;
  ratio: string;
  modelId: string;
  data: { instruction: string; variants: number; slots: PosterSlots; grammarIssues?: string[] };
}

type TextSlot = "kind" | "headline" | "subline" | "scene" | "subject" | "action"
  | "dominantColor" | "accentColor" | "forbidden";

const SLOT_LABELS: Array<[TextSlot, string, "line" | "area"]> = [
  ["kind", "유형", "line"],
  ["headline", "헤드라인", "line"],
  ["subline", "받침 문구", "line"],
  ["scene", "장면", "area"],
  ["subject", "피사체", "area"],
  ["action", "동작", "area"],
  ["dominantColor", "지배색", "line"],
  ["accentColor", "강조색", "line"],
  ["forbidden", "넣지 말 것", "line"],
];

export function PosterClient({ project, images }: { project: PosterProject; images: PosterImage[] }) {
  const [slots, setSlots] = React.useState(project.data.slots);
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string[]>(project.data.grammarIssues ?? []);
  const [list, setList] = React.useState(images);

  function setField(field: TextSlot, value: string) {
    setSlots((current: PosterSlots) => ({ ...current, [field]: value }));
  }

  async function saveSlots() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/poster/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slots),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "슬롯을 저장하지 못했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "슬롯을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  /** 기획을 채운다. 실패해도 빈 슬롯이 남고 사람이 직접 쓸 수 있다. */
  async function runPlan() {
    setBusy("기획하는 중…");
    setError(null);
    try {
      const body = await (await fetch(`/api/poster/projects/${project.id}/plan`, { method: "POST" })).json();
      if (!body.ok) throw new Error(body.message ?? "기획하지 못했습니다.");
      setSlots(body.project.data.slots);
      setNotes(body.issues ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "기획하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * 만든다.
   *
   * 제출하고 나서 상태를 물어본다. 모델 호출에 시간 제한을 두지 않는다 —
   * GPT Image 2 는 2분을 넘긴다.
   */
  async function generate() {
    setBusy("보내는 중…");
    setError(null);
    try {
      const start = await (await fetch(`/api/poster/projects/${project.id}/generate`, { method: "POST" })).json();
      if (!start.ok) throw new Error(start.message ?? "생성을 시작하지 못했습니다.");
      const submission = start.submission;
      setBusy("그리는 중… 2~3분 걸립니다");

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const poll = await (await fetch(`/api/poster/projects/${project.id}/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestRowId: submission.requestRowId,
            falRequestId: submission.falRequestId,
            endpoint: submission.endpoint,
            unitCostUsd: (submission.estimatedUsd ?? 0) / project.data.variants,
          }),
        })).json();
        if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
        if (poll.done) {
          setList(poll.images);
          break;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function select(imageId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/poster/projects/${project.id}/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.message ?? "변형을 고르지 못했습니다.");
      setList(body.images);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "변형을 고르지 못했습니다.");
    }
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notes.length ? (
        <div role="status" className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <strong className="block">알아 두실 것</strong>
          <ul className="mt-1 list-disc pl-5">
            {notes.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      ) : null}

      {busy ? (
        <div role="status" className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          {busy}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>기획 확인</CardTitle>
          <CardDescription>
            AI 가 채운 초안입니다. 틀린 칸만 고치세요. 빈 칸은 그대로 둬도 됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {SLOT_LABELS.map(([field, label, kind]) => (
              <div key={field} className={cn("grid gap-1.5", kind === "area" && "sm:col-span-2")}>
                <Label htmlFor={`slot-${field}`}>{label}</Label>
                {kind === "area" ? (
                  <Textarea
                    id={`slot-${field}`}
                    rows={2}
                    value={String(slots[field] ?? "")}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`slot-${field}`}
                    value={String(slots[field] ?? "")}
                    onChange={(event) => setField(field, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-meta text-subtle-foreground">글자와 피사체의 관계</legend>
            <div className="flex flex-wrap gap-2">
              {TYPE_INTERACTIONS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={slots.typeInteraction === value ? "default" : "secondary"}
                  onClick={() => setSlots((current: PosterSlots) => ({
                    ...current,
                    typeInteraction: current.typeInteraction === value ? null : value,
                  }))}
                >
                  {value}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="slot-side">곁텍스트</Label>
            <Textarea
              id="slot-side"
              rows={2}
              value={slots.sideTexts.join("\n")}
              onChange={(event) => setSlots((current: PosterSlots) => ({
                ...current,
                sideTexts: event.target.value.split("\n"),
              }))}
              placeholder={"28MM F2.0\nISO 400"}
            />
            <p className="text-xs text-subtle-foreground">한 줄에 하나씩 적습니다.</p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => void runPlan()} disabled={Boolean(busy)}>
              AI 로 초안 채우기
            </Button>
            <Button variant="secondary" onClick={() => void saveSlots()} disabled={saving || Boolean(busy)}>
              {saving ? "저장하는 중…" : "기획 저장"}
            </Button>
            <Button onClick={() => void generate()} disabled={Boolean(busy)}>
              {project.data.variants}장 만들기
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>결과</CardTitle>
          <CardDescription>
            변형 중 하나를 고르면 그것을 기준으로 고쳐 나갑니다. 고른 것만 검수합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 만든 변형이 없습니다.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((image) => (
                <figure key={image.id} className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void select(image.id)}
                    aria-pressed={image.selected}
                    className={cn(
                      "overflow-hidden rounded-lg border-2 transition-colors",
                      image.selected ? "border-primary" : "border-transparent hover:border-border",
                    )}
                  >
                    {image.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.url} alt={`변형 ${image.variantIndex + 1}`} className="w-full" />
                    ) : (
                      <div className="grid aspect-[2/3] place-items-center bg-muted text-xs text-muted-foreground">
                        미리보기 없음
                      </div>
                    )}
                  </button>
                  <figcaption className="text-xs">
                    <span className={cn("font-bold", image.selected && "text-primary")}>
                      변형 {image.variantIndex + 1}{image.selected ? " · 선택됨" : ""}
                    </span>
                    {image.review ? (
                      <span
                        role={image.review.decision === "pass" ? undefined : "alert"}
                        className={cn(
                          "mt-1 block",
                          image.review.decision === "pass" ? "text-muted-foreground" : "text-destructive",
                        )}
                      >
                        {image.review.summary}
                      </span>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
