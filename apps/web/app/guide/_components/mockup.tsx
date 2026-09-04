import type { ReactNode } from "react";
import { cn } from "@fixup/ui";

/**
 * 설명서에서 화면을 보여줄 때 쓰는 조각들.
 *
 * 스크린샷을 쓰지 않는 이유는 `docs/superpowers/specs/2026-09-04-in-app-guide-design.md`
 * 에 적었다. 요지는 하나다 — 화면은 자주 바뀌고, 낡은 안내는 없는 것만 못하다.
 *
 * 실제 화면을 그대로 베끼지 않는다. **지금 설명할 것만** 남긴 그림이다.
 * 색과 크기는 공용 토큰만 쓴다. 설명서는 앱 안에 있으니 다크모드에서 앱과
 * 같이 뒤집혀야 한다.
 */

/** 창틀. 제목은 그 화면의 이름을 그대로 쓴다. */
export function Mock({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("my-6 overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <span className="size-2 rounded-full bg-border" aria-hidden="true" />
        <span className="size-2 rounded-full bg-border" aria-hidden="true" />
        <span className="ml-1 text-meta text-subtle-foreground">{title}</span>
      </div>
      <div className="grid gap-4 p-5">{children}</div>
    </figure>
  );
}

/** 번호 뱃지. 목업 안과 아래 설명 목록에서 같은 번호를 쓴다. */
export function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** 단계 막대. 실제 StepBar 와 같은 말을 쓴다. */
export function MockSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-bold",
              index === current
                ? "border-primary bg-primary-soft text-primary"
                : index < current
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-border bg-card text-subtle-foreground",
            )}
          >
            {step}
          </span>
          {index < steps.length - 1 ? (
            <span className="text-subtle-foreground" aria-hidden="true">
              ›
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** 라벨 + 입력 칸. `value` 를 비우면 placeholder 처럼 흐리게 보인다. */
export function MockField({
  label,
  value,
  placeholder,
  marker,
  rows = 1,
  note,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  marker?: number;
  rows?: number;
  note?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        {marker ? <Marker n={marker} /> : null}
        <span className="text-sm font-bold">{label}</span>
      </div>
      <div
        className="rounded-md border bg-background px-3 py-2 text-sm"
        style={{ minHeight: `${rows * 1.5 + 1}rem` }}
      >
        {value ? (
          <span>{value}</span>
        ) : (
          <span className="text-subtle-foreground">{placeholder}</span>
        )}
      </div>
      {note ? <p className="text-xs text-subtle-foreground">{note}</p> : null}
    </div>
  );
}

/** 탭 줄. */
export function MockTabs({
  items,
  active,
  marker,
}: {
  items: string[];
  active: number;
  marker?: number;
}) {
  return (
    <div className="grid gap-1.5">
      {marker ? <Marker n={marker} /> : null}
      <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        {items.map((item, index) => (
          <span
            key={item}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-semibold",
              index === active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 고르는 카드 묶음. 비율·장수·종류처럼 버튼으로 고르는 자리. */
export function MockChoices({
  label,
  items,
  active,
  marker,
  note,
  columns = 4,
}: {
  label?: string;
  items: Array<{ title: string; hint?: string }>;
  active?: number;
  marker?: number;
  note?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className="grid gap-2">
      {label ? (
        <div className="flex items-center gap-1.5">
          {marker ? <Marker n={marker} /> : null}
          <span className="text-sm font-bold">{label}</span>
        </div>
      ) : null}
      <div
        className={cn(
          "grid gap-2",
          columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {items.map((item, index) => (
          <div
            key={item.title}
            className={cn(
              "rounded-lg border p-2.5",
              index === active ? "border-primary bg-primary-soft" : "bg-background",
            )}
          >
            <strong className="block text-sm">{item.title}</strong>
            {item.hint ? (
              <span className="mt-0.5 block text-xs text-subtle-foreground">{item.hint}</span>
            ) : null}
          </div>
        ))}
      </div>
      {note ? <p className="text-xs text-subtle-foreground">{note}</p> : null}
    </div>
  );
}

/** 버튼 한 줄. 오른쪽 정렬이 기본 — 실제 화면의 다음 단계 버튼 자리다. */
export function MockButtons({
  items,
  marker,
}: {
  items: Array<{ label: string; variant?: "primary" | "quiet" }>;
  marker?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {marker ? <Marker n={marker} className="mr-auto" /> : null}
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            "rounded-md px-3.5 py-2 text-sm font-bold",
            item.variant === "quiet"
              ? "border bg-card text-muted-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** 화면에 뜨는 회색 도움말 줄. */
export function MockNote({ children, marker }: { children: ReactNode; marker?: number }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {marker ? <Marker n={marker} /> : null}
      <span>{children}</span>
    </p>
  );
}

/** 목업 아래에 붙는 번호별 설명. 목업 안 Marker 와 번호가 짝을 이룬다. */
export function Callouts({
  items,
}: {
  items: Array<{ title: string; body: ReactNode }>;
}) {
  return (
    <ol className="grid gap-4">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-3">
          <Marker n={index + 1} className="mt-0.5" />
          <div className="min-w-0">
            <strong className="block text-sm">{item.title}</strong>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
