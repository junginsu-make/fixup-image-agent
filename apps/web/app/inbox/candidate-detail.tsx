"use client";

import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@fixup/ui";
import { candidateActions } from "../api/candidates/schema";
import type { CandidateRecord } from "../api/candidates/candidate-service";

export function CandidateDetail({ candidate, onClose, onStatus }: {
  candidate: CandidateRecord | null;
  onClose: () => void;
  onStatus: (candidate: CandidateRecord, status: CandidateRecord["status"]) => void;
}) {
  return (
    <Dialog open={Boolean(candidate)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        {candidate ? <>
          <DialogHeader>
            <DialogTitle>{candidate.title}</DialogTitle>
            <DialogDescription className="leading-6">
              {candidate.source?.name ?? "삭제된 소스"} · 수집 {new Date(candidate.collectedAt).toLocaleString("ko-KR")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-6 overflow-y-auto p-1">
            <div className="flex flex-wrap gap-2">
              <Badge>{statusLabel(candidate.status)}</Badge>
              {candidate.source ? <Badge variant="secondary">{candidate.source.kind}</Badge> : null}
              {candidate.publishedAt ? <Badge variant="secondary">발행 {new Date(candidate.publishedAt).toLocaleString("ko-KR")}</Badge> : null}
            </div>
            {candidate.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidate.thumbnailUrl} alt="" className="max-h-64 w-full rounded-lg border object-cover" />
            ) : null}
            {candidate.summary ? <section><h3 className="text-sm font-bold">요약</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{candidate.summary}</p></section> : null}
            <section><h3 className="text-sm font-bold">수집 원문</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{candidate.body || "수집된 본문이 없습니다."}</p></section>
            {candidate.url ? <a href={candidate.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline underline-offset-4">원문 열기</a> : null}
          </div>
          <DialogFooter className="flex-wrap">
            {candidateActions(candidate.status).map((action) => (
              <Button key={action.status} variant={action.status === "archived" ? "secondary" : "default"} onClick={() => onStatus(candidate, action.status)}>{action.label}</Button>
            ))}
            <Button variant="ghost" onClick={onClose}>닫기</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
  );
}

export function statusLabel(status: CandidateRecord["status"]): string {
  return { new: "새 소재", picked: "제작 후보", archived: "보관됨" }[status];
}
