"use client";

import { Check } from "lucide-react";
import { cn } from "@fixup/ui";

/**
 * 진행 단계 표시.
 *
 * 미리보기에서 왼쪽 내비에 있던 4단계를 가로 막대로 옮겼다. 셸이 이미 좌측
 * 내비를 쓰고 있어 같은 자리에 또 세로 목록을 두면 내비가 둘이 된다.
 *
 * 클릭으로 단계를 건너뛰게 하지 않는다. 업로드 없이 분석으로 갈 수 없는 것처럼
 * 앞 단계가 끝나야 다음이 성립하는 구조라, 누를 수 있게 두면 막다른 길이 생긴다.
 */

export type CreateStep = "upload" | "analyze" | "sections" | "edit";
export type CreateMode = "image" | "text";

/**
 * 단계 수는 두 모드가 같다. 텍스트 모드는 1·2단계가 하는 일만 다르고
 * 3·4단계(섹션 생성 · 편집)는 완전히 같은 화면을 쓴다.
 * 대표 이미지 승인은 2단계 안에 포함된다.
 */
const STEPS: Record<CreateMode, Array<{ value: CreateStep; label: string; desc: string }>> = {
  image: [
    { value: "upload", label: "이미지 업로드", desc: "상품 사진 1장" },
    { value: "analyze", label: "AI 분석", desc: "구성 초안 생성" },
    { value: "sections", label: "섹션 생성", desc: "이미지 만들기" },
    { value: "edit", label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
  text: [
    { value: "upload", label: "텍스트 입력", desc: "무엇을 파는지" },
    { value: "analyze", label: "시나리오 · 대표 이미지", desc: "확인하고 수정" },
    { value: "sections", label: "섹션 생성", desc: "이미지 만들기" },
    { value: "edit", label: "편집 · 내보내기", desc: "문구 · 레이어" },
  ],
};

export function StepBar({ current, mode = "image" }: { current: CreateStep; mode?: CreateMode }) {
  const steps = STEPS[mode];
  const currentIndex = steps.findIndex((step) => step.value === current);

  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg bg-card p-2.5 shadow-[var(--shadow-ring)]">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.value} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5",
                active && "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary-soft text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check size={12} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block text-xs font-bold",
                    active ? "text-foreground" : done ? "text-muted-foreground" : "text-subtle-foreground"
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-meta text-subtle-foreground">{step.desc}</span>
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span aria-hidden className="h-px w-4 flex-none bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
