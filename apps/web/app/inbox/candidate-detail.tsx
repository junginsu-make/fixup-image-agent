"use client";

import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@fixup/ui";
import { useRouter } from "next/navigation";
import { candidateActions } from "../api/candidates/schema";
import { putHandoff } from "../../lib/handoff";
import { bodyLabel, sourceLabel } from "./candidate-list";
import type { CandidateRecord } from "../api/candidates/candidate-service";

const PARAGRAPH_BREAK = new RegExp(String.fromCharCode(92) + "n{2,}");

/** 도구로 넘어갈 글. 본문이 없으면 요약을 쓴다. */
function handoffText(candidate: { body: string | null; summary: string | null }): string {
  return (candidate.body ?? candidate.summary ?? "").trim();
}

export function CandidateDetail({ candidate, onClose, onStatus }: {
  candidate: CandidateRecord | null;
  onClose: () => void;
  onStatus: (candidate: CandidateRecord, status: CandidateRecord["status"]) => void;
}) {
  const router = useRouter();

  /** 고른 글을 그 도구의 시작 화면으로 넘긴다. 복사해 붙일 필요가 없어야 한다. */
  function send(tool: "sns" | "poster" | "create", item: CandidateRecord) {
    putHandoff({ title: item.title, text: handoffText(item), url: item.url, candidateId: item.id });
    router.push(tool === "sns" ? "/sns/new" : tool === "poster" ? "/poster/new" : "/create");
  }

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
              <Badge variant="secondary">{sourceLabel(candidate)}</Badge>
              {candidate.publishedAt ? <Badge variant="secondary">발행 {new Date(candidate.publishedAt).toLocaleString("ko-KR")}</Badge> : null}
              {candidate.author ? <Badge variant="secondary">작성자·채널 {candidate.author}</Badge> : null}
            </div>
            {candidate.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidate.thumbnailUrl} alt="" className="max-h-64 w-full rounded-lg border object-cover" />
            ) : null}
            {candidate.summary ? <section><h3 className="text-sm font-bold">요약</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{candidate.summary}</p></section> : null}
            {candidate.keyPoints?.length ? (
              <section>
                <h3 className="text-sm font-bold">주요 내용</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7">
                  {candidate.keyPoints.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </section>
            ) : null}
            <section><h3 className="text-sm font-bold">{bodyLabel(candidate)}</h3><p className="mt-1 text-meta text-subtle-foreground">{(candidate.body ?? "").length.toLocaleString("ko-KR")}자</p><div className="mt-2 grid gap-3 text-sm leading-7">{(candidate.body ? candidate.body.split(PARAGRAPH_BREAK) : []).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}{candidate.body ? null : <p className="text-muted-foreground">수집된 본문이 없습니다.</p>}</div></section>
            {candidate.url ? <a href={candidate.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary underline underline-offset-4">원문 열기</a> : null}

            {/* 기존 시스템의 「이 내용으로 카드뉴스 만들기」에 해당한다.
                무엇이 넘어가는지 먼저 보여준다 — 넘겨 놓고 놀라면 안 된다. */}
            <section className="rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-sm font-bold">이 내용으로 만들기</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                제목 <strong className="text-foreground">{candidate.title}</strong> 과(와)
                {" "}본문 {handoffText(candidate).length.toLocaleString("ko-KR")}자가 넘어갑니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={!handoffText(candidate)} onClick={() => send("sns", candidate)}>카드뉴스로</Button>
                <Button size="sm" variant="secondary" disabled={!handoffText(candidate)} onClick={() => send("poster", candidate)}>포스터로</Button>
                <Button size="sm" variant="secondary" disabled={!handoffText(candidate)} onClick={() => send("create", candidate)}>상세페이지로</Button>
              </div>
            </section>
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
