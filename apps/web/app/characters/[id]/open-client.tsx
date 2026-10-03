"use client";

import * as React from "react";
import { CharacterStudio } from "../CharacterStudio";
import { CharacterDetailClient } from "./detail-client";
import type { OpenedCharacter } from "../opened-character";

/**
 * 라이브러리 「과정 보기」의 갈림길.
 *
 * **내 캐릭터면 도구를 그 값으로 연다** — 단계마다 보고 고쳐 새 캐릭터로 만든다
 * (2026-10-02 사용자 요구). **남의 캐릭터**(팀·관리자)는 지금의 보기 전용 화면과
 * 「내 것으로 복사」다 — 회원용 쓰기 경로를 넓히지 않는다.
 */
export function CharacterOpenClient({ characterId }: { characterId: string }) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "mine"; character: OpenedCharacter } | { kind: "other" }
  >({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!alive) return;
        setState(body?.ok && body.character?.mine === true
          ? { kind: "mine", character: body.character as OpenedCharacter }
          : { kind: "other" });
      } catch {
        if (alive) setState({ kind: "other" });
      }
    })();
    return () => { alive = false; };
  }, [characterId]);

  if (state.kind === "loading") return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (state.kind === "mine") return <CharacterStudio opened={state.character} />;
  return <CharacterDetailClient characterId={characterId} />;
}
