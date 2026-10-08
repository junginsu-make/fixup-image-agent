"use client";

import * as React from "react";
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
}

/*
  설명은 말풍선 하나로만 보인다(2026-10-08 사용자 지시). 버튼 아래에 늘 보이던 설명 줄과
  버튼 옆 「기본」 표시는 말풍선과 겹쳐 지웠다. 말풍선은 읽히게 넓고 글자를 키웠다.
  CSS 만으로 보이고 숨긴다. absolute 라 줄 높이를 바꾸지 않는다.
*/
const TIP_CLASS =
  "pointer-events-none absolute top-full z-20 mt-1 hidden w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-background p-3 " +
  "whitespace-normal text-left text-sm leading-relaxed font-normal text-foreground shadow-lg group-hover:block group-focus-visible:block";

// 맨 끝 버튼의 말풍선은 오른쪽 끝에 붙인다 — 좁은 화면에서 왼쪽에 붙이면 화면 밖으로 나간다.
const tipClass = (last: boolean) => `${TIP_CLASS} ${last ? "right-0 left-auto" : "left-0"}`;

export function ImageModelPicker({
  value,
  onChange,
  ids = VISIBLE_IMAGE_MODEL_IDS,
  disabled,
  auto,
  legend = "그림 모델",
}: ImageModelPickerProps) {
  const uid = React.useId();
  const autoActive = auto?.active === true;

  return (
    <fieldset className="grid gap-2">
      <legend className="text-meta text-subtle-foreground">{legend}</legend>
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
            className="group relative"
          >
            {auto.label}
            <span id={`${uid}-auto`} role="tooltip" className={tipClass(ids.length === 0)}>{auto.hint}</span>
          </Button>
        ) : null}
        {ids.map((id, index) => {
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
              className="group relative"
            >
              {imageModelName(id)}
              <span id={`${uid}-${id}`} role="tooltip" className={tipClass(index === ids.length - 1)}>{imageModelSummary(id)}</span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
