"use client";

import * as React from "react";
import { EasyImageWorking } from "./message";

/**
 * 오른쪽 **결과 칸** — 이 대화에서 만든 것만 모은다.
 *
 * ── 어디서 왔나 ──────────────────────────────────────────────
 *
 * 2026-09-02 첫 기획은 **4분할**이었다 — 메뉴 · 대화 · 작업판 · 결과.
 * Easy 설계(9/17)가 그것을 뺐는데, 뺀 것은 **작업판**이다. 「옆에 칸이 열한 개
 * 있으면 사용자는 결국 그것을 보고, 그러면 쉬워지지 않는다」가 그 까닭이다.
 *
 * **결과 칸은 그 까닭에 안 걸린다.** 고칠 칸이 없고 보여 주기만 한다.
 *
 * ── 한 장에서 전부로 ────────────────────────────────────────
 *
 * 되살릴 때는 **마지막 한 장**만 걸었다(2026-09-18). 그러면 대화에 이미 있는 그
 * 그림이 옆에 한 번 더 뜰 뿐이라 자리를 두 배로 쓰고 아무것도 더 알려 주지
 * 않는다 — 사용자가 그대로 짚었다(2026-09-21, 「그냥 오른쪽과 중복이 되니까…
 * 결과 섹션은 딱 결과물만 모아서 보이는거죠」).
 *
 * 이제 칸이 서로 다른 일을 한다.
 *
 *   왼쪽   오가는 **말**. 그림은 그 말의 한 줄로 끼어 있다
 *   오른쪽  만든 **것**. 대화가 길어져도 결과만 훑고, 여러 장을 견준다
 *
 * ── 새것이 위다 ─────────────────────────────────────────────
 *
 * 대화는 위에서 아래로 쌓이지만 여기는 뒤집는다. 방금 만든 것을 **굴리지 않고**
 * 보는 것이 이 칸을 되살린 까닭이었다(2026-09-18). 차례는 번호로 말한다.
 */

export interface EasyResult {
  id: string;
  url: string;
}

export function EasyResultPanel({
  images,
  width,
  working,
  onOpen,
}: {
  /** 이 대화에서 만든 것 전부. 대화 차례대로 온다. */
  images: readonly EasyResult[];
  /**
   * 끌어서 정한 너비. `null` 이면 아직 안 쟀다는 뜻이라 기본 너비로 둔다 —
   * 서버가 그린 것과 같아야 화면이 한 번 튀지 않는다(`split-handle.tsx`).
   */
  width: number | null;
  /**
   * 지금 이미지를 만드는 중인가.
   *
   * **여기도 알려 줘야 한다**(2026-09-21 사용자 — 「이미지 생성 중에도 생성
   * 중이라는 표시를 정확히 알 수 있게」). 결과가 앉을 자리가 여기인데, 만드는
   * 동안 「만들면 여기에 나옵니다」가 그대로면 **아무 일도 안 하는 것처럼**
   * 보인다.
   */
  working?: boolean;
  /** 몇 번째를 눌렀나. 대화 차례 기준이다 — 화면이 뒤집어 그려도 번호는 안 바뀐다. */
  onOpen: (at: number) => void;
}) {
  return (
    /*
      **처음 너비를 CSS 가 먼저 맞춘다.**

      `width` 는 붙고 나서 한 번 재야 나온다(`split-handle.tsx`). 그동안 쓰는
      값이 재고 난 값과 다르면 화면이 한 번 튄다 — 기본값이 352 에서 상한으로
      올라가면서(2026-09-21) 그 튐이 눈에 띄게 커졌다.

      그래서 `split.ts` 의 규칙을 **클래스로 한 번 더 적는다.**

        w-[45rem]                 RESULT_MAX 720px
        max-w-[calc(100%-448px)]  CHAT_MIN 440 + 구분선 8 을 대화 쪽에 남긴다

      `clampResultWidth(available, RESULT_MAX)` 와 같은 값이 나온다. 두 벌이
      되는 값이라 `__tests__/shell-wiring.test.ts` 가 둘을 묶어 둔다.
    */
    <aside
      style={width === null ? undefined : { width }}
      className="hidden w-[45rem] max-w-[calc(100%-448px)] shrink-0 flex-col lg:flex"
    >
      <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="text-meta text-subtle-foreground">결과</span>
        {images.length ? (
          <span className="text-meta tabular-nums text-subtle-foreground">{images.length}</span>
        ) : null}
      </div>

      {/*
        **크게 보기·내려받기 단추를 머리에 안 둔다.** 한 장일 때는 「그 한 장」을
        가리켰지만 여러 장이 되면 **어느 장인지 말할 수 없다.** 누를 것은 그림
        자체이고, 크게 보기 창이 내려받기까지 갖고 있다.
      */}
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pb-4">
        {working ? <EasyImageWorking className="w-full" /> : null}

        {images.length ? (
          // 새것이 위다. 번호는 **만든 차례**라 뒤집어도 1번이 첫 장이다.
          [...images].reverse().map((image, 뒤에서) => {
            const at = images.length - 1 - 뒤에서;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => onOpen(at)}
                className="group relative block w-full overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={`만든 이미지 ${at + 1}`} className="block w-full" />
                {/*
                  여러 장이면 몇 번째인지 말한다. 한 장뿐일 때는 셀 것이 없어
                  번호가 오히려 묻는다 — 「1 은 무엇에 견준 1 인가」.
                */}
                {images.length > 1 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-meta tabular-nums text-subtle-foreground">
                    {at + 1}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : working ? null : (
          /*
            **빈 칸에도 말을 적는다.** 아무것도 없으면 고장인 줄 안다.
          */
          <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border text-meta text-subtle-foreground">
            만들면 여기에 나옵니다
          </div>
        )}
      </div>
    </aside>
  );
}
