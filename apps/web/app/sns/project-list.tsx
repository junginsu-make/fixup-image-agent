"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge, Card, CardContent } from "@fixup/ui";

/**
 * 지난 카드뉴스 작업.
 *
 * 만들고 나면 다시 찾을 길이 없었다. 첫 화면에 「만들기」 버튼만 있어서,
 * 주소를 외워 두지 않으면 어제 만든 것을 못 연다.
 *
 * 만든 것은 서버에 그대로 있다. 보여주기만 하면 된다.
 */

interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  ratio: string;
  modelId: string;
  cardCount?: number;
  updatedAt: string;
  data?: { flow?: { cards?: Array<{ index: number; assetUrl?: string | null }> } };
}

const STATUS: Record<string, { label: string; tone: "green" | "secondary" | "destructive" }> = {
  draft: { label: "쓰는 중", tone: "secondary" },
  planning: { label: "기획 중", tone: "secondary" },
  copy_ready: { label: "원고 준비됨", tone: "secondary" },
  generating: { label: "만드는 중", tone: "secondary" },
  ready: { label: "완료", tone: "green" },
  failed: { label: "실패", tone: "destructive" },
};

function when(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

export function SnsProjectList() {
  const [projects, setProjects] = React.useState<ProjectSummary[] | null>(null);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/sns/projects", { cache: "no-store" })).json();
        if (!alive) return;
        if (body.ok) setProjects(body.projects ?? []);
        else setMessage(body.message ?? "지난 작업을 불러오지 못했습니다.");
      } catch {
        if (alive) setMessage("지난 작업을 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (message) return <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>;
  if (!projects) return <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />지난 작업을 불러오는 중입니다.</p>;
  if (!projects.length) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">아직 만든 카드뉴스가 없습니다.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const cards = project.data?.flow?.cards ?? [];
        // 대표 그림은 첫 장이다. 표지가 그 작업을 가장 잘 알려 준다.
        const cover = cards.find((card) => card.assetUrl)?.assetUrl ?? null;
        const made = cards.filter((card) => card.assetUrl).length;
        const status = STATUS[project.status] ?? { label: project.status, tone: "secondary" as const };
        return (
          <Card key={project.id} className="overflow-hidden">
            <Link href={`/sns/${project.id}`} className="block">
              <div className="aspect-[4/5] bg-muted">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={project.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">아직 그림이 없습니다</div>
                )}
              </div>
              <CardContent className="grid gap-2 p-3">
                <p className="truncate text-sm font-bold">{project.title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={status.tone}>{status.label}</Badge>
                  {made ? <Badge variant="secondary">{made}장</Badge> : null}
                </div>
                <p className="text-meta text-subtle-foreground">{when(project.updatedAt)} · {project.ratio}</p>
              </CardContent>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
