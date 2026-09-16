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
export function PosterDetailClient(
  { projectId, adEnabled = false }: { projectId: string; adEnabled?: boolean },
) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error"; message: string } | Ready
  >({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/poster/projects/${projectId}`);
        const body = await response.json();
        if (!alive) return;
        if (body.ok) {
          setState({ kind: "ready", project: body.project, images: body.images ?? [] });
          return;
        }
        /*
          **404 면 남의 작업일 수 있다.** 회원용 경로는 RLS 를 타서 내 것과
          같은 팀 것만 준다. 관리자에게는 별도 통로가 있으므로 한 번 더 묻는다.
          거기서도 막히면 관리자가 아니거나 정말 없는 작업이다.

          카드뉴스(`sns/[id]/project-client.tsx`)와 같은 판단이다.
        */
        if (response.status === 404) {
          const admin = await fetch(`/api/admin/works/poster/${projectId}`, { cache: "no-store" });
          const seen = await admin.json().catch(() => null);
          if (!alive) return;
          if (seen?.ok && seen.work) {
            // 관리자 통로가 **서명 주소로 바꾼 그림**을 함께 준다. 처음엔 안
            // 싣고 「안 보인다」고 띠에 적었는데, 과정을 본다면서 결과를 못
            // 보면 보는 뜻이 없다(2026-09-16 신고).
            setState({
              kind: "ready", project: seen.work,
              images: seen.images ?? [], readOnly: true,
            });
            return;
          }
        }
        setState({ kind: "error", message: body.message ?? "작업을 불러오지 못했습니다." });
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
  return <PosterClient project={state.project} images={state.images} adEnabled={adEnabled} readOnly={state.readOnly} />;
}
