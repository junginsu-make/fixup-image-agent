import type { DailyVisit } from "../../../lib/analytics/report";

const count = (value: number) => value.toLocaleString("ko-KR");
/** 막대 위 여백(%). 가장 큰 막대 위에도 가입 점이 들어갈 자리를 남긴다. */
const HEADROOM = 14;
const MAX_TICKS = 7;
const pct = (value: number) => `${Number(value.toFixed(3))}%`;

/** `2026-10-06` → `10/06`. 모양이 다르면 원래 값 그대로. */
export function monthDay(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[1]}/${match[2]}` : day;
}

/** 날짜 글자를 붙일 줄 번호. 7개 이하면 전부, 넘으면 처음·끝을 넣어 고르게 7개. */
export function tickIndexes(length: number): number[] {
  if (length <= MAX_TICKS) return Array.from({ length }, (_, i) => i);
  const picked = Array.from({ length: MAX_TICKS }, (_, i) => Math.round((i * (length - 1)) / (MAX_TICKS - 1)));
  return [...new Set(picked)];
}

function summary(daily: DailyVisit[]): string {
  const visitors = daily.map((day) => day.visitors);
  const max = Math.max(...visitors);
  const total = visitors.reduce((sum, value) => sum + value, 0);
  const peak = max > 0 ? `(${monthDay(daily[visitors.indexOf(max)]!.day)})` : "";
  return `최근 ${daily.length}일 방문자, 최고 ${count(max)}명${peak}, 합계 ${count(total)}`;
}

/**
 * **일별 방문 그래프**(계획 2026-10-06 site-analytics, 15단계). 방문자 막대, 가입이 있는 날은 막대 위 점.
 * 막대만 SVG 에 그리고 좌표는 % 로 준다. 폭이 바뀌어도 늘어나지 않고, 글자(축·날짜)는 HTML 이라 찌그러지지 않는다.
 * 막대에 손을 올리면 그날 숫자가 뜬다(`<title>`). 휴대폰에서는 아래 「일별 표」로 본다.
 */
export function TrendChart({ daily }: { daily: DailyVisit[] }) {
  if (!daily.length) return <p className="text-sm text-muted-foreground">방문 기록이 없습니다.</p>;
  const max = Math.max(0, ...daily.map((day) => day.visitors));
  return (
    <figure className="min-w-0 space-y-2">
      <div className="flex gap-2">
        <div className="relative h-36 w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden>
          {max > 0 ? <span className="absolute right-0 -translate-y-1/2" style={{ top: pct(HEADROOM) }}>{count(max)}</span> : null}
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg role="img" aria-label={summary(daily)} className="block h-36 w-full overflow-visible">
            <Grid />
            {daily.map((day, index) => <DayBar key={day.day || index} day={day} index={index} slots={daily.length} scale={Math.max(1, max)} />)}
          </svg>
          <DateAxis daily={daily} />
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-primary" />하루 방문자</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-foreground" />가입이 있었던 날</span>
      </figcaption>
    </figure>
  );
}

function Grid() {
  const middle = HEADROOM + (100 - HEADROOM) / 2;
  return (
    <g aria-hidden className="stroke-border">
      <line x1="0" x2="100%" y1={pct(HEADROOM)} y2={pct(HEADROOM)} strokeDasharray="3 3" />
      <line x1="0" x2="100%" y1={pct(middle)} y2={pct(middle)} strokeDasharray="3 3" />
      <line x1="0" x2="100%" y1="100%" y2="100%" />
    </g>
  );
}

function DayBar({ day, index, slots, scale }: { day: DailyVisit; index: number; slots: number; scale: number }) {
  const slot = 100 / slots;
  const height = day.visitors > 0 ? Math.max(2, (day.visitors / scale) * (100 - HEADROOM)) : 0;
  const top = 100 - height;
  return (
    <g>
      <title>{`${monthDay(day.day)} 방문 ${count(day.visitors)} · 회원 ${count(day.members)} · 가입 ${count(day.signups)}`}</title>
      <rect x={pct(index * slot)} y="0" width={pct(slot)} height="100%" fill="transparent" />
      {height > 0 ? (
        <rect x={pct(index * slot + slot * 0.15)} y={pct(top)} width={pct(slot * 0.7)} height={pct(height)} rx={2} className="fill-primary" />
      ) : null}
      {day.signups > 0 ? <circle cx={pct((index + 0.5) * slot)} cy={pct(top - 6)} r={3} className="fill-foreground" /> : null}
    </g>
  );
}

function DateAxis({ daily }: { daily: DailyVisit[] }) {
  const slot = 100 / daily.length;
  const last = daily.length - 1;
  return (
    <div data-axis="days" aria-hidden className="relative mt-1 h-4 text-[11px] tabular-nums text-muted-foreground">
      {tickIndexes(daily.length).map((index) => {
        // 처음은 왼쪽 끝, 마지막은 오른쪽 끝에 붙인다. 가운데 정렬하면 칸 밖으로 삐져나간다.
        const style = index === 0 ? { left: 0 }
          : index === last ? { right: 0 }
          : { left: pct((index + 0.5) * slot), transform: "translateX(-50%)" };
        return <span key={index} className="absolute top-0 whitespace-nowrap" style={style}>{monthDay(daily[index]!.day)}</span>;
      })}
    </div>
  );
}
