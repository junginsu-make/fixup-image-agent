"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { ThumbImage } from "../../_components/thumb-image";
import { gridSrc } from "../../_components/grid-src";
import { characterDetailRows, shownViews } from "../character-detail";
import { characterAngleLabel } from "../../../lib/character-library";

interface CharacterView {
  angle: string;
  url?: string | null;
  thumbUrl?: string | null;
}

interface Character {
  id: string;
  name: string;
  sourcePrompt?: string | null;
  identityPrompt?: string | null;
  kind?: string | null;
  look?: string | null;
  createdAt?: string | null;
  views?: CharacterView[];
  /** 내가 만든 것인가. 서버가 정한다(`lib/characters.ts`). */
  mine?: boolean;
}

/**
 * 캐릭터 하나를 **무엇으로 만들었는지** 보여준다.
 *
 * 카드뉴스·포스터의 「과정 보기」와 같은 자리다. 다만 캐릭터는 단계를 밟는
 * 흐름이 아니라 설정과 결과물이라, 단계 막대 대신 **내가 적은 말 → AI 가
 * 정리한 것 → 만들어진 각도**를 차례로 보여준다.
 *
 * 관리자는 남의 캐릭터도 본다. 회원용 경로가 404 면 관리자 통로에 한 번 더
 * 묻는다 — 카드뉴스·포스터와 같은 판단이다.
 */
export function CharacterDetailClient({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; character: Character; readOnly: boolean }
  >({ kind: "loading" });
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!alive) return;
        if (body?.ok && body.character) {
          /*
            **주인이 아니면 읽기 전용이다.** 회원용 목록은 팀 범위라 같은 팀
            사람의 캐릭터도 성공으로 온다 — 404 로 가르면 팀원의 캐릭터를
            자기 것으로 보게 된다.
          */
          setState({
            kind: "ready", character: body.character,
            readOnly: !body.character.mine,
          });
          return;
        }
        /*
          **404 면 남의 캐릭터일 수 있다.** 회원용 경로는 팀 범위로 걸러진다.
          관리자에게는 별도 통로가 있으므로 한 번 더 묻는다.
        */
        if (response.status === 404) {
          const admin = await fetch(`/api/admin/works/character/${encodeURIComponent(characterId)}`, { cache: "no-store" });
          const seen = await admin.json().catch(() => null);
          if (!alive) return;
          if (seen?.ok && seen.work) {
            setState({ kind: "ready", character: seen.work, readOnly: true });
            return;
          }
        }
        setState({ kind: "error", message: body?.message ?? "캐릭터를 불러오지 못했습니다." });
      } catch {
        if (alive) setState({ kind: "error", message: "캐릭터를 불러오지 못했습니다." });
      }
    })();
    return () => { alive = false; };
  }, [characterId]);

  /** 남의 캐릭터를 **내 것으로 복사한다.** 고치는 대신 복사한다. */
  const copyToSelf = React.useCallback(async () => {
    setCopying(true);
    try {
      const body = await (await fetch(`/api/admin/works/character/${encodeURIComponent(characterId)}/copy`, {
        method: "POST",
      })).json() as { ok?: boolean; id?: string; message?: string };
      if (!body.ok || !body.id) throw new Error(body.message ?? "복사하지 못했습니다.");
      router.push(`/characters/${encodeURIComponent(body.id)}`);
    } catch (cause) {
      setState((current) => (current.kind === "ready" ? current : current));
      window.alert(cause instanceof Error ? cause.message : "복사하지 못했습니다.");
    } finally {
      setCopying(false);
    }
  }, [characterId, router]);

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

  const { character, readOnly } = state;
  const rows = characterDetailRows(character);
  const views = shownViews(character.views);

  return (
    <div className="grid gap-6">
      {/*
        **남의 것을 보는 중이라고 먼저 말한다.** 안 적으면 자기 것인 줄 알고
        고치려 한다. 무엇을 하면 되는지(복사)까지 같은 자리에 둔다.
      */}
      {readOnly ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span>
            <b>다른 회원의 캐릭터</b>를 보는 중입니다. 설정과 각도는 볼 수 있고
            고칠 수는 없습니다. 고치려면 내 것으로 복사하세요.
          </span>
          <Button size="sm" disabled={copying} onClick={() => void copyToSelf()}>
            {copying ? "복사하는 중…" : "내 것으로 복사"}
          </Button>
        </div>
      ) : null}

      <header>
        <p className="text-meta text-subtle-foreground">CHARACTER</p>
        <h1 className="mt-1 text-h1">{character.name}</h1>
        <p className="mt-2 text-body text-muted-foreground">
          이 캐릭터를 무엇으로 만들었는지와, 만들어진 각도를 봅니다.
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
            <p className="text-sm text-muted-foreground">
              이 캐릭터에는 만든 기록이 남아 있지 않습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            만들어진 각도 <Badge variant="secondary" className="ml-1">{views.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {views.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {views.map((view) => (
                <figure key={view.angle} className="grid gap-2">
                  <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
                    {/* 격자는 사본, 확대는 원본이다(`_components/grid-src.ts`). */}
                    <ThumbImage
                      src={gridSrc(view) as string}
                      data-viewer-src={view.url ?? undefined}
                      data-zoomable
                      alt={`${character.name} · ${characterAngleLabel(view.angle)}`}
                      className="h-full w-full cursor-zoom-in object-cover"
                    />
                  </div>
                  <figcaption className="text-center text-xs text-muted-foreground">
                    {characterAngleLabel(view.angle)}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">아직 만들어진 각도가 없습니다.</p>
          )}
        </CardContent>
      </Card>

      {!readOnly ? (
        <div>
          <Button asChild variant="secondary">
            <Link href="/characters">캐릭터 만들기에서 이어 하기</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
