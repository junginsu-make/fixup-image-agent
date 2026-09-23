"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { EasyLibraryPicker, type EasyLibrary } from "./library-attach";

/**
 * 첫 화면의 세 갈래 — **직접 첨부 · 라이브러리에서 · 없이 시작** (설계 §3).
 *
 * **한 번만 묻는다.** 되묻지 않는 것이 이 모드의 뜻이다(설계 §6).
 *
 * ── 이미지 만들기와 **같은 길로** 불러온다 ────────────────────
 *
 * 처음에는 `/api/reference-images` 를 눌렀을 때 불렀는데 둘이 어긋났다
 * (2026-09-18 사용자 보고).
 *
 *   ① 창을 열어도 비어 있고 **새로고침을 눌러야** 목록이 왔다
 *   ② 새로고침해도 **그림이 하나도 안 보였다**
 *
 * ②의 까닭은 응답 모양이다. 그 라우트는 `{ images }` 가 아니라 **`{ references }`**
 * 로 준다. `body.images` 를 읽으니 늘 빈 배열이었고, 새로고침이 화면을 다시
 * 그려 「불러온 것처럼」 보였을 뿐이다.
 *
 * `/api/poster/references` 로 옮긴다. 이미지 만들기(02)가 쓰는 그 라우트다 —
 * **같은 그림이 같은 모양으로** 온다. 사본(`thumbUrl`)과 주인 표시(`mine`)도
 * 함께 오는데, 사본이 없으면 창 하나에 수십 MB 가 오간다.
 */

interface Picked {
  id: string;
  url: string;
  title: string;
}

export function EasyAttachChoice({
  library,
  selectedIds,
  onUpload,
  onPick,
  onSkip,
}: {
  /** 목록은 화면이 한 번만 읽어 입력창의 폴더 단추와 나눠 쓴다. */
  library: EasyLibrary;
  selectedIds: string[];
  onUpload: () => void;
  onPick: (picked: Picked[]) => void;
  onSkip: () => void;
}) {
  return (
    /*
      **무게를 셋으로 가른다**(2026-09-21 사용자 — 「꼭 해야 하는거라면 더 눈에
      띄게 하고 없이 시작은 다른 버튼색으로 구분하세요」).

      한 번은 셋 다 `ghost`·`secondary` 로 흩어져 있어 **밝은 화면에서 안
      보였고**, 그래서 셋 다 `outline` 으로 맞췄다. 이번에는 반대 문제다 —
      셋이 똑같이 생겨서 **무엇이 다음 걸음인지** 알 수 없다.

        직접 첨부       채운 색. 여기가 본 길이다
        라이브러리에서   옅게 채운 색. 같은 길의 다른 문
        없이 시작       테두리만. **붙이지 않고 지나가는 길**이라 색이 다르다

      크기도 키운다. 첫 화면에서 처음 마주치는 단추라 작으면 안내문처럼 보인다.
    */
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button onClick={onUpload}>
        직접 첨부
      </Button>

      {/*
        **고른 것을 곧바로 붙인다.** 이 창은 `onToggle` 로 한 장씩 알려 주므로
        「고르기」와 「닫기」를 따로 기다리지 않는다.
      */}
      <EasyLibraryPicker library={library} selectedIds={selectedIds} onPick={onPick} label="라이브러리에서" />

      <Button variant="outline" onClick={onSkip}>
        없이 시작
      </Button>
    </div>
  );
}
