"use client";

import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@fixup/pdp-core";
import type { ImageModelId } from "@fixup/pdp-core";
import { cn } from "@fixup/ui";

/**
 * 이미지 모델 선택.
 *
 * 차감량을 카드에 함께 띄우는 게 중요하다. 가장 비싼 모델이 가장 싼 것보다
 * 4배 비싼데, 모르고 고르면 월 한도가 금방 사라진다.
 * 설명 문구의 소요 시간은 6장 동시 생성 기준 실측값이다.
 */

interface ModelPickerProps {
  value: ImageModelId;
  sectionCount: number;
  disabled?: boolean;
  onChange: (model: ImageModelId) => void;
}

export function ModelPicker({ value, sectionCount, disabled, onChange }: ModelPickerProps) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-1 text-meta text-subtle-foreground">이미지 생성 모델</legend>
      {/* 캐릭터에서 먼저 비교 중인 모델은 여기 안 띄운다. 상세페이지는 섹션
          이미지 품질을 실측으로 맞춰 왔다 — 검증 안 된 모델을 섞으면 어느
          모델로 만든 페이지인지 뒤죽박죽이 된다. */}
      {IMAGE_MODELS.filter((model) => !model.characterOnly).map((model) => {
        const selected = model.id === value;
        return (
          <button
            key={model.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(model.id)}
            className={cn(
              "rounded-lg p-3.5 text-left transition-colors disabled:opacity-50",
              selected
                ? "bg-primary-soft shadow-[0_0_0_2px_var(--primary-ring)]"
                : "bg-background shadow-[var(--shadow-ring)] hover:bg-primary-soft/40",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "grid h-4 w-4 flex-none place-items-center rounded-full border",
                  selected ? "border-primary bg-primary" : "border-border",
                )}
              >
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
              </span>
              <strong className="text-sm">{model.label}</strong>
              {/*
                배열 첫 항목이 아니라 **기본값**으로 판정한다. 전에는
                `IMAGE_MODELS[0]` 을 봤는데, 그러면 `DEFAULT_IMAGE_MODEL` 만
                되돌렸을 때 서버는 옛 모델로 만드는데 화면은 새 모델에
                「기본」을 붙인다 — 배지가 거짓말을 한다.
              */}
              {model.id === DEFAULT_IMAGE_MODEL ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  기본
                </span>
              ) : null}
              <span className="ml-auto text-xs font-bold text-primary">
                {model.creditWeight * sectionCount}장 차감
              </span>
            </span>
            <span className="mt-1 block pl-6 text-sm text-muted-foreground">{model.description}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
