/**
 * 여러 화면이 함께 쓰는 작은 조각들.
 *
 * 결과 화면에 섞여 있었는데 작업대도 쓴다. 한쪽에 두면 다른 쪽이 그쪽을
 * 거꾸로 참조하게 되어 둘이 엉킨다.
 */

import * as React from "react";
import { cn } from "@fixup/ui";
export function Topbar({
  eyebrow,
  title,
  stacked = false,
  children,
}: {
  eyebrow: string;
  title?: string;
  /**
   * 제목 아래 줄에 단추를 둔다. 결과 화면은 제목이 길고 단추가 다섯이라, 한 줄에
   * 넣으면 제목이 두 줄로 꺾이고 단추도 두 줄로 어긋났다(2026-09-23 화면 검수).
   */
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mb-5 flex gap-4", stacked ? "flex-col" : "items-start justify-between max-md:flex-col")}>
      <div>
        <p className="mb-1 text-xs font-bold text-muted-foreground">{eyebrow}</p>
        {title ? <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">{title}</h1> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-between rounded-md border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="text-2xl">{value}</strong>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

export function OptionGroup({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-muted-foreground">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", value === optionValue && "bg-foreground text-background")}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MiniThumb() {
  return (
    <div className="relative h-[68px] w-[52px] overflow-hidden rounded-md border border-border bg-muted">
      <div className="absolute left-2 right-2 top-2 h-4 rounded bg-foreground" />
      <div className="absolute bottom-2 left-2 right-2 h-7 rounded-md bg-gradient-to-br from-primary to-lime-300" />
    </div>
  );
}

export function PlaceholderThumb({ index }: { index: number }) {
  return (
    <div className="absolute inset-0 p-3">
      <div className={cn("mb-2 h-2 rounded-full bg-foreground", index % 2 === 0 && "w-2/3")} />
      <div className="mb-1 h-1.5 rounded-full bg-muted" />
      <div className="h-1.5 w-3/4 rounded-full bg-muted" />
      <div className="absolute bottom-3 left-3 right-3 h-[42%] rounded-md bg-gradient-to-br from-primary to-lime-300" />
    </div>
  );
}
