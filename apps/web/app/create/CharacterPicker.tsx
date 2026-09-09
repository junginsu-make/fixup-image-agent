"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@fixup/ui";

/**
 * 저장해 둔 캐릭터에서 이 페이지에 등장할 인물을 고른다.
 *
 * **버튼을 눌러 패널을 여는 방식이다.** 예전에는 캐릭터 목록이 칸 안에 늘 펼쳐져
 * 있었다. 그래서 사진을 골라 붙였는데도 캐릭터 썸네일이 더 크게 보여
 * "고정해 둔 캐릭터가 쓰인다"고 읽혔다 — 실제로는 사진이 우선이라 안 쓰인다.
 *
 * 지금은 디자인 레퍼런스 칸과 같다: 고르는 일은 버튼 안에 접어 두고, 칸 안에는
 * **무엇이 반영 중인지 이름으로** 보여준다. 삭제도 그 줄에서 한다.
 */

interface CharacterOption {
  id: string;
  name: string;
  views: Array<{ angle: string; url: string | null }>;
}

interface CharacterPickerProps {
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  /**
   * 지금은 쓰이지 않는 이유. 있으면 고른 캐릭터 줄에 그 이유를 적는다.
   *
   * 엔진은 인물을 하나만 쓴다 — 올린 사진이 있으면 캐릭터를 무시한다
   * (`pdp.service.ts`). 화면이 조용하면 사용자는 캐릭터가 쓰인다고 읽는다.
   */
  ignoredReason?: string;
}

export function CharacterPicker({ selectedId, onSelect, ignoredReason }: CharacterPickerProps) {
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/characters", { cache: "no-store" });
      const body = (await response.json()) as { ok?: boolean; characters?: CharacterOption[] };
      setCharacters(body.ok ? body.characters ?? [] : []);
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 모달을 여는 동안 다른 창에서 캐릭터를 만들었을 수 있다. 열 때마다 다시
  // 읽는다 — 디자인 레퍼런스 쪽(`SavedImagePicker`)과 같은 규칙이다.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (loading) return null;

  const selected = characters.find((character) => character.id === selectedId);

  return (
    <>
      {/*
        고른 캐릭터는 사진·레퍼런스와 같은 모양의 줄로 보여준다.
        쓰이지 않을 때는 강조 배경을 빼고 이유를 적는다 — 색까지 같으면
        쓰이는 것과 구분이 안 된다.
      */}
      {selected ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
            ignoredReason ? "border-border bg-muted/40" : "border-primary/25 bg-primary-soft/40",
          )}
        >
          <UserRound
            size={14}
            className={cn("flex-none", ignoredReason ? "text-muted-foreground" : "text-primary")}
          />
          <span className="min-w-0 flex-1 truncate font-medium">캐릭터 · {selected.name}</span>
          {ignoredReason ? <Badge variant="secondary">안 쓰임</Badge> : null}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onSelect(undefined)}
          >
            <X size={14} className="mr-1.5" />
            삭제
          </Button>
          {ignoredReason ? <p className="w-full text-xs text-warning">{ignoredReason}</p> : null}
        </div>
      ) : null}

      {/* 만든 캐릭터가 없으면 고를 것이 없다. 왜 필요한지 한 줄로만 알린다. */}
      {characters.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          사람이 나오면 섹션마다 다른 사람이 됩니다.{" "}
          <a href="/characters" className="font-medium text-primary underline-offset-2 hover:underline">
            캐릭터를 만들어 두면
          </a>{" "}
          같은 사람이 계속 나옵니다.
        </p>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <UserRound size={14} className="mr-1.5" />
            다각도 캐릭터 고르기
          </Button>

          {/*
            **모달로 연다.** 격자를 칸 안에 펼치면 인물·레퍼런스 칸이 동시에
            길어져 아래 설정이 화면 밖으로 밀린다. 이미지 만들기가 먼저 같은
            이유로 모달이 됐다(`_components/library-picker.tsx`).
          */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>다각도 캐릭터 고르기</DialogTitle>
                <DialogDescription>
                  만들어 둔 캐릭터 {characters.length}명 · 섹션 구성에 맞는 각도(정면·45도·뒷모습)가 자동으로 들어갑니다
                </DialogDescription>
              </DialogHeader>

          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
            {characters.map((character) => {
              const cover =
                character.views.find((view) => view.angle === "front") ?? character.views[0];
              const active = selectedId === character.id;
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    onSelect(character.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-md bg-muted text-left transition-opacity hover:opacity-90",
                    active ? "shadow-[0_0_0_2px_var(--primary-ring)]" : "",
                  )}
                >
                  {cover?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={character.name} src={cover.url} className="h-full w-full object-cover" />
                  ) : null}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-1 text-meta backdrop-blur">
                    {character.name}
                  </span>
                </button>
              );
            })}
          </div>

            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
