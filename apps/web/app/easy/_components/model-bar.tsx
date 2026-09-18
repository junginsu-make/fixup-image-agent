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
import { textModelChoices, type TextModelChoice } from "@fixup/shared";

/**
 * 입력창 위의 드롭다운 둘 — **글 모델**과 **그림 모델** (설계 §7).
 *
 * ── 진짜 이름을 낸다 ─────────────────────────────────────────
 *
 * 우리 이름(「표준형」)을 안 쓴다. **이 화면에서만 푸는 예외**다(설계 §5-1,
 * 2026-09-17 사용자 결정). `model-name.test.ts` 의 예외 목록에 `app/easy` 가
 * 들어 있고, 왜인지 그 주석에 적혀 있다.
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
      <DropdownMenuContent align="start" className="w-72">
        {choices.map((choice: TextModelChoice) => (
          <DropdownMenuItem
            key={choice.id}
            onSelect={() => onChange(choice.id)}
            className="grid gap-0.5 py-2"
          >
            <span className="flex w-full items-center justify-between gap-3">
              <span className="font-medium">{choice.label}</span>
              {/*
                **단가를 표에서 가져온다**(`text-models.ts` 가 `priceOf` 로
                읽는다). 여기서 손으로 적으면 두 벌이 되고 낡은 쪽이 보인다.
              */}
              <span className="shrink-0 text-meta text-subtle-foreground">
                ${choice.price.inputPerMillion} / ${choice.price.outputPerMillion}
              </span>
            </span>
            <span className="text-meta text-subtle-foreground">{choice.note}</span>
          </DropdownMenuItem>
        ))}
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
  const current = models.find((model) => model.id === value) ?? models[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="sm" className="gap-1.5 text-meta">
          {current?.label ?? value}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {models.map((model) => (
          <DropdownMenuItem key={model.id} onSelect={() => onChange(model.id)}>
            {model.label}
          </DropdownMenuItem>
        ))}
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
    <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
      <span className="text-meta text-subtle-foreground">글</span>
      <TextModelMenu value={textModel} onChange={onTextModel} disabled={disabled} />
      <span className="ml-2 text-meta text-subtle-foreground">그림</span>
      <ImageModelMenu
        models={imageModels}
        value={imageModel}
        onChange={onImageModel}
        disabled={disabled}
      />
    </div>
  );
}
