"use client";

import * as React from "react";
import { Check, Layers, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";
import {
  canAttach,
  defaultPicked,
  frontView,
  pickSummary,
  pickableViews,
  toggleAngle,
} from "./character-pick";

/**
 * 만들어 둔 캐릭터에서 **붙일 각도를 골라** 가져온다.
 *
 * 라이브러리 모달 안에 칸으로 두었더니 층이 쌓여 무엇을 누르는 자리인지
 * 안 보였다(2026-09-15 사용자 보고). 고르는 방식 자체가 다르기 때문이다 —
 * 라이브러리는 낱장 격자, 캐릭터는 묶음을 펼쳐 그 안에서 고른다.
 *
 * 카드 모양은 **캐릭터 만들기 화면과 같게** 한다. 같은 것을 두 곳에서 다르게
 * 그리면 만든 사람이 자기 캐릭터를 못 알아본다.
 */

export interface CharacterPickView {
  angle: string;
  url: string | null;
}

export interface PickableCharacter {
  id: string;
  name: string;
  views: CharacterPickView[];
}

/** 고른 결과. 캐릭터 하나와 그 안에서 고른 각도들이다. */
export interface CharacterPick {
  character: PickableCharacter;
  angles: string[];
  /**
   * 「자동으로 맡기기」를 눌렀는가 — **상세페이지·리디자인에만** 있는 갈래다.
   *
   * 거기는 섹션 설명을 읽어 각도를 고르는 자동이 이미 돌고 있고, 그것이 쓸 만하다.
   * 없앨 이유가 없어서 남기고, 직접 고르는 길을 옆에 낸다. 카드뉴스·포스터에는
   * 섹션이 없어 자동도 없으므로 늘 거짓이다.
   */
  auto: boolean;
}

export function CharacterPickerButton({
  characters,
  loading = false,
  angleLabel,
  onPick,
  onReload,
  label = "캐릭터 불러오기",
  description,
  autoLabel,
  autoHint,
}: {
  characters: PickableCharacter[];
  loading?: boolean;
  /** 각도 이름을 사람 말로. 안 넘기면 저장된 이름을 그대로 쓴다. */
  angleLabel?: (angle: string) => string;
  onPick(pick: CharacterPick): void;
  onReload?(): void;
  label?: string;
  description?: string;
  /**
   * 「자동으로 맡기기」 단추의 말. **넘길 때만 그 단추가 생긴다.**
   *
   * 상세페이지·리디자인은 섹션 설명을 읽어 각도를 고르는 자동이 이미 돌고 있다.
   * 카드뉴스·포스터에는 섹션이 없어 자동이 없다 — 거기에 이 단추를 보이면 누르고
   * 아무 일도 안 일어난다.
   */
  autoLabel?: string;
  autoHint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [openedId, setOpenedId] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);

  const opened = characters.find((character) => character.id === openedId) ?? null;
  // 자동이 함께 있는 화면에서는 「붙인다」가 아니라 「이것만 쓴다」가 맞다.
  const attachText = autoLabel ? "고른 장면만 씁니다" : "이 장면들을 붙입니다";
  const labelOf = (angle: string) => angleLabel?.(angle) ?? angle;

  /* 열 때마다 처음으로 돌린다. 지난번에 고른 것이 남아 있으면 모르고 붙인다. */
  React.useEffect(() => {
    if (open) return;
    setOpenedId(null);
    setPicked([]);
  }, [open]);

  const openCharacter = (character: PickableCharacter) => {
    setOpenedId(character.id);
    setPicked(defaultPicked(character.views));
  };

  const attach = () => {
    if (!opened || !canAttach(picked)) return;
    onPick({ character: opened, angles: picked, auto: false });
    setOpen(false);
  };

  const attachAuto = () => {
    if (!opened) return;
    onPick({ character: opened, angles: [], auto: true });
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => { setOpen(true); onReload?.(); }}>
        <UserRound className="mr-2 size-4" />
        {label}
        {characters.length ? (
          <Badge variant="secondary" className="ml-1">{characters.length}</Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{opened ? opened.name : "캐릭터 불러오기"}</DialogTitle>
            <DialogDescription>
              {opened
                ? "붙일 장면을 고르세요. 고른 장이 모두 같은 인물 기준으로 들어갑니다."
                : description ?? "만들어 둔 캐릭터를 눌러 장면을 고릅니다."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중입니다.</p>
          ) : characters.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              만들어 둔 캐릭터가 없습니다.{" "}
              <a href="/characters" className="font-medium text-primary underline-offset-2 hover:underline">
                캐릭터 만들기
              </a>
              에서 먼저 만들어 주세요.
            </p>
          ) : opened ? (
            <AngleGrid
              character={opened}
              picked={picked}
              labelOf={labelOf}
              onToggle={(angle) => setPicked((current) => toggleAngle(current, angle, opened.views))}
            />
          ) : (
            <CharacterGrid characters={characters} onOpen={openCharacter} />
          )}

          {opened ? (
            <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">
                {pickSummary(picked, opened.views)}
                {/* 자동이 있는 화면에서는 그것이 무엇인지 여기서 한 번 말한다. */}
                {autoHint ? (
                  <span className="mt-0.5 block text-[11px] text-subtle-foreground">{autoHint}</span>
                ) : null}
              </span>
              <span className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpenedId(null)}>
                  다른 캐릭터
                </Button>
                {autoLabel ? (
                  <Button type="button" variant="outline" onClick={attachAuto}>
                    {autoLabel}
                  </Button>
                ) : null}
                <Button type="button" onClick={attach} disabled={!canAttach(picked)}>
                  {canAttach(picked) ? attachText : "장면을 고르세요"}
                </Button>
              </span>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 캐릭터 목록.
 *
 * 대표는 정면 한 장이고, **다른 장면이 있는지**를 우하단 딱지 하나가 말한다 —
 * 캐릭터 만들기 화면과 같은 자리, 같은 모양이다.
 */
function CharacterGrid({
  characters,
  onOpen,
}: {
  characters: PickableCharacter[];
  onOpen(character: PickableCharacter): void;
}) {
  return (
    <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
      {characters.map((character) => {
        const front = frontView(character.views);
        const count = pickableViews(character.views).length;

        return (
          <button
            key={character.id}
            type="button"
            onClick={() => onOpen(character)}
            className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary"
          >
            <span className="relative block bg-muted">
              {front?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={front.url} className="aspect-[3/4] w-full object-cover" />
              ) : (
                <span className="grid aspect-[3/4] place-items-center px-2 text-center text-xs text-subtle-foreground">
                  그림을 못 불러왔습니다
                </span>
              )}

              {count > 1 ? (
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-[var(--shadow-ring)]">
                  <Layers className="size-3" />
                  {count}장
                </span>
              ) : (
                <span className="absolute bottom-2 right-2 rounded-full border border-border bg-background/90 px-2 py-0.5 text-[11px] text-subtle-foreground shadow-[var(--shadow-ring)]">
                  정면만
                </span>
              )}
            </span>

            <span className="truncate p-2 text-sm font-bold">{character.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 펼친 캐릭터의 장면들. 눌러서 켜고 끈다. */
function AngleGrid({
  character,
  picked,
  labelOf,
  onToggle,
}: {
  character: PickableCharacter;
  picked: string[];
  labelOf(angle: string): string;
  onToggle(angle: string): void;
}) {
  return (
    <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 md:grid-cols-4">
      {pickableViews(character.views).map((view) => {
        const on = picked.includes(view.angle);

        return (
          <button
            key={view.angle}
            type="button"
            onClick={() => onToggle(view.angle)}
            aria-pressed={on}
            aria-label={`${labelOf(view.angle)} ${on ? "빼기" : "고르기"}`}
            className={cn(
              // 고른 것은 **멀리서도 보여야 한다.** 테두리 하나로는 격자 안에서
              // 눈에 안 띈다 — 라이브러리 격자와 같은 규칙이다.
              "relative block overflow-hidden rounded-lg border-2 text-left transition-colors",
              on ? "border-primary bg-primary-soft ring-2 ring-primary/40" : "border-transparent hover:border-muted-foreground/40",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={view.url as string} className="aspect-[3/4] w-full object-cover" />

            {on ? (
              <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-ring)]">
                <Check className="size-3.5" />
              </span>
            ) : null}

            <span className="block truncate px-2 py-1.5 text-xs font-medium">
              {labelOf(view.angle)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
