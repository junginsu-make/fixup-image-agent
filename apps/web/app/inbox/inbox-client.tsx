"use client";

import * as React from "react";
import { Archive, RefreshCw, RotateCcw, Star } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@fixup/ui";
import { candidateActions, type CandidateStatus } from "../api/candidates/schema";
import type { CandidateRecord } from "../api/candidates/candidate-service";
import { CandidateDetail, statusLabel } from "./candidate-detail";
import {
  DEFAULT_CANDIDATE_SORT,
  EMPTY_CANDIDATE_FILTERS,
  SOURCE_TABS,
  bodyLabel,
  filterAndSortCandidates,
  preview,
  sourceLabel,
  type CandidateColumnFilters,
  type CandidateSort,
  type CandidateSortKey,
} from "./candidate-list";

type Filter = "all" | CandidateStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "전체 상태" },
  { value: "new", label: "새 소재" },
  { value: "picked", label: "제작 후보" },
  { value: "archived", label: "보관됨" },
];

const CELL = "px-3 py-4 align-top";

function SortHeader({ label, sortKey, sort, onSort }: {
  label: string;
  sortKey: CandidateSortKey;
  sort: CandidateSort;
  onSort: (key: CandidateSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const direction = active ? (sort.direction === "asc" ? "오름차순" : "내림차순") : "정렬 안 함";
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`${label} 정렬: ${direction}`}
      className={`flex items-center gap-1 whitespace-nowrap font-medium ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export function InboxClient() {
  const [candidates, setCandidates] = React.useState<CandidateRecord[]>([]);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<CandidateColumnFilters>(EMPTY_CANDIDATE_FILTERS);
  const [sort, setSort] = React.useState<CandidateSort>(DEFAULT_CANDIDATE_SORT);
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

  function updateFilter<Key extends keyof CandidateColumnFilters>(key: Key, value: CandidateColumnFilters[Key]) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  }

  function updateSort(key: CandidateSortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "collectedAt" || key === "publishedAt" ? "desc" : "asc" });
  }

  // 상태 버튼과 검색은 목록 전체에, 열 필터·정렬은 그 결과에 건다.
  const searched = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko");
    return candidates
      .filter((candidate) => filter === "all" || candidate.status === filter)
      .filter((candidate) => !needle
        || `${candidate.title} ${candidate.summary ?? ""}`.toLocaleLowerCase("ko").includes(needle));
  }, [candidates, filter, query]);

  const visible = React.useMemo(
    () => filterAndSortCandidates(searched, columnFilters, sort),
    [searched, columnFilters, sort],
  );

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

          <div className="flex flex-wrap gap-2" aria-label="콘텐츠 유형">
            {SOURCE_TABS.map((tab) => (
              <Button
                key={tab.value}
                size="sm"
                variant={(columnFilters.sourceKind ?? "all") === tab.value ? "default" : "secondary"}
                aria-pressed={(columnFilters.sourceKind ?? "all") === tab.value}
                onClick={() => updateFilter("sourceKind", tab.value)}
              >{tab.label}</Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "secondary"} onClick={() => setFilter(item.value)}>{item.label}</Button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(event) => event.preventDefault()}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목·요약 검색"
                aria-label="제목·요약 검색"
                className="h-9 w-56"
              />
            </form>
          </div>
        </CardHeader>

        <CardContent>
          {message ? <p role="alert" className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p> : null}
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">수집 콘텐츠를 불러오는 중입니다.</p> : candidates.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">이 상태의 수집 콘텐츠가 없습니다.</p> : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-meta text-subtle-foreground">
                <span>표시 {visible.length}개 / 불러온 항목 {candidates.length}개</span>
                <button
                  type="button"
                  className="font-bold text-primary underline underline-offset-4"
                  onClick={() => { setColumnFilters(EMPTY_CANDIDATE_FILTERS); setSort(DEFAULT_CANDIDATE_SORT); setQuery(""); }}
                >열 필터·정렬 초기화</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1600px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className={CELL}><SortHeader label="제목" sortKey="title" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="발행일" sortKey="publishedAt" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="수집일" sortKey="collectedAt" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="작성자·채널" sortKey="author" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="소스 유형" sortKey="sourceKind" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="요약" sortKey="summary" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="상태" sortKey="status" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="원문" sortKey="url" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="수집 본문" sortKey="body" sort={sort} onSort={updateSort} /></th>
                      <th className={CELL}><SortHeader label="첨부 이미지" sortKey="thumbnail" sort={sort} onSort={updateSort} /></th>
                      <th className={`${CELL} font-medium`}>작업</th>
                    </tr>
                    <tr className="border-b">
                      <th className="px-3 pb-3"><Input className="h-8" aria-label="제목 필터" value={columnFilters.title ?? ""} onChange={(event) => updateFilter("title", event.target.value)} placeholder="제목 포함" /></th>
                      <th className="px-3 pb-3"><Input className="h-8" type="date" aria-label="발행일 필터" value={columnFilters.publishedDate ?? ""} onChange={(event) => updateFilter("publishedDate", event.target.value)} /></th>
                      <th className="px-3 pb-3"><Input className="h-8" type="date" aria-label="수집일 필터" value={columnFilters.collectedDate ?? ""} onChange={(event) => updateFilter("collectedDate", event.target.value)} /></th>
                      <th className="px-3 pb-3"><Input className="h-8" aria-label="작성자·채널 필터" value={columnFilters.author ?? ""} onChange={(event) => updateFilter("author", event.target.value)} placeholder="작성자 포함" /></th>
                      <th className="px-3 pb-3">
                        <select aria-label="소스 유형 필터" className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={columnFilters.sourceKind ?? "all"} onChange={(event) => updateFilter("sourceKind", event.target.value)}>
                          {SOURCE_TABS.map((tab) => <option key={tab.value} value={tab.value}>{tab.value === "all" ? "전체" : tab.label}</option>)}
                        </select>
                      </th>
                      <th className="px-3 pb-3"><Input className="h-8" aria-label="요약 필터" value={columnFilters.summary ?? ""} onChange={(event) => updateFilter("summary", event.target.value)} placeholder="요약 포함" /></th>
                      <th className="px-3 pb-3">
                        <select aria-label="상태 필터" className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={columnFilters.status ?? "all"} onChange={(event) => updateFilter("status", event.target.value as CandidateColumnFilters["status"])}>
                          <option value="all">전체</option>
                          {FILTERS.filter((item) => item.value !== "all").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </th>
                      <th className="px-3 pb-3"><Input className="h-8" aria-label="원문 URL 필터" value={columnFilters.url ?? ""} onChange={(event) => updateFilter("url", event.target.value)} placeholder="주소 포함" /></th>
                      <th className="px-3 pb-3"><Input className="h-8" aria-label="수집 본문 필터" value={columnFilters.body ?? ""} onChange={(event) => updateFilter("body", event.target.value)} placeholder="본문 포함" /></th>
                      <th className="px-3 pb-3">
                        <select aria-label="첨부 이미지 필터" className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={columnFilters.thumbnail ?? "all"} onChange={(event) => updateFilter("thumbnail", event.target.value as CandidateColumnFilters["thumbnail"])}>
                          <option value="all">전체</option><option value="yes">있음</option><option value="no">없음</option>
                        </select>
                      </th>
                      <th className="px-3 pb-3">
                        <button type="button" className="whitespace-nowrap text-meta font-bold text-primary underline underline-offset-4" onClick={() => setColumnFilters(EMPTY_CANDIDATE_FILTERS)}>필터 해제</button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr><td colSpan={11} className="py-10 text-center text-sm text-muted-foreground">열 필터에 맞는 항목이 없습니다.</td></tr>
                    ) : visible.map((candidate) => (
                      <tr
                        key={candidate.id}
                        tabIndex={0}
                        aria-label={`${candidate.title} 상세 보기`}
                        className="cursor-pointer border-b hover:bg-muted/40"
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("a, button, input, select")) return;
                          setSelected(candidate);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || (event.target as HTMLElement).closest("a, button, input, select")) return;
                          setSelected(candidate);
                        }}
                      >
                        <td className={`${CELL} max-w-xs`}>
                          <button type="button" className="text-left font-bold hover:underline" onClick={() => setSelected(candidate)}>{candidate.title}</button>
                          <p className="mt-1 text-meta text-subtle-foreground">{candidate.source?.name ?? "삭제된 소스"}</p>
                        </td>
                        <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>{candidate.publishedAt ? new Date(candidate.publishedAt).toLocaleString("ko-KR") : "확인 불가"}</td>
                        <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>{new Date(candidate.collectedAt).toLocaleString("ko-KR")}</td>
                        <td className={CELL}>{candidate.author || "—"}</td>
                        <td className={CELL}><Badge variant="secondary">{sourceLabel(candidate)}</Badge></td>
                        <td className={`${CELL} max-w-sm text-xs leading-5 text-muted-foreground`}>{preview(candidate.summary) || "요약을 준비하지 못했습니다."}</td>
                        <td className={CELL}><Badge variant={candidate.status === "picked" ? "green" : "secondary"}>{statusLabel(candidate.status)}</Badge></td>
                        <td className={CELL}>{candidate.url ? <a className="font-bold text-primary underline underline-offset-4" href={candidate.url} target="_blank" rel="noreferrer">원문 열기</a> : <span className="text-subtle-foreground">—</span>}</td>
                        <td className={`${CELL} max-w-sm text-xs leading-5 text-muted-foreground`}>
                          <span className="block text-meta font-bold text-subtle-foreground">{bodyLabel(candidate)}</span>
                          {preview(candidate.body, 180) || "—"}
                        </td>
                        <td className={CELL}>
                          {candidate.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={candidate.thumbnailUrl} alt={`${candidate.title} 첨부 이미지`} className="h-14 w-24 rounded-md border object-cover" />
                          ) : <span className="text-subtle-foreground">—</span>}
                        </td>
                        <td className={CELL}>
                          <div className="flex flex-wrap gap-2">
                            {candidateActions(candidate.status).map((action) => (
                              <Button key={action.status} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); void updateStatus(candidate, action.status); }}>
                                {action.status === "picked" ? <Star className="size-3.5" /> : action.status === "archived" ? <Archive className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CandidateDetail candidate={selected} onClose={() => setSelected(null)} onStatus={(candidate, status) => void updateStatus(candidate, status)} />
    </div>
  );
}
