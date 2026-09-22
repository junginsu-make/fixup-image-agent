"use client";

import { Check } from "lucide-react";
import { Input, Label, Textarea } from "@fixup/ui";

export type SourceDraft =
  | { kind: "text"; text: string }
  | { kind: "youtube"; url: string }
  | { kind: "web"; url: string }
  | { kind: "question"; question: string };

export function sourceDraftValid(source: SourceDraft): boolean {
  if (source.kind === "text") return Boolean(source.text.trim());
  if (source.kind === "question") return Boolean(source.question.trim());
  try { return Boolean(new URL(source.url)); } catch { return false; }
}

/**
 * 01 내용을 어디서 가져오나. **개수를 화면에 박지 않는다** — 웹 주소를 다시 켜는 날
 * 여기 한 줄만 돌아오면 칸 수도 따라온다.
 */
export const SOURCE_CHOICES: { kind: SourceDraft["kind"]; label: string; hint: string }[] = [
  { kind: "text", label: "직접 쓰기", hint: "글이나 메모를 붙여 넣습니다" },
  { kind: "youtube", label: "유튜브 주소", hint: "영상 자막을 가져와 내용으로 씁니다" },
  { kind: "web", label: "웹 주소", hint: "기사·블로그 본문을 가져옵니다" },
  { kind: "question", label: "질문해서 찾기", hint: "웹에서 근거를 찾아 정리합니다" },
];

/** 지금 고를 수 있는 것. 웹 주소는 스위치가 켜져 있을 때만(`lib/sns/feature.ts`). */
export function sourceChoices(webSource: boolean) {
  return SOURCE_CHOICES.filter((choice) => webSource || choice.kind !== "web");
}

const GRID: Record<number, string> = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

export function SourceInput({
  title,
  onTitleChange,
  source,
  onSourceChange,
  toneNote,
  onToneNoteChange,
  webSource = false,
  droppedWebUrl = null,
}: {
  title: string;
  onTitleChange(value: string): void;
  source: SourceDraft;
  onSourceChange(value: SourceDraft): void;
  toneNote: string;
  onToneNoteChange(value: string): void;
  /** 웹 주소 갈래를 낼지. 서버의 스위치를 받는다. */
  webSource?: boolean;
  /** 지난 작업이 웹 주소로 만든 것이었는데 지금은 꺼져 있을 때, 그 주소. */
  droppedWebUrl?: string | null;
}) {
  const choices = sourceChoices(webSource);

  function changeKind(kind: SourceDraft["kind"]) {
    if (kind === source.kind) return;
    if (kind === "text") onSourceChange({ kind, text: "" });
    if (kind === "youtube") onSourceChange({ kind, url: "" });
    if (kind === "web") onSourceChange({ kind, url: "" });
    if (kind === "question") onSourceChange({ kind, question: "" });
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-2">
        <Label htmlFor="sns-title">프로젝트 제목</Label>
        <Input id="sns-title" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="예: AI 자동화, 한 업무부터 시작하기" />
      </div>

      <div className="grid gap-3">
        <p id="sns-source-kind" className="text-sm font-medium">내용을 어디서 가져올까요?</p>
        {/*
          **탭이 아니라 고르는 카드다.** 네 갈래가 폭을 채운 납작한 탭이라 무엇을 골랐는지
          안 보였다(2026-09-22 사용자 지적). 한 번 고르는 갈림길이라 카드가 맞다 — 이미지
          만들기의 결 고르기와 같은 모양이다.
        */}
        <div
          role="radiogroup"
          aria-labelledby="sns-source-kind"
          className={`grid grid-cols-1 gap-2 ${GRID[choices.length] ?? "sm:grid-cols-3"}`}
          onKeyDown={(event) => {
            // 라디오 묶음은 화살표로 옮겨 다닌다. 화면 낭독기가 「라디오」라고 읽으면 사람은 화살표를 누른다.
            const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const at = choices.findIndex((choice) => choice.kind === source.kind);
            const next = choices[(at + step + choices.length) % choices.length]!;
            changeKind(next.kind);
            (event.currentTarget.querySelector(`[data-kind="${next.kind}"]`) as HTMLButtonElement | null)?.focus();
          }}
        >
          {choices.map((choice) => {
            const on = source.kind === choice.kind;
            return (
              <button
                key={choice.kind}
                type="button"
                role="radio"
                aria-checked={on}
                data-kind={choice.kind}
                tabIndex={on || !choices.some((entry) => entry.kind === source.kind) ? 0 : -1}
                onClick={() => changeKind(choice.kind)}
                className={`relative rounded-lg border p-3 text-left transition-colors ${on ? "border-primary bg-primary-soft" : "border-border bg-background hover:border-primary/50"}`}
              >
                {on ? <Check className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden /> : null}
                <span className="block text-sm font-bold">{choice.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{choice.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {droppedWebUrl ? (
        <p role="status" className="rounded-md border border-primary/30 bg-primary-soft p-3 text-sm">
          이 작업은 웹 주소({droppedWebUrl})로 만든 것입니다. 지금은 웹 주소를 받지 않으니, 그 글의 내용을 아래에 붙여 넣어 주세요.
        </p>
      ) : null}

      {source.kind === "text" ? (
        <div className="grid gap-2">
          <Label htmlFor="sns-source-text">카드뉴스로 만들 내용</Label>
          <Textarea id="sns-source-text" rows={12} value={source.text} onChange={(event) => onSourceChange({ kind: "text", text: event.target.value })} placeholder="글이나 메모를 그대로 붙여 넣으세요." />
        </div>
      ) : null}
      {source.kind === "youtube" ? (
        <div className="grid gap-2">
          <Label htmlFor="sns-youtube-url">유튜브 영상 주소</Label>
          <Input id="sns-youtube-url" type="url" value={source.url} onChange={(event) => onSourceChange({ kind: "youtube", url: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." />
          <p className="text-sm text-muted-foreground">자막을 가져와 내용으로 씁니다. 실제 추출은 기획 시작 뒤 서버에서 진행합니다.</p>
        </div>
      ) : null}
      {source.kind === "web" && webSource ? (
        <div className="grid gap-2">
          <Label htmlFor="sns-web-url">기사·블로그 주소</Label>
          <Input id="sns-web-url" type="url" value={source.url} onChange={(event) => onSourceChange({ kind: "web", url: event.target.value })} placeholder="https://example.com/article" />
          <p className="text-sm text-muted-foreground">공개 페이지의 본문을 추출합니다.</p>
        </div>
      ) : null}
      {source.kind === "question" ? (
        <div className="grid gap-2">
          <Label htmlFor="sns-question">궁금한 것</Label>
          <Textarea id="sns-question" rows={7} value={source.question} onChange={(event) => onSourceChange({ kind: "question", question: event.target.value })} placeholder="궁금한 걸 물어보세요. 웹에서 근거를 찾아옵니다." />
          <p className="text-sm text-muted-foreground">공식 자료와 신뢰할 수 있는 출처를 우선해 조사합니다.</p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="sns-tone">말투나 분위기 · 선택</Label>
        <Input id="sns-tone" value={toneNote} onChange={(event) => onToneNoteChange(event.target.value)} placeholder="예: 친구에게 말하듯 가볍게" />
        <p className="text-sm text-muted-foreground">비우면 AI가 내용을 보고 어울리는 말투를 정합니다.</p>
      </div>
    </div>
  );
}
