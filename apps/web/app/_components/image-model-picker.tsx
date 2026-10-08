"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@fixup/ui";
import { VISIBLE_IMAGE_MODEL_IDS, imageModelName, imageModelSummary } from "@fixup/shared";

export interface ImageModelPickerProps {
  /** 지금 고른 id. 숨긴 id 가 와도 된다 — 아무 버튼도 안 켜진다. */
  value: string;
  onChange: (id: string) => void;
  ids?: readonly string[];
  disabled?: boolean;
  /** 「자동」 같은 맨 앞 선택지. 캐릭터가 쓴다. */
  auto?: { label: string; hint: string; active: boolean; onPick: () => void };
  legend?: string;
  /** 화면이 따로 제목을 달면 숨긴다 — 낭독기에는 남는다. */
  legendHidden?: boolean;
}

/*
  설명은 말풍선 하나로만 보인다(2026-10-08 사용자 지시). 버튼 아래에 늘 보이던 설명 줄과
  버튼 옆 「기본」 표시는 말풍선과 겹쳐 지웠다. 말풍선은 읽히게 넓고 글자를 키웠다.

  **말풍선은 버튼 안이 아니라 화면 맨 위 층(body)에 띄운다** (2026-10-08 사용자 — 캐릭터
  만들기에서 속도형 말풍선이 왼쪽으로 펴지며 잘림). 버튼 안에 absolute 로 두면 둘러싼
  스크롤 칸이 잘라 낸다. 버튼 왼쪽 끝에서 오른쪽으로 펴고, 화면 끝에 닿을 때만 안으로 당긴다.
*/
const TIP_WIDTH = 320; // w-80
const GUTTER = 16; // max-w-[calc(100vw-2rem)] 의 한쪽
const GAP = 4;
/** 아래에 이만큼 자리가 없으면 버튼 위로 띄운다. 세 줄 설명이 들어가는 높이. */
const ROOM_BELOW = 160;

const FLOATING_CLASS =
  "pointer-events-none fixed z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-background p-3 " +
  "whitespace-normal text-left text-sm leading-relaxed font-normal text-foreground shadow-lg";

type Place = { left: number; top: number } | { left: number; bottom: number };
type Box = { left: number; top: number; bottom: number };

export function tipPosition(button: Box, view: { width: number; height: number }): Place {
  const width = Math.min(TIP_WIDTH, view.width - GUTTER * 2);
  const left = Math.max(GUTTER, Math.min(button.left, view.width - width - GUTTER));
  const above = button.bottom + GAP + ROOM_BELOW > view.height && button.top > ROOM_BELOW;
  return above ? { left, bottom: view.height - button.top + GAP } : { left, top: button.bottom + GAP };
}

type Tip = { text: string; place: Place };

function useFloatingTip() {
  const [tip, setTip] = React.useState<Tip | null>(null);
  const hide = React.useCallback(() => setTip(null), []);

  // 떠 있는 동안 화면이 움직이면 버튼과 어긋난다. 닫는다.
  React.useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  const handlers = (text: string) => {
    const show = (event: { currentTarget: { getBoundingClientRect: () => Box } }) =>
      setTip({ text, place: tipPosition(event.currentTarget.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }) });
    // 포커스로는 키보드로 옮겨 갔을 때만 띄운다. 누르거나 탭해서 생긴 포커스로 띄우면 휴대폰에서 내용을 덮고 남는다.
    const focus = (event: { currentTarget: { getBoundingClientRect: () => Box; matches: (q: string) => boolean } }) => {
      if (event.currentTarget.matches(":focus-visible")) show(event);
    };
    return { onMouseEnter: show, onFocus: focus, onMouseLeave: hide, onBlur: hide };
  };

  const floating = tip
    ? createPortal(
        <div data-testid="model-tip" aria-hidden className={FLOATING_CLASS} style={tip.place}>{tip.text}</div>,
        document.body,
      )
    : null;

  return { handlers, floating };
}

export function ImageModelPicker({
  value,
  onChange,
  ids = VISIBLE_IMAGE_MODEL_IDS,
  disabled,
  auto,
  legend = "그림 모델",
  legendHidden,
}: ImageModelPickerProps) {
  const uid = React.useId();
  const autoActive = auto?.active === true;
  const { handlers, floating } = useFloatingTip();

  return (
    <fieldset className="grid gap-2">
      <legend className={legendHidden ? "sr-only" : "text-meta text-subtle-foreground"}>{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {auto ? (
          <Button
            type="button"
            size="sm"
            role="radio"
            aria-checked={autoActive}
            aria-describedby={`${uid}-auto`}
            variant={autoActive ? "default" : "secondary"}
            disabled={disabled}
            onClick={auto.onPick}
            {...handlers(auto.hint)}
          >
            {auto.label}
            {/* 낭독기가 읽는 설명. 눈에 보이는 말풍선은 아래 floating 이다. */}
            <span id={`${uid}-auto`} role="tooltip" className="hidden">{auto.hint}</span>
          </Button>
        ) : null}
        {ids.map((id) => {
          const checked = !autoActive && id === value;
          return (
            <Button
              key={id}
              type="button"
              size="sm"
              role="radio"
              aria-checked={checked}
              aria-describedby={`${uid}-${id}`}
              variant={checked ? "default" : "secondary"}
              disabled={disabled}
              onClick={() => onChange(id)}
              {...handlers(imageModelSummary(id))}
            >
              {imageModelName(id)}
              <span id={`${uid}-${id}`} role="tooltip" className="hidden">{imageModelSummary(id)}</span>
            </Button>
          );
        })}
      </div>
      {floating}
    </fieldset>
  );
}
