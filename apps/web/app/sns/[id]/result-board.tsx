"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Clipboard, Download, Loader2, RefreshCw } from "lucide-react";
import Image from "next/image";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { SnsFlowCard, SnsFlowState } from "../../api/sns/flow-service";
import { snsCardFilename } from "../download-filename";

function triggerDownload(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
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

export function ResultBoard({ title, flow, regeneratingIndex, onRegenerate }: {
  title: string;
  flow: SnsFlowState;
  regeneratingIndex?: number;
  onRegenerate(index: number): Promise<void>;
}) {
  const [zipping, setZipping] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const confirmed = flow.costs.reduce((sum, cost) => sum + (cost.costUsd ?? 0), 0);
  const unconfirmed = flow.costs.filter((cost) => cost.costUsd === null).length;
  const downloadable = flow.cards.filter((card) => Boolean(card.assetUrl));
  const caption = flow.cards.flatMap((card) => [card.copy.headline, card.copy.body].filter(Boolean)).join("\n\n");
  const counts = flow.cards.reduce((value, card) => ({ ...value, [card.status]: value[card.status] + 1 }), {
    pending: 0, generating: 0, review_required: 0, done: 0, failed: 0,
  });

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

  async function copyCaption() {
    await navigator.clipboard.writeText(`${caption}\n\n#카드뉴스`);
    setCopied(true);
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <strong className="text-lg">생성 비용</strong>
          <p className="mt-1 text-sm text-muted-foreground">확인된 비용 ${confirmed.toFixed(3)} · 확인 안 된 비용 {unconfirmed}건</p>
          <p className="mt-2 text-sm text-muted-foreground">대기 {counts.pending} · 생성 중 {counts.generating} · 완료 {counts.done} · 검수 필요 {counts.review_required} · 실패 {counts.failed}</p>
          {unconfirmed ? <p className="mt-2 text-sm text-amber-700">진행 중이거나 완료 여부를 확인하지 못한 요청은 합계에서 따로 뺐습니다. request_id는 장부에 남습니다.</p> : null}
        </div>
        <Button variant="secondary" disabled={!downloadable.length || zipping} onClick={() => void downloadAll()}>
          {zipping ? <Loader2 className="animate-spin" /> : <Download />}{zipping ? "ZIP 만드는 중…" : "전체 ZIP 내려받기"}
        </Button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {flow.cards.map((card) => (
          <Card key={card.index} className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>{String(card.index).padStart(2, "0")} 카드</CardTitle>
              <ReviewStatus card={card} />
            </CardHeader>
            <CardContent className="grid gap-4">
              {card.assetUrl ? <Image src={card.assetUrl} alt={`${card.index}번 카드 결과`} width={1088} height={1360} unoptimized className="aspect-[4/5] w-full rounded-lg bg-muted object-contain" /> : <div className="grid aspect-[4/5] place-items-center rounded-lg border border-dashed bg-muted text-sm text-muted-foreground">이미지가 없습니다.</div>}
              <div>
                <strong>{card.copy.headline}</strong>
                {card.copy.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.copy.body}</p> : null}
              </div>
              {card.review ? <div className={`rounded-md p-4 text-sm ${card.review.decision === "fail" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-900"}`}>
                <p className="flex items-center gap-2 font-semibold">{card.review.decision === "fail" ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{card.review.summary}</p>
                {card.review.issues.map((issue) => <p key={issue} className="mt-1">· {issue}</p>)}
              </div> : null}
              {card.reviewIssues?.map((issue) => <p key={issue} className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{issue}</p>)}
              {card.error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{card.error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                {card.assetUrl ? <Button variant="outline" onClick={() => triggerDownload(card.assetUrl!, snsCardFilename(title, card.index, card.assetPath))}><Download />낱장 내려받기</Button> : null}
                {card.kind === "generated" ? <Button variant="secondary" disabled={regeneratingIndex === card.index || card.status === "pending" || card.status === "generating"} onClick={() => void onRegenerate(card.index)}>
                  {regeneratingIndex === card.index ? <Loader2 className="animate-spin" /> : <RefreshCw />}{regeneratingIndex === card.index ? "다시 만드는 중…" : "다시 만들기"}
                </Button> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><strong>게시글 문구</strong><Button variant="outline" onClick={() => void copyCaption()}><Clipboard />{copied ? "복사됨" : "문구·해시태그 복사"}</Button></div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{caption}{"\n\n"}#카드뉴스</p>
      </section>
    </div>
  );
}
