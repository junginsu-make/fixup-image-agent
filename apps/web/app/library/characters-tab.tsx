"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, UserRound } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@fixup/ui";
import { ThumbImage } from "../_components/thumb-image";

/**
 * 캐릭터.
 *
 * 만든 캐릭터는 각도마다 참고 이미지 창고에도 들어간다. 그런데 거기서는
 * 올린 그림들 사이에 낱장으로 섞여, 한 명 만들 때마다 여섯 장이 흩어졌다.
 * **만든 사람은 "누구"를 찾지 "그림 여섯 장"을 찾지 않는다** — 여기서는
 * 한 명을 한 덩어리로 묶어 보여 준다.
 *
 * 보는 곳이다. 각도를 다시 만들거나 지우는 것은 캐릭터 만들기 화면이 한다 —
 * 두 곳에 두면 한쪽만 고쳐지고 서로 어긋난다.
 */

interface CharacterView {
  angle: string;
  url: string | null;
  /** 격자에 거는 사본. 없으면 `url` 로 떨어진다. */
  thumbUrl?: string | null;
}

interface Character {
  id: string;
  name: string;
  kind: string;
  look: string;
  createdAt: string;
  views: CharacterView[];
}

const KIND_LABEL: Record<string, string> = {
  person: "사람", animal: "동물", character: "캐릭터", object: "사물",
};

const LOOK_LABEL: Record<string, string> = {
  photoreal: "실사", anime: "애니", "3d": "3D", illustration: "일러스트",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

export function CharactersTab() {
  const [items, setItems] = React.useState<Character[] | null>(null);
  /** 각도 이름표는 서버가 준다. 화면에 박아 두면 각도가 늘 때 여기만 옛말이 된다. */
  const [angleLabels, setAngleLabels] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = await (await fetch("/api/characters", { cache: "no-store" })).json() as {
          ok?: boolean;
          characters?: Character[];
          angles?: Array<{ id: string; label: string }>;
          message?: string;
        };
        if (!alive) return;
        if (!body.ok) return setMessage(body.message ?? "캐릭터를 불러오지 못했습니다.");
        setItems(body.characters ?? []);
        setAngleLabels(Object.fromEntries((body.angles ?? []).map((angle) => [angle.id, angle.label])));
      } catch {
        if (alive) setMessage("캐릭터를 불러오지 못했습니다.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (message) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (!items) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />캐릭터를 불러오는 중입니다.
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">캐릭터</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            각도를 고정해 둔 인물·동물·사물입니다. 도구에서 「라이브러리에서 불러오기」를 누르면 캐릭터 칸에 이 목록이 나옵니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/characters">캐릭터 만들기 열기</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="grid place-items-center gap-3 py-14 text-center">
          <UserRound className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">아직 만든 캐릭터가 없습니다.</p>
          <Button asChild size="sm"><Link href="/characters">캐릭터 만들러 가기</Link></Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((character) => {
            const shown = character.views.filter((view) => view.url);
            return (
              <Card key={character.id}>
                <CardContent className="grid gap-3 pt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">{character.name}</p>
                    <Badge variant="secondary">{KIND_LABEL[character.kind] ?? character.kind}</Badge>
                    <Badge variant="secondary">{LOOK_LABEL[character.look] ?? character.look}</Badge>
                  </div>

                  {shown.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      저장된 각도가 없습니다. 캐릭터 만들기 화면에서 다시 만들어 주세요.
                    </p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {shown.map((view) => (
                        <figure key={view.angle} className="w-20 shrink-0">
                          <span className="block aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                            <ThumbImage
                              src={(view.thumbUrl ?? view.url) as string}
                              data-viewer-src={(view.url as string) ?? undefined}
                              alt={`${character.name} · ${angleLabels[view.angle] ?? view.angle}`}
                              data-zoomable
                              className="h-full w-full cursor-zoom-in object-cover"
                            />
                          </span>
                          <figcaption className="mt-1 truncate text-center text-[11px] text-subtle-foreground">
                            {angleLabels[view.angle] ?? view.angle}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  <p className="text-meta text-subtle-foreground">
                    {shown.length}장 · {formatDate(character.createdAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
