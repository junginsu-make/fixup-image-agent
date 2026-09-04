import type { ReactNode } from "react";
import { cn } from "@fixup/ui";

/**
 * 흐름 다이어그램과 설명서 페이지의 공통 뼈대.
 *
 * 다이어그램은 인라인 SVG 다. 라이브러리를 더하지 않는다. 색은 CSS 변수로
 * 두어 다크모드에서 앱과 같이 뒤집힌다.
 */

export interface FlowNode {
  /** 상자 안 글자. 짧게 — SVG 는 줄바꿈을 스스로 하지 않는다. */
  label: string;
  /** 상자 아래 작은 글자. 없으면 생략 */
  sub?: string;
  /** 사람이 손을 대는 단계. 테두리를 강조한다 */
  human?: boolean;
}

const BOX_W = 150;
const BOX_H = 58;
const GAP = 34;

/**
 * 가로로 흐르는 단계 다이어그램.
 *
 * 좁은 화면에서는 컨테이너가 가로로 밀린다. 줄여서 글자가 뭉개지는 것보다
 * 미는 편이 읽힌다.
 */
export function Flow({ nodes, loopBack }: { nodes: FlowNode[]; loopBack?: string }) {
  const width = nodes.length * BOX_W + (nodes.length - 1) * GAP;
  const height = loopBack ? BOX_H + 74 : BOX_H + 30;

  return (
    <div className="my-6 overflow-x-auto">
      {/* max-w-full 을 주면 좁은 화면에서 줄어든다. 886px 짜리가 343px 로 줄면
          안의 글자가 5px 가 되어 읽을 수 없다. 줄이지 말고 밀어야 한다 —
          부모의 overflow-x-auto 가 그 일을 한다. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`흐름: ${nodes.map((n) => n.label).join(" 다음 ")}`}
        style={{ minWidth: width }}
      >
        {nodes.map((node, index) => {
          const x = index * (BOX_W + GAP);
          return (
            <g key={node.label}>
              <rect
                x={x}
                y={14}
                width={BOX_W}
                height={BOX_H}
                rx={10}
                fill="var(--card)"
                stroke={node.human ? "var(--primary)" : "var(--border)"}
                strokeWidth={node.human ? 2 : 1}
              />
              <text
                x={x + BOX_W / 2}
                y={node.sub ? 38 : 48}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="var(--foreground)"
              >
                {node.label}
              </text>
              {node.sub ? (
                <text
                  x={x + BOX_W / 2}
                  y={55}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--subtle-foreground)"
                >
                  {node.sub}
                </text>
              ) : null}
              {index < nodes.length - 1 ? (
                <g stroke="var(--border)" strokeWidth={1.5} fill="none">
                  <line x1={x + BOX_W + 6} y1={43} x2={x + BOX_W + GAP - 10} y2={43} />
                  <polyline
                    points={`${x + BOX_W + GAP - 15},38 ${x + BOX_W + GAP - 8},43 ${x + BOX_W + GAP - 15},48`}
                  />
                </g>
              ) : null}
            </g>
          );
        })}

        {loopBack ? (
          <g>
            <path
              d={`M ${width - BOX_W / 2} ${BOX_H + 14} V ${BOX_H + 40} H ${BOX_W / 2} V ${BOX_H + 22}`}
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="none"
            />
            <polyline
              points={`${BOX_W / 2 - 5},${BOX_H + 28} ${BOX_W / 2},${BOX_H + 20} ${BOX_W / 2 + 5},${BOX_H + 28}`}
              stroke="var(--primary)"
              strokeWidth={1.5}
              fill="none"
            />
            <text
              x={width / 2}
              y={BOX_H + 60}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="700"
              fill="var(--primary)"
            >
              {loopBack}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/** 사람이 손대는 단계에 테두리가 붙는다는 것을 한 줄로 알린다. */
export function FlowLegend() {
  return (
    <p className="-mt-3 text-xs text-subtle-foreground">
      <span className="mr-1.5 inline-block size-2.5 rounded-[3px] border-2 border-primary align-middle" />
      테두리가 있는 단계는 <strong className="font-bold text-muted-foreground">사람이 확인하고 고치는 자리</strong>입니다.
    </p>
  );
}

/* ── 페이지 뼈대 ─────────────────────────────────────────── */

/** 설명서 페이지의 머리. 제목과 한 줄 정의. */
export function GuideHeader({
  kicker,
  title,
  lead,
}: {
  kicker: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="border-b pb-6">
      <p className="text-meta text-primary">{kicker}</p>
      <h1 className="mt-1.5 text-2xl font-black tracking-[-0.02em] sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{lead}</p>
    </header>
  );
}

/** 설명서 안의 한 덩어리. 모든 페이지가 같은 순서로 같은 이름을 쓴다. */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 border-t pt-8">
      <div>
        <h2 className="text-lg font-extrabold tracking-[-0.01em]">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** 상황 → 무엇을 고르나. 표가 좁은 화면에서 가로로 밀린다. */
export function ChoiceTable({
  head,
  rows,
}: {
  head: [string, string, string];
  rows: Array<[string, string, string]>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            {head.map((cell) => (
              <th key={cell} className="px-4 py-3 font-bold text-muted-foreground">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b last:border-b-0 align-top">
              <th scope="row" className="px-4 py-3 text-left font-bold">
                {row[0]}
              </th>
              <td className="px-4 py-3 font-semibold text-primary">{row[1]}</td>
              <td className="px-4 py-3 leading-6 text-muted-foreground">{row[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 시중 도구와 무엇이 다른가. 근거 있는 것만 적는다. */
export function DiffList({
  items,
}: {
  items: Array<{ common: string; ours: string; why: string }>;
}) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.ours} className="rounded-xl border bg-card p-4">
          <p className="text-xs font-bold text-subtle-foreground line-through decoration-subtle-foreground/50">
            {item.common}
          </p>
          <p className="mt-1.5 text-sm font-extrabold text-foreground">{item.ours}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.why}</p>
        </li>
      ))}
    </ul>
  );
}

/** 자주 막히는 곳. 실제 검증 메시지와 제약에서 가져온다. */
export function Pitfalls({ items }: { items: Array<{ q: string; a: ReactNode }> }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.q} className={cn("rounded-xl border-l-2 border-l-warning bg-muted/30 px-4 py-3")}>
          <strong className="block text-sm">{item.q}</strong>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.a}</div>
        </li>
      ))}
    </ul>
  );
}
