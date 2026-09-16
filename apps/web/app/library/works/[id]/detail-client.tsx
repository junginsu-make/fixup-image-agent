"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { ThumbImage } from "../../../_components/thumb-image";
import { processRows, sectionRows } from "../../work-detail";
import { TOOL_LABEL } from "../../library-works";
import type { WorkProcess } from "../../../api/library/work-process";

interface WorkImage { position: number; url: string | null }

interface Work {
  id: string;
  title: string;
  tool: "create" | "redesign";
  aspectRatio: string | null;
  imageCount: number;
  createdAt: string;
  mine: boolean;
  ownerEmail: string | null;
  process: WorkProcess | null;
}

/**
 * 이 작업을 **무엇으로 만들었는지** 보여준다.
 *
 * 관리자는 남의 작업도 본다. 회원용 경로가 404 면 관리자 통로에 한 번 더
 * 묻는다 — 카드뉴스·포스터·캐릭터와 같은 판단이다.
 */
export function WorkDetailClient({ workId }: { workId: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; work: Work; images: WorkImage[]; readOnly: boolean }
  >({ kind: "loading" });
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/library/${encodeURIComponent(workId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!alive) return;
        if (body?.ok && body.work) {
          setState({ kind: "ready", work: body.work, images: body.images ?? [], readOnly: false });
          return;
        }
        /*
          **404 면 남의 작업일 수 있다.** 회원용 경로는 팀 범위로 걸러진다.
          관리자에게는 별도 통로가 있으므로 한 번 더 묻는다.
        */
        if (response.status === 404) {
          const admin = await fetch(`/api/admin/works/library/${encodeURIComponent(workId)}`, { cache: "no-store" });
          const seen = await admin.json().catch(() => null);
          if (!alive) return;
          if (seen?.ok && seen.work) {
            setState({ kind: "ready", work: seen.work, images: seen.images ?? [], readOnly: true });
            return;
          }
        }
        setState({ kind: "error", message: body?.message ?? "작업을 불러오지 못했습니다." });
      } catch {
        if (alive) setState({ kind: "error", message: "작업을 불러오지 못했습니다." });
      }
    })();
    return () => { alive = false; };
  }, [workId]);

  /** 남의 작업을 **내 것으로 복사한다.** 고치는 대신 복사한다. */
  const copyToSelf = React.useCallback(async () => {
    setCopying(true);
    try {
      const body = await (await fetch(`/api/admin/works/library/${encodeURIComponent(workId)}/copy`, {
        method: "POST",
      })).json() as { ok?: boolean; id?: string; message?: string };
      if (!body.ok || !body.id) throw new Error(body.message ?? "복사하지 못했습니다.");
      router.push(`/library/works/${encodeURIComponent(body.id)}`);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "복사하지 못했습니다.");
    } finally {
      setCopying(false);
    }
  }, [workId, router]);

  if (state.kind === "loading") {
    return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {state.message}
      </div>
    );
  }

  const { work, images, readOnly } = state;
  const rows = processRows(work.process);
  const sections = sectionRows(work.process);
  const shown = images.filter((image) => image.url);

  return (
    <div className="grid gap-6">
      {/*
        **남의 것을 보는 중이라고 먼저 말한다.** 안 적으면 자기 것인 줄 알고
        고치려 한다. 무엇을 하면 되는지(복사)까지 같은 자리에 둔다.
      */}
      {readOnly ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>
            <b>다른 회원의 작업</b>을 보는 중입니다. 과정과 결과는 볼 수 있고
            고칠 수는 없습니다. 고치려면 내 것으로 복사하세요.
          </span>
          <Button size="sm" disabled={copying} onClick={() => void copyToSelf()}>
            {copying ? "복사하는 중…" : "내 것으로 복사"}
          </Button>
        </div>
      ) : null}

      <header>
        <p className="text-meta text-subtle-foreground">{TOOL_LABEL[work.tool]}</p>
        <h1 className="mt-1 text-h1">{work.title}</h1>
        <p className="mt-2 text-body text-muted-foreground">
          이 작업을 무엇으로 만들었는지와, 만들어진 그림을 봅니다.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>어떻게 만들었습니다</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {rows.length ? rows.map((row) => (
            <div key={row.label} className="grid gap-1">
              <p className="text-meta text-subtle-foreground">{row.label}</p>
              <p className="whitespace-pre-wrap text-sm">{row.value}</p>
            </div>
          )) : (
            /*
              **소급되지 않는다.** 과정을 남기기 시작한 것은 2026-09-16 이고,
              그전 작업은 영영 비어 있다. 그 사실을 말하지 않고 빈 화면만 내면
              「설정이 다 사라졌다」로 읽힌다 — 포스터에서 실제로 그렇게 읽혔다.
            */
            <p className="text-sm text-muted-foreground">
              이 작업에는 만든 과정이 남아 있지 않습니다. 과정은 나중에 남기기
              시작해서, 그전에 만든 것에는 없습니다. 결과 그림은 아래에 있습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {sections.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              어떤 섹션으로 짰습니다 <Badge variant="secondary" className="ml-1">{sections.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {sections.map((section) => (
              <div key={section.no} className="grid gap-1 border-l-2 pl-3">
                <p className="text-sm font-bold">
                  {section.no}. {section.title || "이름 없는 섹션"}
                </p>
                {section.role ? (
                  <p className="text-meta text-subtle-foreground">{section.role}</p>
                ) : null}
                {section.copy ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{section.copy}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            만들어진 그림 <Badge variant="secondary" className="ml-1">{shown.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shown.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((image) => (
                <figure key={image.position} className="grid gap-2">
                  <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
                    {/*
                      여기는 **원본을 그대로 쓴다.** 격자가 사본을 쓰는 것은
                      목록 이야기다(`_components/grid-src.ts`) — 이 화면은 한
                      작업만 열고, 확대하면 원본이어야 한다.
                    */}
                    <ThumbImage
                      src={image.url as string}
                      data-viewer-src={image.url ?? undefined}
                      data-zoomable
                      alt={`${work.title} · ${image.position + 1}번째`}
                      className="h-full w-full cursor-zoom-in object-cover"
                    />
                  </div>
                  <figcaption className="text-center text-xs text-muted-foreground">
                    {image.position + 1}번째
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">볼 수 있는 그림이 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
