"use client";

import { useEffect, useRef, useState } from "react";
import {
  blobToFront, carriedNote, carryRequest, frontViewUrl, madeFromOpenedFront, nameAfterSave, openedValues,
  type OpenedCharacter, type OpenedFront, type OpenedValues,
} from "./opened-character";

export type OpenedFrontState = "idle" | "loading" | "loaded" | "missing";

interface Input {
  opened: OpenedCharacter | undefined;
  kinds: ReadonlyArray<{ id: string }>;
  looks: readonly string[];
  /**
   * 이미 있는 캐릭터 이름. **`null` 이면 목록을 아직 못 받은 것이다** — 그동안은 채우지
   * 않는다(이름이 겹칠 수 있다). 받은 뒤에는 한 번만 채우므로 매번 새 배열이어도 된다.
   */
  takenNames: readonly string[] | null;
  /** 칸과 고른 정면을 채운다. **한 번만** 부른다. 바뀌지 않는 함수를 넘긴다. */
  prefill: (values: OpenedValues, front: OpenedFront | null) => void;
  chosenBase64: string | null;
  createdId: string | null;
  /** 스튜디오 이름 칸의 지금 값. 저장 직후 그대로인지 보려고 읽는다. */
  currentName: string;
  /** 방금 만들어진 캐릭터의 이름. 아직 모르면 `null`. */
  createdName: string | null;
  /** 이름 칸을 바꾼다. 같은 이름이 또 저장되지 않게 한다. 바뀌지 않는 함수를 넘긴다. */
  rename: (name: string) => void;
  /** 옮겨 담은 뒤 목록과 결과를 새로 받는다. 바뀌지 않는 함수를 넘긴다. */
  onCarried: (createdId: string) => Promise<void>;
  /** 결과 자리에 한 줄 덧붙인다. */
  announce: (text: string) => void;
}

interface CarryBody {
  ok?: boolean;
  carried?: string[];
  failed?: string[];
  referenceIssue?: string;
  message?: string;
}

/**
 * 「과정 보기」로 연 캐릭터를 도구에 채우고, 원래 정면 그대로 저장된 새
 * 캐릭터에 원본의 나머지 각도를 옮겨 담는다.
 *
 * **처음 만들기 함수는 건드리지 않는다**(사용자 지시 2026-09-29). 저장은 기존
 * `handleCreate` 가 하고, 여기서는 그 결과(`createdId`)를 보고 뒤따른다.
 */
export function useOpenedCharacter(input: Input): { front: OpenedFrontState } {
  const { opened, kinds, looks, takenNames, prefill, chosenBase64, createdId, onCarried, announce } = input;
  const { currentName, createdName, rename } = input;
  const [front, setFront] = useState<OpenedFrontState>(opened ? "loading" : "idle");
  const openedFront = useRef<string | null>(null);
  const lastChosen = useRef<string | null>(null);
  const handled = useRef<ReadonlySet<string>>(new Set());
  // 목록은 매번 새 배열이다. 효과가 그것에 매이면 채운 칸을 다시 덮어쓴다 — 읽기만 한다.
  const taken = useRef<readonly string[]>([]);
  const prefilledFor = useRef<string | null>(null);
  const listReady = takenNames !== null;

  useEffect(() => {
    taken.current = takenNames ?? [];
  }, [takenNames]);

  useEffect(() => {
    if (!opened || !listReady || prefilledFor.current === opened.id) return;
    let alive = true;
    void (async () => {
      const loaded = await loadFront(frontViewUrl(opened));
      if (!alive) return;
      // 실제로 채운 뒤에 표시한다 — 개발 모드의 정리·재실행이 첫 실행을 버려도 한 번은 채운다.
      prefilledFor.current = opened.id;
      openedFront.current = loaded?.base64 ?? null;
      prefill(openedValues(opened, kinds, looks, taken.current), loaded);
      setFront(loaded ? "loaded" : "missing");
    })();
    return () => { alive = false; };
  }, [opened, listReady, kinds, looks, prefill]);

  // 저장 직후 `chosen` 은 비워진다. 그 전에 마지막으로 고른 정면을 기억한다.
  useEffect(() => {
    if (chosenBase64) lastChosen.current = chosenBase64;
  }, [chosenBase64]);

  useEffect(() => {
    if (!opened || !createdId || createdId === opened.id || handled.current.has(createdId)) return;
    handled.current = new Set([...handled.current, createdId]);
    // 옮겨 담든 아니든 — 정면을 다시 뽑아 저장해도 이름 칸은 그대로 남는다.
    const next = nameAfterSave(currentName, createdName, taken.current);
    if (next) rename(next);
    if (!madeFromOpenedFront(lastChosen.current, openedFront.current)) return;
    void carry(opened.id, createdId, onCarried, announce);
  }, [opened, createdId, currentName, createdName, rename, onCarried, announce]);

  return { front };
}

async function loadFront(url: string | null): Promise<OpenedFront | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    return response.ok ? await blobToFront(await response.blob()) : null;
  } catch {
    return null;
  }
}

const CARRY_FAILED = "원래 캐릭터의 각도를 옮겨 담지 못했습니다.";

async function carry(
  fromId: string,
  createdId: string,
  onCarried: (createdId: string) => Promise<void>,
  announce: (text: string) => void,
) {
  try {
    const response = await fetch(`/api/characters/${encodeURIComponent(createdId)}/carry`, carryRequest(fromId));
    const body = await response.json().catch(() => null) as CarryBody | null;
    if (!body?.ok) {
      announce(body?.message ?? CARRY_FAILED);
      return;
    }
    await onCarried(createdId);
    const note = carriedNote(body.carried?.length ?? 0, body.failed?.length ?? 0);
    if (note) announce(note);
    if (body.referenceIssue) announce(body.referenceIssue);
  } catch {
    // 연결 오류의 원문(「Failed to fetch」 등)은 사용자에게 내보이지 않는다.
    announce(CARRY_FAILED);
  }
}
