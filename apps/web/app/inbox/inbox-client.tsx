"use client";

import * as React from "react";
import { Archive, RefreshCw, RotateCcw, Search, SlidersHorizontal, Star } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@fixup/ui";
import { candidateActions, type CandidateStatus } from "../api/candidates/schema";
import type { CandidateRecord } from "../api/candidates/candidate-service";
import { CandidateDetail, statusLabel } from "./candidate-detail";
import {
  DEFAULT_CANDIDATE_SORT,
  EMPTY_CANDIDATE_FILTERS,
  SOURCE_TABS,
  bodyLabel,
  countColumnFilters,
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
const CONTROL = "h-9 rounded-md border border-border bg-background px-3 text-sm";

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
  /** 열 필터 줄은 기본으로 접어 둔다. 늘 펴 두면 표보다 입력칸이 먼저 보인다. */
  const [columnsOpen, setColumnsOpen] = React.useState(false);

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

  const activeColumnFilters = countColumnFilters(columnFilters);
  // 아무것도 안 좁혔으면 초기화 버튼을 감춘다. 누를 일 없는 버튼은 소음이다.
  const narrowed = Boolean(
    activeColumnFilters
      || query.trim()
      || filter !== "all"
      || (columnFilters.sourceKind ?? "all") !== "all"
      || sort.key !== DEFAULT_CANDIDATE_SORT.key
      || sort.direction !== DEFAULT_CANDIDATE_SORT.direction,
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

          {/* 찾기 · 좁히기 · 세부. 왼쪽에서 오른쪽으로 갈수록 덜 쓰는 것을 둔다. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[15rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목·요약 검색"
                aria-label="제목·요약 검색"
                className="h-9 pl-9"
              />
            </div>

            <select
              aria-label="콘텐츠 유형"
              className={CONTROL}
              value={columnFilters.sourceKind ?? "all"}
              onChange={(event) => updateFilter("sourceKind", event.target.value)}
            >
              {SOURCE_TABS.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
            </select>

            <select
              aria-label="상태"
              className={CONTROL}
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
            >
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>

            <Button
              variant={columnsOpen ? "default" : "secondary"}
              aria-pressed={columnsOpen}
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" />
              열 필터
              {activeColumnFilters ? <Badge variant="secondary" className="ml-1">{activeColumnFilters}</Badge> : null}
            </Button>

            {narrowed ? (
              <Button
                variant="ghost"
                onClick={() => { setColumnFilters(EMPTY_CANDIDATE_FILTERS); setSort(DEFAULT_CANDIDATE_SORT); setQuery(""); setFilter("all"); }}
              >초기화</Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          {message ? <p role="alert" className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p> : null}
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">수집 콘텐츠를 불러오는 중입니다.</p> : candidates.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">이 상태의 수집 콘텐츠가 없습니다.</p> : (
            <>
              <p className="mb-3 text-meta text-subtle-foreground">
                {narrowed
                  ? <>전체 {candidates.length}개 중 <strong className="text-foreground">{visible.length}개</strong>를 보고 있습니다</>
                  : <>수집한 소재 {candidates.length}개</>}
              </p>

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
                    {/* 소스·상태는 도구줄에 있다. 같은 것을 두 군데 두지 않는다. */}
                    {columnsOpen ? (
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2"><Input className="h-8" aria-label="제목 필터" value={columnFilters.title ?? ""} onChange={(event) => updateFilter("title", event.target.value)} placeholder="제목 포함" /></th>
                        <th className="px-3 py-2"><Input className="h-8" type="date" aria-label="발행일 필터" value={columnFilters.publishedDate ?? ""} onChange={(event) => updateFilter("publishedDate", event.target.value)} /></th>
                        <th className="px-3 py-2"><Input className="h-8" type="date" aria-label="수집일 필터" value={columnFilters.collectedDate ?? ""} onChange={(event) => updateFilter("collectedDate", event.target.value)} /></th>
                        <th className="px-3 py-2"><Input className="h-8" aria-label="작성자·채널 필터" value={columnFilters.author ?? ""} onChange={(event) => updateFilter("author", event.target.value)} placeholder="작성자 포함" /></th>
                        <th className="px-3 py-2" />
                        <th className="px-3 py-2"><Input className="h-8" aria-label="요약 필터" value={columnFilters.summary ?? ""} onChange={(event) => updateFilter("summary", event.target.value)} placeholder="요약 포함" /></th>
                        <th className="px-3 py-2" />
                        <th className="px-3 py-2"><Input className="h-8" aria-label="원문 URL 필터" value={columnFilters.url ?? ""} onChange={(event) => updateFilter("url", event.target.value)} placeholder="주소 포함" /></th>
                        <th className="px-3 py-2"><Input className="h-8" aria-label="수집 본문 필터" value={columnFilters.body ?? ""} onChange={(event) => updateFilter("body", event.target.value)} placeholder="본문 포함" /></th>
                        <th className="px-3 py-2">
                          <select aria-label="첨부 이미지 필터" className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={columnFilters.thumbnail ?? "all"} onChange={(event) => updateFilter("thumbnail", event.target.value as CandidateColumnFilters["thumbnail"])}>
                            <option value="all">이미지 전체</option><option value="yes">있음</option><option value="no">없음</option>
                          </select>
                        </th>
                        <th className="px-3 py-2">
                          <button type="button" className="whitespace-nowrap text-meta font-bold text-primary underline underline-offset-4" onClick={() => setColumnFilters(EMPTY_CANDIDATE_FILTERS)}>필터 해제</button>
                        </th>
                      </tr>
                    ) : null}
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
                        <td className={`${CELL} whitespace-nowrap`}>{candidate.author || "—"}</td>
                        <td className={`${CELL} whitespace-nowrap`}><Badge variant="secondary">{sourceLabel(candidate)}</Badge></td>
                        <td className={`${CELL} max-w-sm text-xs leading-5 text-muted-foreground`}>{preview(candidate.summary) || "요약을 준비하지 못했습니다."}</td>
                        <td className={`${CELL} whitespace-nowrap`}><Badge variant={candidate.status === "picked" ? "green" : "secondary"}>{statusLabel(candidate.status)}</Badge></td>
                        <td className={`${CELL} whitespace-nowrap`}>{candidate.url ? <a className="font-bold text-primary underline underline-offset-4" href={candidate.url} target="_blank" rel="noreferrer">원문 열기</a> : <span className="text-subtle-foreground">—</span>}</td>
                        <td className={`${CELL} max-w-sm text-xs leading-5 text-muted-foreground`}>
                          <span className="block text-meta font-bold text-subtle-foreground">{bodyLabel(candidate)}</span>
                          {preview(candidate.body, 180) || "—"}
                        </td>
                        <td className={CELL}>
                          {candidate.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={candidate.thumbnailUrl} alt={`${candidate.title} 첨부 이미지`} data-zoomable className="h-14 w-24 cursor-zoom-in rounded-md border object-cover" />
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
