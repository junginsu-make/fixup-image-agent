"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Card, CardContent } from "@fixup/ui";
import { DeleteWorkButton } from "../_components/delete-work-button";
import { ThumbImage } from "../_components/thumb-image";

interface PosterProjectSummary {
  id: string;
  title: string;
  status: string;
  ratio: string;
  updatedAt: string;
  images?: Array<{ url?: string; thumbUrl?: string | null; variantIndex: number }>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "시작함",
  planning: "기획 중",
  ready: "기획 완료",
  generating: "만드는 중",
  done: "완료",
  failed: "실패",
};

export function PosterGallery() {
  const [projects, setProjects] = React.useState<PosterProjectSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/poster/projects")).json();
        if (!alive) return;
        if (body.ok) setProjects(body.projects);
        else setError(body.message ?? "목록을 불러오지 못했습니다.");
      } catch {
        if (alive) setError("목록을 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (projects === null) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 만든 이미지가 없습니다.</p>;
  }

  // 목록에도 무엇을 만들었는지 보여준다. 제목만 있으면 열어 보기 전에는
  // 알 수 없다 — 카드뉴스 목록이 쓰는 것과 같은 격자다.
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {projects.map((project) => {
        // 표지는 사본을 쓴다. 열어서 보는 화면은 원본을 그대로 쓴다.
        const first = project.images?.find((image) => image.url);
        const cover = first?.thumbUrl ?? first?.url ?? null;
        const made = project.images?.filter((image) => image.url).length ?? 0;
        return (
          <Card key={project.id} className="relative overflow-hidden">
            <DeleteWorkButton
              endpoint={`/api/poster/projects/${project.id}`}
              title={project.title}
              what=" 이미지 작업"
              onDeleted={() => setProjects((current) => (current ?? []).filter((entry) => entry.id !== project.id))}
            />
            <Link href={`/poster/${project.id}`} className="block">
              {/* 잘라 내지 않는다. 비율이 제각각이라 잘라 놓으면 무엇을
                   만들었는지 알아볼 수 없다. */}
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted p-1">
                {cover ? (
                  <ThumbImage src={cover} alt={project.title} className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">아직 그림이 없습니다</div>
                )}
              </div>
              <CardContent className="grid gap-2 p-3">
                <p className="truncate text-sm font-bold">{project.title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{STATUS_LABEL[project.status] ?? project.status}</Badge>
                  {made ? <Badge variant="secondary">{made}장</Badge> : null}
                </div>
                <p className="text-meta text-subtle-foreground">
                  {new Date(project.updatedAt).toLocaleString("ko-KR")} · {project.ratio}
                </p>
              </CardContent>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
