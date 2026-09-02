"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Badge, Button, Card, CardContent,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@fixup/ui";

/**
 * 작업물 — **이 시스템이 만든 결과물**.
 *
 * 참고 이미지와 나누는 기준은 하나다.
 *
 *   참고 이미지   사용자가 첨부한 것
 *   작업물        시스템이 만든 것
 *
 * 전에는 도구별(새로 만들기 / 리디자인)로 나눠 보여줬는데, 사용자에게는
 * "내가 만든 것"이 하나다. 어느 도구로 만들었는지는 그 안에 적으면 된다.
 *
 * 카드뉴스처럼 여러 장이 한 벌인 것은 **묶음 하나로** 보여주고 대표 그림을
 * 세운다. 누르면 언제 만들었는지, 무슨 내용이었는지, 어떤 설정으로 만들었는지,
 * 누가 만들었는지를 편다.
 */

type Tool = "sns" | "poster";

interface WorkImage { url: string; label: string }

interface Work {
  id: string;
  tool: Tool;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  cover: string | null;
  images: WorkImage[];
  /** 무엇을 만들려던 것인가. 카드뉴스는 원본 글, 포스터는 한 줄 지시. */
  intent: string;
  /** 사용자가 정한 값들. 이름과 값 쌍으로 그대로 보여준다. */
  settings: Array<[string, string]>;
  href: string;
}

const STATUS: Record<string, { label: string; tone: "green" | "secondary" | "destructive" }> = {
  draft: { label: "쓰는 중", tone: "secondary" },
  planning: { label: "기획 중", tone: "secondary" },
  copy_ready: { label: "원고 준비됨", tone: "secondary" },
  generating: { label: "만드는 중", tone: "secondary" },
  ready: { label: "완료", tone: "green" },
  done: { label: "완료", tone: "green" },
  failed: { label: "실패", tone: "destructive" },
};

const TOOL_LABEL: Record<Tool, string> = { sns: "카드뉴스", poster: "포스터" };

function when(value: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

/** 카드뉴스 원본 글은 종류마다 담긴 자리가 다르다. */
function snsIntent(source: Record<string, unknown> | undefined): string {
  if (!source) return "";
  if (typeof source.text === "string") return source.text;
  if (typeof source.url === "string") return source.url;
  if (typeof source.question === "string") return source.question;
  return "";
}

function toSnsWork(project: Record<string, any>): Work {
  const cards: Array<{ index: number; assetUrl?: string | null; copy?: { headline?: string } }> =
    project.data?.flow?.cards ?? [];
  const images = cards
    .filter((card) => card.assetUrl)
    .map((card) => ({ url: card.assetUrl as string, label: `${card.index}번 카드` }));
  return {
    id: project.id,
    tool: "sns",
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    userId: project.userId,
    cover: images[0]?.url ?? null,
    images,
    intent: snsIntent(project.data?.source),
    settings: [
      ["비율", project.ratio],
      ["언어", project.language],
      ["모델", project.modelId],
      ["장수", project.cardCountMode === "fixed" ? `${project.cardCount}장 고정` : "AI 추천"],
      ...(project.toneNote ? ([["톤·요청", project.toneNote]] as Array<[string, string]>) : []),
      ["첨부 그림", `${(project.data?.attachments ?? []).length}장`],
    ],
    href: `/sns/${project.id}`,
  };
}

function toPosterWork(project: Record<string, any>): Work {
  const images: WorkImage[] = (project.images ?? [])
    .filter((image: { url?: string }) => image.url)
    .map((image: { url: string; variantIndex: number }) => ({
      url: image.url, label: `변형 ${image.variantIndex + 1}`,
    }));
  return {
    id: project.id,
    tool: "poster",
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    userId: project.userId,
    cover: images[0]?.url ?? null,
    images,
    intent: project.data?.instruction ?? "",
    settings: [
      ["비율", project.ratio],
      ["모델", project.modelId],
      ["변형", `${project.data?.variants ?? 0}장`],
      ["따라 만들 그림", `${(project.data?.referenceIds ?? []).length}장`],
      ["그대로 지킬 것", `${(project.data?.preservedIds ?? []).length}장`],
    ],
    href: `/poster/${project.id}`,
  };
}

export function WorksTab() {
  const router = useRouter();
  const [works, setWorks] = React.useState<Work[] | null>(null);
  const [message, setMessage] = React.useState("");
  const [open, setOpen] = React.useState<Work | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // 두 도구를 함께 읽어 한 목록으로 만든다. 사용자에게는 "내가 만든 것"이 하나다.
        const [sns, poster] = await Promise.all([
          fetch("/api/sns/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
          fetch("/api/poster/projects", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        ]);
        if (!alive) return;
        const merged = [
          ...(sns.ok ? (sns.projects ?? []).map(toSnsWork) : []),
          ...(poster.ok ? (poster.projects ?? []).map(toPosterWork) : []),
        ].sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
        setWorks(merged);
      } catch {
        if (alive) setMessage("작업물을 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (message) return <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>;
  if (!works) return <p className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />작업물을 불러오는 중입니다.</p>;
  if (!works.length) return <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">아직 만든 작업물이 없습니다.</p>;

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">작업물</h2>
        <p className="mt-1 text-sm text-muted-foreground">이 시스템으로 만든 결과물입니다. 눌러서 언제·무엇을·어떤 설정으로 만들었는지 봅니다.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {works.map((work) => (
          <Card key={`${work.tool}-${work.id}`} className="cursor-pointer overflow-hidden" onClick={() => setOpen(work)}>
            <div className="h-40 bg-muted">
              {work.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={work.cover} alt={work.title} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">아직 그림이 없습니다</div>
              )}
            </div>
            <CardContent className="grid gap-2 p-3">
              <p className="truncate text-sm font-bold">{work.title}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{TOOL_LABEL[work.tool]}</Badge>
                {work.images.length > 1 ? <Badge variant="secondary">{work.images.length}장 묶음</Badge> : null}
                <Badge variant={(STATUS[work.status] ?? { tone: "secondary" as const }).tone}>
                  {(STATUS[work.status] ?? { label: work.status }).label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <DialogContent className="max-w-4xl">
          {open ? <>
            <DialogHeader>
              <DialogTitle>{open.title}</DialogTitle>
              <DialogDescription>
                {TOOL_LABEL[open.tool]} · {when(open.createdAt || open.updatedAt)}
                {open.images.length ? ` · ${open.images.length}장` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="grid max-h-[62vh] gap-5 overflow-y-auto p-1">
              {open.images.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {open.images.map((image) => (
                    <figure key={image.url} className="grid gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.label} data-zoomable className="aspect-[4/5] w-full cursor-zoom-in rounded-md border object-cover" />
                      <figcaption className="text-center text-meta text-subtle-foreground">{image.label}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}

              {open.intent ? (
                <section>
                  <h3 className="text-sm font-bold">무엇을 만들려던 것인가</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {open.intent.length > 800 ? `${open.intent.slice(0, 800)}…` : open.intent}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="text-sm font-bold">이렇게 만들었습니다</h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  {open.settings.filter(([, value]) => value).map(([name, value]) => (
                    <div key={name} className="flex gap-3">
                      <dt className="w-24 flex-none text-subtle-foreground">{name}</dt>
                      <dd className="m-0 flex-1 break-words">{value}</dd>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <dt className="w-24 flex-none text-subtle-foreground">만든 사람</dt>
                    <dd className="m-0 flex-1 break-words">{open.userId ?? "확인할 수 없음"}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-24 flex-none text-subtle-foreground">마지막 수정</dt>
                    <dd className="m-0 flex-1">{when(open.updatedAt)}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <DialogFooter>
              <Button onClick={() => router.push(open.href)}>이 작업 열기</Button>
            </DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
