import { cn } from "@fixup/ui";

const count = (value: number) => value.toLocaleString("ko-KR");
const SHOWN = 8;

/** 합계 대비 몫. 합계가 0 이면 0 — 나눗셈으로 무한대·NaN 을 내지 않는다. */
function share(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}
const shareText = (ratio: number) => (ratio > 0 && ratio < 0.005 ? "1% 미만" : `${Math.round(ratio * 100)}%`);

interface RankListProps<T extends { key: string }> {
  title: string;
  rows: T[];
  /** 줄 세우는 숫자. 막대 길이와 비율도 이 숫자로 정한다. */
  value: (row: T) => number;
  label: (key: string) => string;
  /** 이름 아래 작은 회색 글씨(원래 주소, 다른 숫자 등). */
  sublabel?: (row: T) => string | null;
  unit: string;
  /** 비율의 분모. 안 주면 보이는 줄의 합. */
  total?: number;
}

/**
 * **비율 막대 목록**(계획 2026-10-06 site-analytics, 15단계). 이름 · 숫자 · 비율, 아래 가로 막대.
 * 상위 8개만 펼쳐 두고 나머지는 「더 보기」에 접는다. 표가 아니라 줄 목록이라 휴대폰에서도 넘치지 않는다.
 */
export function RankList<T extends { key: string }>(props: RankListProps<T>) {
  const { title, rows } = props;
  const total = props.total ?? rows.reduce((sum, row) => sum + props.value(row), 0);
  const head = rows.slice(0, SHOWN);
  const rest = rows.slice(SHOWN);
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <>
          <RankRows {...props} rows={head} total={total} />
          {rest.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">더 보기 ({rest.length}개)</summary>
              <RankRows {...props} rows={rest} total={total} className="mt-3" />
            </details>
          ) : null}
        </>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </section>
  );
}

function RankRows<T extends { key: string }>({ rows, value, label, sublabel, unit, total, className }:
  RankListProps<T> & { total: number; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {rows.map((row) => {
        const amount = value(row);
        const ratio = share(amount, total);
        const sub = sublabel?.(row);
        return (
          <li key={row.key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words font-medium">{label(row.key)}</span>
              <span className="shrink-0 tabular-nums">
                {count(amount)}{unit} <span className="text-muted-foreground">{shareText(ratio)}</span>
              </span>
            </div>
            {sub ? <p className="mt-0.5 break-all text-xs text-muted-foreground">{sub}</p> : null}
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
