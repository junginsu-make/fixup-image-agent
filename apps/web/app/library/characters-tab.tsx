"use client";

import { IMAGE_LOOK_LABEL } from "@fixup/shared";
import * as React from "react";
import Link from "next/link";
import { ListOrdered, Loader2, UserRound } from "lucide-react";
import { Badge, Button, Card, CardContent, cn } from "@fixup/ui";
import { CORNER_BUTTON } from "../_components/delete-work-button";
import { ThumbImage } from "../_components/thumb-image";
import { openImageGallery } from "../_components/image-viewer";

/**
 * 캐릭터.
 *
 * 만든 캐릭터는 각도마다 참고 이미지 창고에도 들어간다. 그런데 거기서는
 * 올린 그림들 사이에 낱장으로 섞여, 한 명 만들 때마다 여섯 장이 흩어졌다.
 * **만든 사람은 "누구"를 찾지 "그림 여섯 장"을 찾지 않는다** — 여기서는
 * 한 명을 한 덩어리로 묶어 보여 준다.
 *
 * **카드에는 정면 한 장만**, 누르면 큰 창에서 옆으로 넘겨 각도·다각도를 본다(2026-10-08 사용자
 * 요청). 작업물·상세페이지와 같은 모양이다 — 전에는 카드마다 각도를 작게 늘어놓아 이 화면만 달랐다.
 *
 * **최고 관리자는 모든 회원의 캐릭터를 본다**(사용자가 여러 번 말함). `scope=all` 로 묻고,
 * 서버가 관리자에게만 넓힌다 — 회원에게는 자기 것만 온다.
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
  /** 내가 만든 것인가. 서버가 정한다. */
  mine?: boolean;
  /** 만든 사람. 관리자가 전체를 볼 때 남의 것에만 온다. */
  ownerEmail?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  person: "사람", animal: "동물", character: "캐릭터", object: "사물",
};

/** 만들 때 고른 이름과 같아야 한다. 손으로 적으면 갈린다(2026-09-16 검토). */
const LOOK_LABEL: Record<string, string> = IMAGE_LOOK_LABEL;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

/** 서명 주소의 경로 쪽 확장자. 내려받을 이름에 쓴다(없으면 png). */
function extensionOf(url: string): string {
  return url.split("?")[0]!.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "png";
}

/** 큰 창을 연다. 정면이 먼저다 — 서버가 각도 순서로 준다. */
function openCharacter(character: Character, labels: Record<string, string>) {
  const meta: Array<[string, string]> = [
    ["만든 때", formatDate(character.createdAt)],
    ["종류", KIND_LABEL[character.kind] ?? character.kind],
    ["그림체", LOOK_LABEL[character.look] ?? character.look],
    ...(character.mine === false ? ([["만든 사람", character.ownerEmail ?? "다른 회원"]] as Array<[string, string]>) : []),
  ];
  openImageGallery({
    images: character.views
      .filter((view): view is CharacterView & { url: string } => Boolean(view.url))
      .map((view) => {
        const label = labels[view.angle] ?? view.angle;
        return {
          src: view.url,
          alt: `${character.name} · ${label}`,
          name: `${character.name} ${label}.${extensionOf(view.url)}`,
          meta,
        };
      }),
  });
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
        const body = await (await fetch("/api/characters?scope=all", { cache: "no-store" })).json() as {
          ok?: boolean;
          characters?: Character[];
          angles?: Array<{ id: string; label: string }>;
          /** 다각도 한 장. 각도 목록 밖이라 따로 온다 — 안 실으면 「sheet」 가 그대로 찍혔다. */
          sheet?: { id: string; label: string };
          message?: string;
        };
        if (!alive) return;
        if (!body.ok) return setMessage(body.message ?? "캐릭터를 불러오지 못했습니다.");
        setItems(body.characters ?? []);
        setAngleLabels(Object.fromEntries(
          [...(body.angles ?? []), ...(body.sheet ? [body.sheet] : [])].map((angle) => [angle.id, angle.label]),
        ));
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
            각도를 고정해 둔 인물·동물·사물입니다. 눌러서 각도를 넘겨 봅니다. 도구에서 「라이브러리에서 불러오기」를 누르면 캐릭터 칸에 이 목록이 나옵니다.
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((character) => {
            const shown = character.views.filter((view) => view.url);
            // 정면이 없는 옛 캐릭터는 처음 장으로 대신한다.
            const cover = shown.find((view) => view.angle === "front") ?? shown[0];
            return (
              /*
                **작업물 카드와 같은 느낌**(2026-10-08 사용자 보고). 카드 어디를 눌러도 큰 창이 열린다 —
                전에는 그림만 눌렸고 아래 「과정 보기」 글자를 누르면 상세 페이지로 넘어가 다른 화면 같았다.
              */
              <Card
                key={character.id}
                // 키보드로도 연다. 전에는 그림이 진짜 단추라 Tab·Enter 로 열렸다(독립 리뷰).
                role="button"
                tabIndex={0}
                aria-label={`${character.name} 크게 보기`}
                className={cn("relative overflow-hidden", cover && "cursor-pointer")}
                onClick={() => { if (cover) openCharacter(character, angleLabels); }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (cover) openCharacter(character, angleLabels);
                }}
              >
                {/* 「과정 보기」는 작업물처럼 왼쪽 위 모서리 아이콘이다. 누르면 카드의 큰 창은 안 열린다. */}
                <Link
                  href={`/characters/${character.id}`}
                  aria-label={`${character.name} 과정 보기`}
                  onClick={(event) => event.stopPropagation()}
                  className={cn(CORNER_BUTTON, "group left-1.5 hover:text-foreground")}
                >
                  <ListOrdered className="size-3.5" />
                  {/* 올리는 즉시 뜨는 말풍선. 작업물 카드와 같은 모양이다(`works-tab.tsx`). */}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute left-0 top-full z-20 mt-1.5 grid w-max max-w-[9rem] gap-0.5",
                      "rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs leading-5 text-background shadow-md",
                      "opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    <b>과정 보기</b>
                    {/* 남의 캐릭터는 보기 전용이다 — 「다시 만들 수 있다」 는 내 것에만 맞는 말이다. */}
                    <span>
                      만들 때 쓴 설정과 각도를 봅니다.{character.mine === false ? "" : " 이 설정으로 다시 만들 수 있습니다."}
                    </span>
                  </span>
                </Link>
                {/* 칸은 작업물과 같은 정사각형, 그림은 잘라 내지 않는다. */}
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted p-1">
                  {cover ? (
                    <ThumbImage
                      src={(cover.thumbUrl ?? cover.url) as string}
                      alt={`${character.name} · ${angleLabels[cover.angle] ?? cover.angle}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">저장된 각도가 없습니다</span>
                  )}
                </div>
                <CardContent className="grid gap-2 p-3">
                  <p className="truncate text-sm font-bold">{character.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{KIND_LABEL[character.kind] ?? character.kind}</Badge>
                    <Badge variant="secondary">{LOOK_LABEL[character.look] ?? character.look}</Badge>
                    <Badge variant="secondary">{shown.length}장</Badge>
                    {character.mine === false ? <Badge variant="secondary">{character.ownerEmail ?? "다른 회원"}</Badge> : null}
                  </div>
                  <p className="text-meta text-subtle-foreground">{formatDate(character.createdAt)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
