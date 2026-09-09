"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clipboard, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { plainReviewLine, reviewHeadline } from "@fixup/sns-core";
import Image from "next/image";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from "@fixup/ui";
import type { SnsFlowCard, SnsFlowState } from "../../api/sns/flow-service";
import { snsCardFilename } from "../download-filename";
import { SaveToLibrary } from "../../_components/save-to-library";
import { copyText } from "../../../lib/browser-safe";
import { cardPlaceholder, CARD_NOTE_MAX } from "./result-rules";

function triggerDownload(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * 그림이 아직 없는 칸.
 *
 * **오른쪽 위 배지만으로는 안 보인다**(사용자 요청 2026-09-09). 카드가 큰
 * 화면에서는 그 배지가 눈에 안 들어와, 만드는 중인지 멈춘 것인지 알 수 없다.
 * 칸 한가운데서 말한다.
 *
 * 무엇을 적을지는 `result-rules.ts` 가 정한다 — 시험이 값으로 잠근다.
 */
function CardPlaceholder({ status }: { status: string }) {
  const { label, spinning } = cardPlaceholder(status);
  return (
    <div className="grid aspect-[4/5] max-h-[38vh] place-items-center rounded-lg border border-dashed bg-muted">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {spinning ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : null}
        {label}
      </span>
    </div>
  );
}

function ReviewStatus({ card }: { card: SnsFlowCard }) {
  if (card.kind !== "generated") return <Badge variant="outline">사용자 원본 · 검수 생략</Badge>;
  if (card.status === "pending") return <Badge variant="secondary">대기 중</Badge>;
  if (card.status === "generating") return <Badge variant="secondary"><Loader2 className="animate-spin" />생성 중</Badge>;
  if (card.status === "failed") return <Badge variant="destructive">생성 실패</Badge>;
  if (card.status === "review_required") return <Badge variant="destructive">사람의 검수 필요</Badge>;
  if (card.review?.decision === "pass") return <Badge variant="green">검수 통과</Badge>;
  return <Badge variant="secondary">검수 결과 없음</Badge>;
}

/**
 * 검수 결과 — 한 줄 먼저, 자세한 것은 접어 둔다.
 *
 * 걸린 것이 많을수록 카드가 길어져 그림보다 글이 더 커졌다. 그리고 검수
 * 스키마의 영문 값(extraCopy·uncertain·changed)이 그대로 나와 무슨 말인지
 * 알 수 없었다.
 */
function ReviewBox({ decision, summary, issues, tone = "default" }: {
  decision: "pass" | "fail";
  summary: string;
  issues: string[];
  tone?: "default" | "amber";
}) {
  const [open, setOpen] = React.useState(false);
  const skin = tone === "amber"
    ? "bg-amber-50 text-amber-900"
    : decision === "fail" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-900";

  return (
    <div className={`rounded-md p-3 text-sm ${skin}`}>
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left font-semibold"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {decision === "fail" ? <AlertTriangle className="mt-0.5 size-4 flex-none" /> : <CheckCircle2 className="mt-0.5 size-4 flex-none" />}
        <span className="flex-1">{reviewHeadline(decision, summary, issues)}</span>
        {issues.length ? (open ? <ChevronDown className="mt-0.5 size-4 flex-none" /> : <ChevronRight className="mt-0.5 size-4 flex-none" />) : null}
      </button>
      {open && issues.length ? (
        <ul className="mt-2 grid gap-1.5 pl-6">
          {issues.map((issue) => <li key={issue} className="list-disc leading-6">{plainReviewLine(issue)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 붙여넣을 칸 하나.
 *
 * 게시글 전체를 한 덩어리로 주면 인스타그램에 넣을 때 사용자가 직접 잘라야
 * 한다. 제목·내용·해시태그·첫 댓글은 들어가는 자리가 다르므로 따로 복사한다.
 */
function CopyField({ label, hint, value }: { label: string; hint?: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!value) return null;

  return (
    <div className="grid gap-2 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm">{label}</strong>
          {hint ? <span className="ml-2 text-meta text-subtle-foreground">{hint}</span> : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { void copyText(value).then((done) => setCopied(done)); }}
        >
          <Clipboard />{copied ? "복사됨" : "복사"}
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7">{value}</p>
    </div>
  );
}

function CaptionSection({ flow, writing, onWrite }: {
  flow: SnsFlowState;
  writing: boolean;
  onWrite(): Promise<void>;
}) {
  const caption = flow.caption;

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>게시글 문구</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            인스타그램에 그대로 붙여 넣도록 네 칸으로 나눠 씁니다. 원고를 고쳤다면 다시 쓰세요.
          </p>
        </div>
        <Button variant={caption ? "outline" : "default"} disabled={writing} onClick={() => void onWrite()}>
          {writing ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {writing ? "쓰는 중…" : caption ? "다시 쓰기" : "게시글 문구 만들기"}
        </Button>
      </div>

      {caption ? (
        <div className="grid gap-3">
          <CopyField label="제목" hint="더보기 전에 보이는 첫 두 줄입니다" value={caption.hook} />
          <CopyField label="내용" value={caption.body} />
          <CopyField label="해시태그" hint={`${caption.hashtags.length}개`} value={caption.hashtags.join(" ")} />
          <CopyField label="첫 댓글" hint="게시 직후 직접 남기세요" value={caption.firstComment} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          아직 게시글 문구가 없습니다. 카드 원고를 바탕으로 제목·내용·해시태그·첫 댓글을 써 드립니다.
        </p>
      )}

      {flow.captionIssues?.length ? (
        <ul className="grid gap-1 text-sm text-amber-700">
          {flow.captionIssues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

export function ResultBoard({ title, flow, regeneratingIndex, onRegenerate, writingCaption = false, onWriteCaption }: {
  title: string;
  flow: SnsFlowState;
  regeneratingIndex?: number;
  onRegenerate(index: number, note?: string): Promise<void>;
  writingCaption?: boolean;
  onWriteCaption(): Promise<void>;
}) {
  /** 지금 어느 카드의 지시 상자를 열어 뒀나. */
  const [noteFor, setNoteFor] = React.useState<number>();
  const [notes, setNotes] = React.useState<Record<number, string>>({});

  const [zipping, setZipping] = React.useState(false);
  const confirmed = flow.costs.reduce((sum, cost) => sum + (cost.costUsd ?? 0), 0);
  const unconfirmed = flow.costs.filter((cost) => cost.costUsd === null).length;
  const downloadable = flow.cards.filter((card) => Boolean(card.assetUrl));
  const counts = flow.cards.reduce((value, card) => ({ ...value, [card.status]: value[card.status] + 1 }), {
    pending: 0, generating: 0, review_required: 0, done: 0, failed: 0,
  });

  /**
   * 크게 볼 때 그림 옆에 같이 보여줄 것.
   *
   * 그림에 붙여 둔다 — 모달은 화면 전체에서 하나뿐이라 화면마다 넘겨받게
   * 하면 어딘가는 빠진다. 프롬프트는 그림을 왜 이렇게 그렸는지 알려 주는
   * 가장 중요한 값이라 함께 넣는다.
   */
  function cardMeta(card: SnsFlowCard): string {
    return JSON.stringify({
      카드: `${card.index}번 · ${card.role === "cover" ? "표지" : card.role === "ending" ? "엔딩" : "속지"}`,
      제목: card.copy.headline,
      본문: card.copy.body,
      "강조 문구": card.copy.accent,
      각주: card.copy.footnote,
      "그림 지시(프롬프트)": card.prompt,
      검수: card.review?.summary,
    });
  }

  async function downloadAll() {
    if (!downloadable.length) return;
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const card of downloadable) {
        const response = await fetch(card.assetUrl!);
        if (!response.ok) throw new Error(`${card.index}번 이미지를 받지 못했습니다.`);
        zip.file(snsCardFilename(title, card.index, card.assetPath), await response.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${title || "card-news"}.zip`);
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <strong className="text-lg">생성 비용</strong>
          <p className="mt-1 text-sm text-muted-foreground">확인된 비용 ${confirmed.toFixed(3)} · 확인 안 된 비용 {unconfirmed}건</p>
          <p className="mt-2 text-sm text-muted-foreground">대기 {counts.pending} · 생성 중 {counts.generating} · 완료 {counts.done} · 검수 필요 {counts.review_required} · 실패 {counts.failed}</p>
          {/*
            **장부 각주는 사용자에게 안 보인다**(사용자 요청 2026-09-09).
            합계에서 무엇을 뺐는지, 식별자가 어디에 남는지는 우리 회계 사정이지
            사용자가 할 일이 아니다. 뺀 건수는 위 숫자에 이미 드러난다.
          */}
        </div>
        <Button variant="secondary" disabled={!downloadable.length || zipping} onClick={() => void downloadAll()}>
          {zipping ? <Loader2 className="animate-spin" /> : <Download />}{zipping ? "ZIP 만드는 중…" : "전체 ZIP 내려받기"}
        </Button>
      </section>

      {/* 2열 고정이면 넓은 화면에서 한 칸이 1,100px 가 되고 4:5 라서 세로가
          1,375px 이 된다. 카드 한 장도 화면에 안 들어온다. 넓을수록 열을 늘리고
          그림에 최대 높이를 둔다. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {flow.cards.map((card) => (
          <Card key={card.index} className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>{String(card.index).padStart(2, "0")} 카드</CardTitle>
              <ReviewStatus card={card} />
            </CardHeader>
            <CardContent className="grid gap-4">
              {/*
                **한 번에 여러 장이 눈에 들어와야 한다**(사용자 요청 2026-09-09).
                눌러서 크게 보는 길이 이미 있으므로(`data-zoomable`) 여기서
                화면 높이의 60%를 쓸 이유가 없다. 카드가 크면 스크롤만 길어져
                「어느 장이 어떤지」를 못 본다.
              */}
              {card.assetUrl ? <Image src={card.thumbUrl ?? card.assetUrl} alt={`${title} · ${card.index}번 카드`} width={1088} height={1360} unoptimized data-zoomable data-viewer-src={card.assetUrl} data-viewer-meta={cardMeta(card)} className="mx-auto max-h-[38vh] w-full cursor-zoom-in rounded-lg bg-muted object-contain" /> : <CardPlaceholder status={card.status} />}
              <div>
                <strong>{card.copy.headline}</strong>
                {card.copy.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.copy.body}</p> : null}
              </div>
              {card.review ? <ReviewBox decision={card.review.decision} summary={card.review.summary} issues={card.review.issues} /> : null}
              {card.reviewIssues?.length ? <ReviewBox decision="fail" summary="" issues={card.reviewIssues} tone="amber" /> : null}
              {card.error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{card.error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                {card.assetUrl ? <Button variant="outline" onClick={() => triggerDownload(card.assetUrl!, snsCardFilename(title, card.index, card.assetPath))}><Download />낱장 내려받기</Button> : null}
                {card.assetUrl ? <SaveToLibrary fileUrl={card.assetUrl} title={`${title} ${card.index}번 카드`} /> : null}
                {card.kind === "generated" ? (
                  <Button
                    variant="secondary"
                    disabled={regeneratingIndex === card.index || card.status === "pending" || card.status === "generating"}
                    onClick={() => setNoteFor(noteFor === card.index ? undefined : card.index)}
                  >
                    <RefreshCw />다시 만들기
                  </Button>
                ) : null}
              </div>
              {/*
                **무엇이 마음에 안 드는지 적을 자리**(사용자 요청 2026-09-09).
                지금까지 「다시 만들기」는 같은 프롬프트로 한 번 더 돌리는
                것뿐이라, 같은 결과가 또 나와도 사람이 할 수 있는 게 없었다.
                이미지 만들기의 「이 장만 고치기」와 같은 모양이다.

                **비워 두고 눌러도 된다** — 그때는 지금까지처럼 그냥 다시 만든다.
              */}
              {noteFor === card.index ? (
                <div className="grid gap-2 rounded-md border border-border p-3">
                  <Label htmlFor={`sns-note-${card.index}`} className="text-xs">무엇을 고칠까요 (안 적어도 됩니다)</Label>
                  <Textarea
                    id={`sns-note-${card.index}`}
                    rows={2}
                    maxLength={CARD_NOTE_MAX}
                    value={notes[card.index] ?? ""}
                    placeholder="예) 인물을 더 밝게, 글자를 크게"
                    onChange={(event) => setNotes({ ...notes, [card.index]: event.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setNoteFor(undefined)}>닫기</Button>
                    <Button
                      size="sm"
                      disabled={regeneratingIndex === card.index}
                      onClick={() => {
                        setNoteFor(undefined);
                        void onRegenerate(card.index, notes[card.index]);
                      }}
                    >
                      {regeneratingIndex === card.index ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {regeneratingIndex === card.index ? "다시 만드는 중…" : "이대로 다시 만들기"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <CaptionSection flow={flow} writing={writingCaption} onWrite={onWriteCaption} />
    </div>
  );
}
