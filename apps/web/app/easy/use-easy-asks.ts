"use client";

import * as React from "react";
import { pickPhoto, startPhotoAsk, type PhotoAskState } from "./photo-ask-state";
import type { CardPhotoRole, PhotoRow } from "./photo-roles";

/**
 * **물음 줄에서 화면이 들고 있는 것**(2026-10-07 2차 설계 D1 · §3-6).
 *
 * 물음은 이제 대화 줄로 남는다. 화면은 그 줄 밑에서 **고르는 중인 것**만 든다 — 비율 · 그림체
 * 토글, 사진마다 고른 쓰임, 레퍼런스 고르기. 사진 · 레퍼런스 고르기는 이 화면에서 연 것만 있다
 * (첨부 썸네일이 화면 것이라) — 다시 열면 물음 글만 보이고 말로 이어 답한다.
 *
 * `easy-client.tsx` 가 800줄 상한이라 여기로 뺐다.
 */
export interface EasyAskResponse {
  ask?: { kind?: string };
  photoAsk?: { reason: "unclear" | "people"; rows: PhotoRow[]; mode?: "image" | "cardnews" };
}

export function useEasyAsks() {
  const [ratio, setRatio] = React.useState("");
  const [look, setLook] = React.useState("");
  const [photo, setPhoto] = React.useState<{ rowId: string; state: PhotoAskState } | null>(null);
  const [referenceRowId, setReferenceRowId] = React.useState<string | null>(null);

  function close() {
    setRatio("");
    setLook("");
    setPhoto(null);
    setReferenceRowId(null);
  }

  /** 서버가 물음 줄을 돌려줬을 때. 그 자리에서 고르는 물음이면 고르기를 연다. */
  function open(rowId: string, body: EasyAskResponse) {
    close();
    if (body.ask?.kind === "photo" && body.photoAsk) {
      setPhoto({ rowId, state: startPhotoAsk("", body.photoAsk.reason, body.photoAsk.rows, body.photoAsk.mode) });
    }
    if (body.ask?.kind === "reference") setReferenceRowId(rowId);
  }

  return {
    ratio, look, photo, referenceRowId, setRatio, setLook, open, close,
    pickPhoto: (id: string, role: CardPhotoRole) =>
      setPhoto((current) => (current ? { ...current, state: pickPhoto(current.state, id, role) } : current)),
    /** 사진이 바뀌면 사진 물음의 고르기는 뜻을 잃는다(1차 Review Focus 1). 물음 글은 남는다. */
    dropPhoto: () => setPhoto(null),
  };
}

export type EasyAsks = ReturnType<typeof useEasyAsks>;
