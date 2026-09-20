"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import { Badge, Button, cn } from "@fixup/ui";
import { CharacterPickerButton, type PickableCharacter } from "../_components/character-picker";
import {
  chosenViews,
  describeCharacterChoice,
  isAutoChoice,
  pickedFrom,
} from "../_components/character-choice";
import { AUTO_ANGLE_HINT } from "./auto-angle-hint";
import { characterAngleLabel } from "../../lib/character-library";
import Link from "next/link";

/**
 * 이 페이지에 등장할 인물과 **쓸 장면**을 고른다.
 *
 * 예전에는 캐릭터 이름만 골랐고, 어느 각도가 가는지는 서버가 낱말을 대조해
 * 혼자 정했다. 그래서 정면·옆·뒷모습을 넉 장 만들어 둬도 화면에서는 무엇이
 * 쓰이는지 볼 수 없었고, 특정 장면을 쓰고 싶어도 길이 없었다
 * (2026-09-15 사용자 보고).
 *
 * 지금은 **카드뉴스·포스터와 같은 모달**을 쓴다 — 같은 것을 두 곳에서 다르게
 * 그리면 만든 사람이 자기 캐릭터를 못 알아본다. 대신 여기에만 「자동으로
 * 맡기기」가 붙는다. 섹션마다 각도를 고르는 그 자동이 실제로 쓸 만하고,
 * 매번 손으로 고르는 것은 성가시기 때문이다.
 *
 * **다만 그것이 판단인 척하지 않는다**(U-05). 자동은 낱말 대조이고 아무것도 안
 * 걸리면 한 각도로 굳는다. 「읽어서 어울리는 것을 고른다」고 말하면 사용자는
 * AI 가 봤다고 믿고 **왜 이 각도인지 물을 생각을 못 한다.**
 *
 * 무엇이 쓰이는지는 **그림으로** 보여준다. 여기는 그림을 붙이는 화면이 아니라
 * 이름표만 넘기는 화면이라, 말해 주지 않으면 알 길이 없다.
 */

interface CharacterPickerProps {
  selectedId?: string;
  /** 고른 각도. 비어 있으면 자동 — 섹션에 맞춰 서버가 고른다. */
  angles: string[];
  onSelect: (id: string | undefined, angles: string[]) => void;
  /**
   * 지금은 쓰이지 않는 이유. 있으면 고른 캐릭터 줄에 그 이유를 적는다.
   *
   * 엔진은 인물을 하나만 쓴다 — 올린 사진이 있으면 캐릭터를 무시한다
   * (`pdp.service.ts`). 화면이 조용하면 사용자는 캐릭터가 쓰인다고 읽는다.
   */
  ignoredReason?: string;
}

export function CharacterPicker({
  selectedId,
  angles,
  onSelect,
  ignoredReason,
}: CharacterPickerProps) {
  const [characters, setCharacters] = useState<PickableCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * 목록을 못 불러왔는가(A-14).
   *
   * 전에는 실패해도 **빈 목록**이 됐다. 고른 캐릭터를 그 목록에서 찾으므로
   * 아무것도 안 골라진 것처럼 보이는데, `selectedId` 는 그대로 남아 생성
   * 요청에 실려 나간다 — 사용자는 캐릭터가 안 쓰인다고 믿고 진행한다.
   */
  const [failed, setFailed] = useState(false);

  /**
   * 다시 불러오는 중인가.
   *
   * `failed` 를 먼저 지우면 응답이 오기 전까지 문구가 「지워졌거나」로 뒤집힌다
   * — 둘을 구분하겠다고 만든 말이 바로 그 순간 거짓말을 한다.
   */
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setReloading(true);
    try {
      const response = await fetch("/api/characters", { cache: "no-store" });
      const body = (await response.json()) as { ok?: boolean; characters?: PickableCharacter[] };
      setFailed(!body.ok);
      setCharacters(body.ok ? body.characters ?? [] : []);
    } catch {
      setFailed(true);
      setCharacters([]);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;

  const selected = characters.find((character) => character.id === selectedId);
  const shown = selected ? chosenViews(angles, selected.views) : [];
  /*
    **고른 것이 있는데 못 찾았다.** 목록을 못 불러왔거나, 그 캐릭터가 지워진
    경우다. 둘 다 사용자가 알아야 한다 — 값은 살아서 생성까지 간다.
  */
  const missing = Boolean(selectedId) && !selected;

  return (
    <>
      {missing ? (
        <div className="mb-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
          <p className="font-bold">고른 캐릭터를 불러오지 못했습니다</p>
          <p className="mt-0.5 text-muted-foreground">
            {reloading
              ? "다시 불러오는 중입니다."
              : failed
                ? "캐릭터 목록을 가져오지 못했습니다. 이대로 만들면 캐릭터가 안 나올 수 있습니다."
                : "고른 캐릭터가 지워졌거나 접근할 수 없습니다. 이대로 만들면 캐릭터가 안 나올 수 있습니다."}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              다시 불러오기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onSelect(undefined, [])}
            >
              캐릭터 빼기
            </Button>
          </div>
        </div>
      ) : null}
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
            onClick={() => onSelect(undefined, [])}
          >
            <X size={14} className="mr-1.5" />
            삭제
          </Button>

          {/*
            **쓰이는 장면을 그림으로 보여준다.** 이름만 적으면 넉 장을 만들어
            두고도 어느 장이 가는지 모른다 — 그것이 이 화면의 원래 문제였다.
            자동일 때는 후보 전부가 흐리게 보이고, 고른 것이 있으면 그것만 또렷하게
            보인다. 흐림이 「이 중 하나가 섹션마다 골라진다」는 뜻이다.
          */}
          <div className="flex w-full flex-wrap items-center gap-1.5">
            {shown.map((view) => (
              <span
                key={view.angle}
                className={cn(
                  "overflow-hidden rounded border",
                  isAutoChoice(angles) ? "border-border opacity-60" : "border-primary/40",
                )}
                title={characterAngleLabel(view.angle)}
              >
                {view.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={characterAngleLabel(view.angle)}
                    src={view.url}
                    className="size-10 object-cover"
                  />
                ) : null}
              </span>
            ))}
            <span className="text-xs text-muted-foreground">
              {describeCharacterChoice(angles, selected.views, characterAngleLabel)}
            </span>
          </div>

          {ignoredReason ? <p className="w-full text-xs text-warning">{ignoredReason}</p> : null}
        </div>
      ) : null}

      {/*
        만든 캐릭터가 없으면 고를 것이 없다. 왜 필요한지 한 줄로만 알린다.

        **못 가져온 것과 없는 것은 다르다**(A-14). 목록을 못 가져왔는데
        「캐릭터를 만들어 두면」이라고 하면, 이미 만들어 둔 사용자에게 거짓말이다.
      */}
      {failed ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>캐릭터 목록을 가져오지 못했습니다.</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            다시 불러오기
          </Button>
        </div>
      ) : characters.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          사람이 나오면 섹션마다 다른 사람이 됩니다.{" "}
          <Link
            href="/characters"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            캐릭터를 만들어 두면
          </Link>{" "}
          같은 사람이 계속 나옵니다.
        </p>
      ) : (
        <CharacterPickerButton
          characters={characters}
          angleLabel={characterAngleLabel}
          onReload={() => void load()}
          label={selected ? "캐릭터 바꾸기" : "캐릭터 고르기"}
          description="만들어 둔 캐릭터를 눌러 이 페이지에 쓸 장면을 고릅니다."
          autoLabel="자동으로 맡기기"
          autoHint={AUTO_ANGLE_HINT}
          onPick={(pick) => onSelect(pick.character.id, pickedFrom(pick))}
        />
      )}
    </>
  );
}
