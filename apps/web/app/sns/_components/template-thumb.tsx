"use client";

import { templateSummary, type LayoutSlot } from "@fixup/layout-core";

/**
 * 틀 하나를 손톱만 하게 그려 보여 준다.
 *
 * **이름만으로는 못 고른다.** 「속지 · 왼쪽 글, 오른쪽 그림」과 「속지 · 글 위,
 * 그림 아래」는 글자로 읽으면 비슷하고 그림으로 보면 한눈에 다르다. 설계
 * 문서가 처음부터 「고르면 그 자리에서 뼈대 미리보기(회색 상자들)를 보여
 * 준다」고 한 것이 이것이다.
 *
 * **서버를 안 부른다.** 칸 좌표가 이미 0~1 비율이라 그대로 퍼센트로 놓으면
 * 된다. 미리보기 API 는 한 장에 몇 십 초가 걸리는데, 아홉 개를 고르는
 * 자리에서 그걸 기다릴 수는 없다.
 *
 * 글 칸은 글자를 흉내 낸 **막대 두 줄**로 그린다. 실제 원고를 넣으면 길이가
 * 제각각이라 오히려 뼈대가 안 보인다 — 여기서 보여 줄 것은 배치다.
 */

const KIND_CLASS: Record<LayoutSlot["kind"], string> = {
  background: "",
  image: "border border-sky-500/70 bg-sky-500/15",
  logo: "border border-dashed border-amber-500/80 bg-amber-500/10",
  text: "",
};

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

function SlotMark({ slot }: { slot: LayoutSlot }) {
  const place = {
    left: percent(slot.box.x),
    top: percent(slot.box.y),
    width: percent(slot.box.width),
    height: percent(slot.box.height),
  };

  if (slot.kind === "background") {
    return <div className="absolute" style={{ ...place, backgroundColor: slot.fill }} />;
  }

  if (slot.kind === "text") {
    // 글자 대신 막대. 칸이 낮으면 한 줄만 들어간다.
    return (
      <div className="absolute flex flex-col justify-center gap-[2px] px-[2px]" style={place}>
        <span className="h-[3px] w-full rounded-full bg-foreground/45" />
        <span className="h-[3px] w-3/5 rounded-full bg-foreground/25" />
      </div>
    );
  }

  return <div className={`absolute ${KIND_CLASS[slot.kind]}`} style={place} />;
}

export function TemplateThumb({ slots, ratio, className }: {
  slots: LayoutSlot[];
  /** 카드 가로/세로. 못 주면 인스타그램 기본인 4:5 로 그린다. */
  ratio?: { width: number; height: number };
  className?: string;
}) {
  const shape = ratio ?? { width: 4, height: 5 };
  return (
    <div
      className={`relative overflow-hidden rounded border bg-white ${className ?? ""}`}
      style={{ aspectRatio: `${shape.width} / ${shape.height}` }}
    >
      {slots.map((slot, offset) => <SlotMark key={offset} slot={slot} />)}
    </div>
  );
}

/**
 * 그림에 안 나오는 것을 글로 보탠다 — **값과 빈 로고.**
 *
 * 그림 칸이 둘이면 카드 한 장에 fal 을 두 번 부른다. 손톱 그림만 봐서는
 * 그게 한 칸인지 두 칸인지 헷갈린다. 빈 로고는 아예 안 보인다.
 */
export function TemplateFacts({ slots }: { slots: LayoutSlot[] }) {
  const summary = templateSummary(slots);
  return (
    <span className="text-[11px] text-muted-foreground">
      {summary.images === 0
        ? "그림 없음 · 값 안 듦"
        : summary.images === 1
          ? "그림 1칸"
          : `그림 ${summary.images}칸 · 값 ${summary.images}배`}
      {summary.emptyLogos > 0 ? (
        <span className="text-amber-600 dark:text-amber-400"> · 로고 미선택</span>
      ) : null}
    </span>
  );
}
