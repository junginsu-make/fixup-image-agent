"use client";

import { Rnd } from "react-rnd";
import type { LayoutSlot } from "@fixup/layout-core";
import { SLOT_LABEL, roundBox } from "./slot-defaults";

/**
 * 칸을 손으로 고치는 자리. **편집기는 이것 하나뿐이다.**
 *
 * B(레퍼런스에서 읽어내기)는 이 편집기에 초안을 채워 주는 입구이고,
 * 「직접 만들기」는 같은 편집기를 빈 상태로 여는 것이다. 편집기가 둘이면
 * 하나는 반드시 낡는다.
 */

/**
 * 화면에 그리는 카드 크기의 한계.
 *
 * 좌표는 비율이라 이 값이 바뀌어도 틀은 그대로다. **남는 자리에 맞춰 키운다** —
 * 세로가 긴 9:16 을 가로 기준으로 그리면 화면 밖으로 넘치고, 가로가 긴 16:9 를
 * 세로 기준으로 그리면 손톱만 해진다.
 */
export const CANVAS_MAX_WIDTH = 560;
export const CANVAS_MAX_HEIGHT = 620;

/** 카드 비율을 지키면서 한계 안에 들어가는 가장 큰 크기. */
export function canvasSize(card: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(CANVAS_MAX_WIDTH / card.width, CANVAS_MAX_HEIGHT / card.height);
  return { width: Math.round(card.width * scale), height: Math.round(card.height * scale) };
}

const KIND_STYLE: Record<LayoutSlot["kind"], string> = {
  background: "border-slate-400/70",
  image: "border-sky-500/80 bg-sky-500/10",
  logo: "border-amber-500/80 bg-amber-500/10",
  text: "border-emerald-500/80 bg-emerald-500/10",
};

/**
 * 테두리 선을 붙잡는 자리를 넓힌다.
 *
 * react-rnd 기본값은 선 위 10px 폭이라 마우스가 살짝만 벗어나도 리사이즈
 * 커서가 안 뜬다. 칸이 촘촘히 붙어 있으면 그 10px조차 맞추기 어려워
 * 「이 기능이 있는지도 몰랐다」는 말이 나온다. 잡는 폭만 넓히고 칸 자체
 * 크기·보이는 테두리는 그대로 둔다.
 */
const RESIZE_HANDLE_STYLES = {
  top: { height: "14px", top: "-7px" },
  bottom: { height: "14px", bottom: "-7px" },
  left: { width: "14px", left: "-7px" },
  right: { width: "14px", right: "-7px" },
};

/**
 * 모서리에 찍는 점. **보이기만 한다** — 실제로 잡는 것은 라이브러리가 만드는
 * 투명한 손잡이다. 그래서 `pointer-events-none` 이어야 한다. 이게 클릭을
 * 먹으면 오히려 크기 조절이 안 된다.
 *
 * 선 위에 마우스를 정확히 올리기 전에는 크기를 바꿀 수 있다는 표시가 아무것도
 * 없었다. 「이 기능이 있는지도 몰랐다」는 말이 그래서 나온다. 마우스를 칸에
 * 올리거나 칸을 고르면 점이 뜨게 해서, 올려보기 전에 알 수 있게 한다.
 */
const HANDLE_DOT =
  "pointer-events-none absolute size-2 rounded-[2px] border border-white bg-primary shadow-sm";

/**
 * 점은 칸 **안쪽** 모서리에 붙인다.
 *
 * 밖으로 빼면 카드 가장자리에 붙은 칸에서 잘린다 — 캔버스가
 * `overflow-hidden` 이라 밖으로 나간 부분이 안 보인다. 배경 칸은 대개 카드
 * 전체 크기라 네 점이 모두 사라진다. 안쪽이면 어느 칸이든 늘 보인다.
 */
const HANDLE_DOTS = [
  "left-0 top-0",
  "right-0 top-0",
  "bottom-0 left-0",
  "bottom-0 right-0",
];

export interface SlotCanvasProps {
  slots: LayoutSlot[];
  size: { width: number; height: number };
  selected: number | null;
  /**
   * 칸 뒤에 깔아 볼 그림. 읽어낸 칸이 레퍼런스와 맞는지 눈으로 대 보는 자리다.
   * 이게 없으면 「비슷하게 나왔나」를 사람이 확인할 길이 없다.
   */
  backdrop?: string;
  onSelect(offset: number | null): void;
  onChange(offset: number, slot: LayoutSlot): void;
}

export function SlotCanvas({ slots, size, selected, backdrop, onSelect, onChange }: SlotCanvasProps) {
  const { width, height } = canvasSize(size);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm"
      style={{ width, height }}
      onClick={() => onSelect(null)}
    >
      {backdrop ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL·서명 URL 이라 최적화 대상이 아니다.
        <img src={backdrop} alt="대 보는 그림" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
      ) : null}

      {slots.map((slot, offset) => (
        <Rnd
          key={offset}
          bounds="parent"
          resizeHandleStyles={RESIZE_HANDLE_STYLES}
          className={`group border-2 ${KIND_STYLE[slot.kind]} ${selected === offset ? "ring-2 ring-primary ring-offset-1" : ""}`}
          /**
           * 고른 칸을 맨 위로 올린다.
           *
           * 칸은 배열 순서대로 쌓이고 손잡이는 칸 밖으로 7px 튀어나온다. 그
           * 자리를 뒤에 그려진 칸이 덮으면 앞 칸의 선을 잡을 수 없다. 특히
           * 배경 칸은 대개 카드 전체 크기에 맨 앞이라 그 위의 모든 칸에 가려
           * 사실상 못 잡았다 — 칸 목록에서 골라도 마찬가지였다.
           *
           * `cursor` 는 넣지 않는다. 넣으면 라이브러리가 깔아 둔 `move` 를
           * 덮어써서 옮길 수 있다는 표시가 사라진다.
           */
          style={{
            zIndex: selected === offset ? 20 : undefined,
            ...(slot.kind === "background" ? { backgroundColor: `${slot.fill}55` } : {}),
          }}
          size={{
            width: Math.max(4, slot.box.width * width),
            height: Math.max(4, slot.box.height * height),
          }}
          position={{ x: slot.box.x * width, y: slot.box.y * height }}
          /**
           * 누르면 골라진다.
           *
           * 전에는 `onMouseDown` 만 막아 뒀는데, `click` 은 별개 이벤트라 그대로
           * 부모로 올라가 방금 고른 것이 즉시 풀렸다. 끌어야만 골라지고 손을
           * 떼면 사라져서, 칸 설정을 아예 못 여는 상태였다.
           */
          onClick={(event: { stopPropagation(): void }) => {
            event.stopPropagation();
            onSelect(offset);
          }}
          onMouseDown={(event: { stopPropagation(): void }) => event.stopPropagation()}
          onDragStart={() => onSelect(offset)}
          onDragStop={(_event, data) => onChange(offset, {
            ...slot,
            box: roundBox({ ...slot.box, x: data.x / width, y: data.y / height }),
          })}
          onResizeStart={() => onSelect(offset)}
          onResizeStop={(_event, _direction, ref, _delta, position) => onChange(offset, {
            ...slot,
            box: roundBox({
              x: position.x / width,
              y: position.y / height,
              width: ref.offsetWidth / width,
              height: ref.offsetHeight / height,
            }),
          })}
        >
          <span className="pointer-events-none absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-semibold">
            {offset + 1} {SLOT_LABEL[slot.kind]}
          </span>
          {HANDLE_DOTS.map((place) => (
            <span
              key={place}
              className={`${HANDLE_DOT} ${place} transition-opacity ${
                selected === offset ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            />
          ))}
        </Rnd>
      ))}
    </div>
  );
}
