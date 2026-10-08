"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@fixup/ui";
import { imageModelName, textModelChoices, type TextModelChoice } from "@fixup/shared";
import { ImageModelPicker } from "../../_components/image-model-picker";

/**
 * 입력창 위의 드롭다운 둘 — **글 모델**과 **그림 모델** (설계 §7).
 *
 * ── 그림 모델은 다른 화면과 같은 이름을 쓴다 ─────────────────
 *
 * 표준형·디테일형·속도형이다(2026-10-08). 글 모델만 진짜 이름을 낸다
 * (설계 §5-1, `model-name.test.ts` 의 예외 목록).
 *
 * ── 값을 옆에 적는다 ─────────────────────────────────────────
 *
 * 글 모델은 가장 싼 것과 가장 비싼 것이 **다섯 배** 벌어진다. 그림값과 달리
 * 고르는 사람이 그 차이를 모른다 — 그래서 각 줄에 값을 적는다.
 *
 * 채팅은 빠른 대신 **돌이킬 수 없다.** 누르기 전에 아는 것이 누른 뒤에 아는
 * 것보다 낫다(설계 §5-2).
 */

export interface ImageModelChoice {
  id: string;
  /** 드롭다운에 보이는 이름 — 다른 화면과 같은 한국어 이름(표준형·디테일형·속도형). */
  label: string;
}

function TextModelMenu({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const choices = React.useMemo(() => textModelChoices(), []);
  const current = choices.find((choice) => choice.id === value) ?? choices[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" className="gap-1.5 text-meta">
          {current?.label ?? value}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {/*
          **값을 안 적는다**(2026-09-21 사용자). 고를 때마다 숫자를 견주게 하면
          모델을 고르는 것이 아니라 값을 고르게 된다. 이번 생성에 얼마 드는지는
          입력창 아래에 한 줄로 이미 나온다.

          **대신 등급을 적는다.** 업체마다 이름 규칙이 달라 「Sol」과 「Opus」
          중 어느 쪽이 위인지 이름만으로는 아무도 모른다.
        */}
        {choices.map((choice: TextModelChoice, at: number) => {
          // 업체가 바뀌는 자리에 이름표를 끼운다. 목록이 어디서 갈리는지 보인다.
          const 업체가바뀌나 = at === 0 || choice.vendor !== choices[at - 1]!.vendor;
          return (
            <React.Fragment key={choice.id}>
              {업체가바뀌나 ? (
                /*
                  **업체 이름이 아니라 제품 이름으로 묶는다.**

                  아래 항목이 「Claude Sonnet 5」인데 머리말이 「Anthropic」이면
                  둘이 어긋난다. 머리말은 그 아래 것들의 **공통 부분**이어야 한다.

                  덤으로 `model-name.test.ts` 의 업체 이름 금지에도 안 걸린다.
                  「Claude」는 이미 항목마다 적혀 있어 새로 드러나는 것이 없다 —
                  예외를 넓히지 않고 끝난다(설계 §11-⑤).
                */
                <div className="px-2 pb-1 pt-2 text-meta uppercase tracking-wide text-subtle-foreground">
                  {choice.vendor === "anthropic" ? "Claude" : "GPT"}
                </div>
              ) : null}
              <DropdownMenuItem
                onSelect={() => onChange(choice.id)}
                className="grid cursor-pointer gap-0.5 py-2"
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-medium">{choice.label}</span>
                  <span className="shrink-0 text-meta text-subtle-foreground">{choice.tier}</span>
                </span>
                <span className="text-meta text-subtle-foreground">{choice.note}</span>
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ImageModelMenu({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ImageModelChoice[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ids = React.useMemo(() => models.map((model) => model.id), [models]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" className="gap-1.5 text-meta">
          {imageModelName(value)}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      {/*
        **다른 화면과 같은 고르기를 넣는다.** 표준형·디테일형·속도형 세 개이고, 마우스를
        올리면 설명이 뜨며, 고른 모델의 설명은 늘 보인다(`ImageModelPicker`). 말풍선이
        메뉴 밖으로 나가야 하므로 잘림을 푼다. 하나를 고르면 메뉴를 닫는다.
      */}
      <DropdownMenuContent align="start" className="w-72 overflow-visible p-3">
        <ImageModelPicker
          value={value}
          ids={ids}
          legend="이미지 모델"
          onChange={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EasyModelBar({
  textModel,
  imageModel,
  imageModels,
  onTextModel,
  onImageModel,
  disabled,
}: {
  textModel: string;
  imageModel: string;
  imageModels: ImageModelChoice[];
  onTextModel: (id: string) => void;
  onImageModel: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    /*
      **좁은 화면에서는 라벨을 숨긴다.** 「글」·「그림」까지 넣으면 두 줄로
      감겨 입력창이 밀린다(2026-09-18 확인). 모델 이름 자체가 무엇인지
      말해 주므로 좁을 때는 그것으로 충분하다.
    */
    <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
      <span className="hidden text-meta text-subtle-foreground sm:inline">글</span>
      <TextModelMenu value={textModel} onChange={onTextModel} disabled={disabled} />
      <span className="ml-2 hidden text-meta text-subtle-foreground sm:inline">이미지</span>
      <ImageModelMenu
        models={imageModels}
        value={imageModel}
        onChange={onImageModel}
        disabled={disabled}
      />
    </div>
  );
}
