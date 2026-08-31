"use client";

import * as React from "react";
import { Archive, RefreshCw, RotateCcw, Star } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { candidateActions, type CandidateStatus } from "../api/candidates/schema";
import type { CandidateRecord } from "../api/candidates/candidate-service";
import { CandidateDetail, statusLabel } from "./candidate-detail";

type Filter = "all" | CandidateStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "new", label: "새 소재" },
  { value: "picked", label: "제작 후보" },
  { value: "requested", label: "제작 요청함" },
  { value: "archived", label: "보관됨" },
];

export function InboxClient() {
  const [candidates, setCandidates] = React.useState<CandidateRecord[]>([]);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [selected, setSelected] = React.useState<CandidateRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/candidates", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; candidates?: CandidateRecord[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "수집함을 불러오지 못했습니다.");
      setCandidates(payload.candidates ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수집함을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function updateStatus(candidate: CandidateRecord, status: CandidateStatus) {
    try {
      const response = await fetch(`/api/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { ok?: boolean; candidate?: CandidateRecord; message?: string };
      if (!response.ok || !payload.candidate) throw new Error(payload.message ?? "후보 상태를 바꾸지 못했습니다.");
      setCandidates((current) => current.map((item) => item.id === candidate.id ? payload.candidate! : item));
      setSelected((current) => current?.id === candidate.id ? payload.candidate! : current);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "후보 상태를 바꾸지 못했습니다.");
    }
  }

  const visible = filter === "all" ? candidates : candidates.filter((candidate) => candidate.status === filter);

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-meta text-subtle-foreground">COLLECTED CONTENT</p>
        <h1 className="mt-1 text-h1">수집함</h1>
        <p className="mt-2 max-w-2xl text-body text-muted-foreground">어느 소스에서 언제 수집됐는지 확인하고, 카드뉴스로 만들 소재를 고릅니다.</p>
      </header>

      <Card>
        <CardHeader className="gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><CardTitle>수집 콘텐츠</CardTitle><CardDescription>보관한 소재도 필터에서 다시 꺼낼 수 있습니다.</CardDescription></div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />새로고침</Button>
          </div>
          <div className="flex flex-wrap gap-2">{FILTERS.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "secondary"} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</div>
        </CardHeader>
        <CardContent>
          {message ? <p role="alert" className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p> : null}
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">수집 콘텐츠를 불러오는 중입니다.</p> : visible.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">이 상태의 수집 콘텐츠가 없습니다.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 font-medium">제목</th><th className="px-3 py-3 font-medium">출처</th><th className="px-3 py-3 font-medium">발행일</th><th className="px-3 py-3 font-medium">수집일</th><th className="px-3 py-3 font-medium">상태</th><th className="px-3 py-3 font-medium">작업</th></tr></thead>
                <tbody>{visible.map((candidate) => (
                  <tr key={candidate.id} className="cursor-pointer border-b align-top hover:bg-muted/40" onClick={() => setSelected(candidate)}>
                    <td className="max-w-md px-3 py-5"><strong className="line-clamp-2">{candidate.title}</strong>{candidate.summary ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{candidate.summary}</p> : null}</td>
                    <td className="px-3 py-5"><strong>{candidate.source?.name ?? "삭제된 소스"}</strong><p className="mt-1 text-xs text-subtle-foreground">{candidate.source?.kind ?? "source removed"}</p></td>
                    <td className="px-3 py-5 text-muted-foreground">{candidate.publishedAt ? new Date(candidate.publishedAt).toLocaleDateString("ko-KR") : "날짜 없음"}</td>
                    <td className="px-3 py-5 text-muted-foreground">{new Date(candidate.collectedAt).toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-5"><Badge variant={candidate.status === "picked" ? "green" : "secondary"}>{statusLabel(candidate.status)}</Badge></td>
                    <td className="px-3 py-5"><div className="flex flex-wrap gap-2">{candidateActions(candidate.status).map((action) => <Button key={action.status} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); void updateStatus(candidate, action.status); }}>{action.status === "picked" ? <Star className="size-3.5" /> : action.status === "archived" ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}{action.label}</Button>)}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CandidateDetail candidate={selected} onClose={() => setSelected(null)} onStatus={(candidate, status) => void updateStatus(candidate, status)} />
    </div>
  );
}
