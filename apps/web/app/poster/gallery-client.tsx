"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";

interface PosterProjectSummary {
  id: string;
  title: string;
  status: string;
  ratio: string;
  updatedAt: string;
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

  return (
    <div className="grid gap-3">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{project.title}</CardTitle>
              <p className="mt-1 text-meta text-subtle-foreground">
                {project.ratio} · {STATUS_LABEL[project.status] ?? project.status} ·{" "}
                {new Date(project.updatedAt).toLocaleString("ko-KR")}
              </p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/poster/${project.id}`}>열기</Link>
            </Button>
          </CardHeader>
          <CardContent className="hidden" />
        </Card>
      ))}
    </div>
  );
}
