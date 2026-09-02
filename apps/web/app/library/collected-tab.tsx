"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, Input, cn } from "@fixup/ui";
import { putHandoff } from "../../lib/handoff";

/**
 * 수집한 글.
 *
 * 수집 미디어가 자동으로 모아 온 것이 여기 쌓인다. 참고 이미지와 같은 자리에
 * 두는 이유는 하나다 — **올린 것도 모아 온 것도 "내가 가진 재료"** 라서
 * 찾을 곳이 하나여야 한다.
 *
 * 여기서 카드뉴스·포스터로 바로 보낸다.
 */

interface Candidate {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  url: string | null;
  collectedAt: string;
  status: string;
  source: { name: string; kind: string } | null;
}

export function CollectedTab() {
  const router = useRouter();
  const [items, setItems] = React.useState<Candidate[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/candidates")).json();
        if (!alive) return;
        if (body.ok) setItems(body.candidates.filter((item: Candidate) => item.status !== "archived"));
        else setError(body.message ?? "수집한 글을 불러오지 못했습니다.");
      } catch {
        if (alive) setError("수집한 글을 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  const visible = (items ?? []).filter((item) =>
    !query.trim() || item.title.includes(query.trim()));

  /** 고른 글을 그 도구의 시작 화면으로 넘긴다. 복사해 붙일 필요가 없어야 한다. */
  function sendTo(tool: "sns" | "poster" | "create", item: Candidate) {
    const text = (item.body ?? item.summary ?? "").trim();
    putHandoff({ title: item.title, text, url: item.url, candidateId: item.id });
    router.push(tool === "sns" ? "/sns/new" : tool === "poster" ? "/poster/new" : "/create");
  }

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (items === null) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 모아 온 글이 없습니다. <a href="/sources" className="underline underline-offset-2">수집 미디어</a>에서
        유튜브 채널이나 RSS 를 등록하면 여기에 쌓입니다.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="제목으로 찾기"
        className="max-w-sm"
      />
      <div className="grid gap-3">
        {visible.map((item) => (
          <Card key={item.id}>
            <CardContent className="grid gap-3 pt-6">
              <div className="min-w-0">
                <p className="font-bold">{item.title}</p>
                <p className="mt-1 text-meta text-subtle-foreground">
                  {item.source?.name ?? "삭제된 소스"} · {new Date(item.collectedAt).toLocaleDateString("ko-KR")}
                  {item.status === "picked" ? " · 제작 후보" : ""}
                </p>
                {item.summary ? (
                  <p className={cn("mt-2 text-sm text-muted-foreground")}>{item.summary}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => sendTo("sns", item)}>카드뉴스로</Button>
                <Button size="sm" variant="secondary" onClick={() => sendTo("poster", item)}>포스터로</Button>
                <Button size="sm" variant="secondary" onClick={() => sendTo("create", item)}>상세페이지로</Button>
                {item.url ? (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={item.url} target="_blank" rel="noreferrer">원문 보기</a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
