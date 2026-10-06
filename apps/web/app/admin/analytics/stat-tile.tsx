import { Badge, cn } from "@fixup/ui";
import type { LucideIcon } from "lucide-react";
import { changeText, type Change } from "../../../lib/analytics/compare";

/**
 * 증감 배지 색. 늘면 초록, 줄면 빨강, 그 밖은 회색. 글자에 ▲▼ 가 있어 색 없이도 읽힌다.
 * 어두운 화면은 옅은 색 바탕 + 밝은 글자로 따로 준다(밝은 바탕을 그대로 두면 카드 위에서 튄다). 대비는 둘 다 AA.
 */
const TONE: Record<Change["kind"], string> = {
  up: "border-transparent bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  down: "border-transparent bg-destructive/10 text-destructive dark:bg-red-500/15 dark:text-red-300",
  same: "border-transparent bg-secondary text-secondary-foreground",
  new: "border-transparent bg-secondary text-secondary-foreground",
  none: "",
};
/** 화면 읽기 도구용 한마디. 기호(▲▼)만으로는 뜻이 안 읽힐 수 있다. */
const SPOKEN: Partial<Record<Change["kind"], string>> = { up: "늘었습니다", down: "줄었습니다" };

/** 앞선 기간 값 안내. 앞선 값이 없으면(못 읽었거나 견주지 않음) 안내도 없다. */
export function previousHint(days: number, before: number | undefined, unit: string): string | undefined {
  return before === undefined ? undefined : `앞선 ${days}일(같은 시각까지) ${before.toLocaleString("ko-KR")}${unit}`;
}

/**
 * **숫자 칸 하나**(계획 2026-10-06 site-analytics, 15단계). 큰 숫자, 아래 라벨, 오른쪽 위 증감 배지.
 * `<dl>` 안에 넣는다. 화면 읽기 도구는 라벨부터 읽고, 눈에는 숫자가 먼저 보인다(`order`).
 */
export function StatTile({ label, value, change, hint, icon: Icon }: {
  label: string; value: string; change?: Change; hint?: string; icon?: LucideIcon;
}) {
  const shown = change && change.kind !== "none" ? change : null;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3">
      <dt className="order-2 flex min-w-0 items-start gap-1 break-keep text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {Icon ? <Icon aria-hidden className="mt-px size-3.5 shrink-0" /> : null}
        <span className="min-w-0">{label}</span>
      </dt>
      <dd className="order-1 flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-keep text-2xl font-semibold leading-tight [overflow-wrap:anywhere]">{value}</span>
        {shown ? (
          <Badge variant="outline" className={cn("shrink-0 whitespace-nowrap", TONE[shown.kind])}>
            {changeText(shown)}
            {SPOKEN[shown.kind] ? <span className="sr-only"> {SPOKEN[shown.kind]}</span> : null}
          </Badge>
        ) : null}
      </dd>
      {hint ? <dd className="order-3 break-keep text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">{hint}</dd> : null}
    </div>
  );
}
