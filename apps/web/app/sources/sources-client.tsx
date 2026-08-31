"use client";

import * as React from "react";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from "@fixup/ui";
import { OFFICIAL_AI_PRESETS } from "../api/sources/schema";

type SourceKind = "youtube_video" | "youtube_channel" | "rss" | "community" | "naver_news" | "official_ai";
type SourceItem = {
  id: string;
  kind: SourceKind;
  name: string;
  url: string;
  intervalHours: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastCheckedAt: string | null;
  nextPollAt: string;
  lastError: string | null;
};

const KIND_LABELS: Record<SourceKind, string> = {
  youtube_video: "유튜브 영상",
  youtube_channel: "유튜브 채널",
  rss: "RSS",
  community: "커뮤니티 페이지",
  naver_news: "네이버 AI 뉴스",
  official_ai: "글로벌 AI 공식 소식",
};

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function SourcesClient() {
  const [sources, setSources] = React.useState<SourceItem[]>([]);
  const [kind, setKind] = React.useState<SourceKind>("youtube_channel");
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [intervalHours, setIntervalHours] = React.useState(12);
  const [maxItems, setMaxItems] = React.useState(20);
  const [queries, setQueries] = React.useState("생성형 AI\n인공지능 기술\nAI 산업\nAI 모델");
  const [provider, setProvider] = React.useState<keyof typeof OFFICIAL_AI_PRESETS>("openai");
  const [selectors, setSelectors] = React.useState({
    itemSelector: "", linkSelector: "", titleSelector: "", excerptSelector: "",
    authorSelector: "", dateSelector: "", thumbnailSelector: "",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sources", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; sources?: SourceItem[]; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "소스를 불러오지 못했습니다.");
      setSources(payload.sources ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "소스를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  function bodyForKind(): Record<string, unknown> {
    const common = { kind, name, intervalHours };
    if (kind === "youtube_video") return { ...common, url };
    if (kind === "youtube_channel" || kind === "rss") return { ...common, url, maxItems };
    if (kind === "community") return { ...common, url, maxItems, ...selectors };
    if (kind === "naver_news") {
      return { ...common, queries: queries.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean), display: 10, maxItems };
    }
    return { ...common, provider };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyForKind()),
      });
      const payload = await response.json() as { ok?: boolean; source?: SourceItem; message?: string };
      if (!response.ok || !payload.ok || !payload.source) throw new Error(payload.message ?? "소스를 등록하지 못했습니다.");
      setSources((current) => [payload.source!, ...current]);
      setName("");
      setUrl("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "소스를 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, input: Record<string, unknown>) {
    try {
      const response = await fetch(`/api/sources/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; source?: SourceItem; message?: string };
      if (!response.ok || !payload.source) throw new Error(payload.message ?? "소스를 수정하지 못했습니다.");
      setSources((current) => current.map((item) => item.id === id ? payload.source! : item));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "소스를 수정하지 못했습니다.");
    }
  }

  async function remove(source: SourceItem) {
    if (!window.confirm(`'${source.name}' 수집 소스를 삭제할까요?`)) return;
    try {
      const response = await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message ?? "소스를 삭제하지 못했습니다.");
      setSources((current) => current.filter((item) => item.id !== source.id));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "소스를 삭제하지 못했습니다.");
    }
  }

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-meta text-subtle-foreground">COLLECTION SOURCES</p>
        <h1 className="mt-1 text-h1">수집 미디어</h1>
        <p className="mt-2 max-w-2xl text-body text-muted-foreground">카드뉴스 소재를 가져올 채널과 피드를 등록합니다. 실패 이유와 다음 확인 시각도 이곳에서 확인할 수 있습니다.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>소스 추가</CardTitle>
          <CardDescription>종류를 먼저 고르면 필요한 입력만 표시됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-6" onSubmit={submit}>
            <div className="grid gap-5 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="source-kind">종류</Label>
                <select id="source-kind" className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value as SourceKind)}>
                  {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="source-name">표시 이름</Label>
                <Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 조코딩, OpenAI 공식 소식" required />
              </div>
            </div>

            <KindFields kind={kind} url={url} setUrl={setUrl} maxItems={maxItems} setMaxItems={setMaxItems} queries={queries} setQueries={setQueries} provider={provider} setProvider={setProvider} selectors={selectors} setSelectors={setSelectors} />

            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="source-interval">확인 주기</Label>
              <select id="source-interval" className={fieldClass} value={intervalHours} onChange={(event) => setIntervalHours(Number(event.target.value))}>
                {[1, 3, 6, 12, 24].map((hours) => <option key={hours} value={hours}>{hours}시간마다</option>)}
              </select>
            </div>

            {message ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p> : null}
            <div><Button type="submit" disabled={saving}><Plus className="size-4" />{saving ? "등록 중" : "소스 등록"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div><CardTitle>등록된 소스</CardTitle><CardDescription>오류가 있으면 해당 소스 바로 아래에 이유가 표시됩니다.</CardDescription></div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" />새로고침</Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중입니다.</p> : sources.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">등록된 수집 소스가 없습니다.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-3 font-medium">이름</th><th className="px-3 py-3 font-medium">종류</th><th className="px-3 py-3 font-medium">주기</th><th className="px-3 py-3 font-medium">마지막 확인</th><th className="px-3 py-3 font-medium">상태</th><th className="px-3 py-3" /></tr></thead>
                <tbody>{sources.map((source) => (
                  <React.Fragment key={source.id}>
                    <tr className="border-b align-top"><td className="px-3 py-4 font-bold">{source.name}<p className="mt-1 max-w-sm truncate text-xs font-normal text-subtle-foreground">{source.url}</p></td><td className="px-3 py-4">{KIND_LABELS[source.kind]}</td><td className="px-3 py-4">{source.intervalHours}시간</td><td className="px-3 py-4 text-muted-foreground">{source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString("ko-KR") : "아직 확인 전"}</td><td className="px-3 py-4"><Button size="sm" variant={source.enabled ? "default" : "secondary"} onClick={() => void patch(source.id, { enabled: !source.enabled })}>{source.enabled ? "켬" : "끔"}</Button></td><td className="px-3 py-4 text-right"><Button size="icon" variant="ghost" aria-label={`${source.name} 삭제`} onClick={() => void remove(source)}><Trash2 className="size-4" /></Button></td></tr>
                    {source.lastError ? <tr><td colSpan={6} className="px-3 pb-4"><div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"><AlertTriangle className="mt-0.5 size-4 flex-none" /><div><strong className="text-sm">마지막 수집 오류</strong><p className="mt-1 text-sm leading-6">{source.lastError}</p></div></div></td></tr> : null}
                  </React.Fragment>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KindFields(props: {
  kind: SourceKind; url: string; setUrl: (value: string) => void; maxItems: number; setMaxItems: (value: number) => void;
  queries: string; setQueries: (value: string) => void; provider: keyof typeof OFFICIAL_AI_PRESETS; setProvider: (value: keyof typeof OFFICIAL_AI_PRESETS) => void;
  selectors: Record<string, string>; setSelectors: React.Dispatch<React.SetStateAction<{ itemSelector: string; linkSelector: string; titleSelector: string; excerptSelector: string; authorSelector: string; dateSelector: string; thumbnailSelector: string }>>;
}) {
  if (props.kind === "naver_news") return <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]"><div className="grid gap-2"><Label htmlFor="naver-queries">검색어</Label><Textarea id="naver-queries" value={props.queries} onChange={(event) => props.setQueries(event.target.value)} rows={5} /><p className="text-xs text-muted-foreground">줄바꿈 또는 쉼표로 최대 10개를 입력합니다.</p></div><MaxItems value={props.maxItems} onChange={props.setMaxItems} /></div>;
  if (props.kind === "official_ai") return <div className="grid gap-2 sm:max-w-lg"><Label htmlFor="official-provider">공식 공급자</Label><select id="official-provider" className={fieldClass} value={props.provider} onChange={(event) => props.setProvider(event.target.value as keyof typeof OFFICIAL_AI_PRESETS)}>{Object.entries(OFFICIAL_AI_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select><p className="text-xs text-muted-foreground">주소는 공식 소스 프리셋으로 자동 설정됩니다.</p></div>;

  const labels: Record<Exclude<SourceKind, "naver_news" | "official_ai">, { label: string; placeholder: string; help: string }> = {
    youtube_video: { label: "영상 주소", placeholder: "https://www.youtube.com/watch?v=...", help: "이 영상 한 건의 자막을 수집합니다." },
    youtube_channel: { label: "채널 주소", placeholder: "https://www.youtube.com/@channel", help: "채널의 새 영상 목록과 자막을 수집합니다." },
    rss: { label: "RSS 주소", placeholder: "https://example.com/feed.xml", help: "RSS·Atom 피드에서 새 글을 가져옵니다." },
    community: { label: "목록 페이지 주소", placeholder: "https://community.example.com/latest", help: "허용한 공개 페이지에서 CSS 선택자로 글 목록을 읽습니다." },
  };
  const info = labels[props.kind];
  return <div className="grid gap-5"><div className="grid gap-2"><Label htmlFor="source-url">{info.label}</Label><Input id="source-url" type="url" value={props.url} onChange={(event) => props.setUrl(event.target.value)} placeholder={info.placeholder} required /><p className="text-xs text-muted-foreground">{info.help}</p></div>{props.kind === "community" ? <div className="grid gap-5 rounded-lg border bg-muted/30 p-5"><div className="grid gap-2"><Label htmlFor="item-selector">글 한 건 선택자 · 필수</Label><Input id="item-selector" value={props.selectors.itemSelector} onChange={(event) => props.setSelectors((current) => ({ ...current, itemSelector: event.target.value }))} placeholder="article.post" required /></div><div className="grid gap-4 md:grid-cols-2">{[["linkSelector", "링크 선택자", "a.link"], ["titleSelector", "제목 선택자", ".title"], ["excerptSelector", "요약 선택자", ".excerpt"], ["authorSelector", "작성자 선택자", ".writer"], ["dateSelector", "날짜 선택자", "time"], ["thumbnailSelector", "썸네일 선택자", "img"]].map(([key, label, placeholder]) => <div className="grid gap-2" key={key}><Label htmlFor={key}>{label}</Label><Input id={key} value={props.selectors[key] ?? ""} onChange={(event) => props.setSelectors((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} /></div>)}</div></div> : null}{props.kind !== "youtube_video" ? <MaxItems value={props.maxItems} onChange={props.setMaxItems} /> : null}</div>;
}

function MaxItems({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="grid gap-2 sm:max-w-xs"><Label htmlFor="max-items">한 번에 가져올 최대 개수</Label><Input id="max-items" type="number" min={1} max={50} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}
