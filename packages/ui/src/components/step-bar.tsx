"use client";

import { Check } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * 진행 단계 표시 — 세 도구가 같이 쓴다.
 *
 * 07-21 개편 때 /create 는 StepBar 를, /redesign 은 인라인 버튼을 각자 만들어
 * 모양과 동작이 갈라졌다. 같은 앱에서 하나는 진행 막대, 하나는 탭처럼 보였다.
 *
 * 클릭 정책은 두 쪽의 절충이다. /create 는 전부 막았고 /redesign 은 전부 열었는데,
 * **지난 단계만 여는 것**이 두 요구를 다 만족한다 — 되돌아갈 수는 있고,
 * 앞 단계를 건너뛰어 빈 화면에 도달하지는 않는다.
 */

export interface StepDefinition {
  id: string;
  label: string;
  desc?: string;
}

export type StepState = "done" | "active" | "todo";

export function stepState(steps: StepDefinition[], current: string, id: string): StepState {
  const currentIndex = steps.findIndex((step) => step.id === current);
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0 || currentIndex < 0) return "todo";
  if (index < currentIndex) return "done";
  return index === currentIndex ? "active" : "todo";
}

export function canJumpTo(steps: StepDefinition[], current: string, id: string): boolean {
  return stepState(steps, current, id) === "done";
}

export function StepBar({ steps, current, onJump }: {
  steps: StepDefinition[];
  current: string;
  /** 없으면 어느 단계도 누를 수 없다. */
  onJump?: (id: string) => void;
}) {
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg bg-card p-2.5 shadow-[var(--shadow-ring)]">
      {steps.map((step, index) => {
        const state = stepState(steps, current, step.id);
        const jumpable = Boolean(onJump) && canJumpTo(steps, current, step.id);
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!jumpable}
              onClick={() => jumpable && onJump?.(step.id)}
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                state === "active" && "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]",
                jumpable && "hover:bg-muted",
                !jumpable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "active" && "bg-primary text-primary-foreground",
                  state === "todo" && "border border-border bg-background text-subtle-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="flex flex-col leading-tight">
                <span className={cn("text-sm font-bold", state === "todo" && "text-muted-foreground")}>
                  {step.label}
                </span>
                {step.desc ? <span className="text-[11px] text-subtle-foreground">{step.desc}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
