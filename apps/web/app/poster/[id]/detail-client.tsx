"use client";

import * as React from "react";
import { PosterClient } from "./poster-client";

type Ready = { kind: "ready" } & React.ComponentProps<typeof PosterClient>;

/**
 * 작업 하나를 불러온다.
 *
 * 서버에서 미리 담지 않고 여기서 가져온다 — 카드뉴스와 같은 방식이다.
 * 저장소가 아직 운영 DB 에 없을 때 화면 전체가 깨지지 않고 이유만 보인다.
 */
export function PosterDetailClient({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error"; message: string } | Ready
  >({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch(`/api/poster/projects/${projectId}`)).json();
        if (!alive) return;
        if (body.ok) setState({ kind: "ready", project: body.project, images: body.images ?? [] });
        else setState({ kind: "error", message: body.message ?? "작업을 불러오지 못했습니다." });
      } catch {
        if (alive) setState({ kind: "error", message: "작업을 불러오지 못했습니다." });
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

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
  return <PosterClient project={state.project} images={state.images} />;
}
