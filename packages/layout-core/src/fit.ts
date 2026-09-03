import type { CardSize, PixelRect } from "./slots";

/**
 * 넘치면 줄인다 — 자르지 않는다.
 *
 * 자르면 사람이 쓴 말이 사라지고, 사라진 줄도 모른다. 글자 수 상한을 두지
 * 않는 대신 여기서 폰트를 줄여 소화한다.
 *
 * 재는 일(폰트·Pango)은 밖에서 넣는다. 이 파일은 **폰트 없이 테스트할 수
 * 있어야 한다** — 폰트 판이 바뀌면 깨지는 규칙이면 규칙이 아니다.
 */

/** 목표의 몇 배까지 줄여 보는가. 이보다 작아지면 읽을 수 없다. */
export const FIT_MIN_SCALE = 0.6;
/** 한 번에 줄이는 폭. */
export const FIT_STEP = 0.05;

export interface FitInput {
  /** 칸높이 × sizeRatio. */
  targetPx: number;
  box: CardSize | PixelRect;
  measure(fontPx: number): Promise<CardSize> | CardSize;
}

export interface FitResult {
  fontPx: number;
  /** 최소 크기까지 줄여도 넘쳤다. 그대로 두고 화면에 알린다. */
  overflow: boolean;
  /** 몇 번 재 봤는가. 느릴 때 어디를 볼지 알려 준다. */
  measured: number;
}

/** 목표 글자 크기. 픽셀로 두면 카드 크기가 바뀔 때 안 맞는다. */
export function targetFontSize(box: CardSize | PixelRect, sizeRatio: number): number {
  return Math.max(1, Math.round(box.height * sizeRatio));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 칸에 들어갈 때까지 5%씩 줄인다.
 *
 * 배수를 곱해 가며 줄이면 부동소수점 오차가 쌓여 같은 입력에 다른 크기가
 * 나온다. **비율을 정수에서 만들어** 1.00 · 0.95 · … · 0.60 을 못 박는다.
 *
 * **재는 일 한 번이 렌더 한 번이다.** 하나씩 내려가며 다 재면 안 들어가는
 * 글마다 열 번을 그린다. 글 칸이 열여섯이면 그 곱만큼 서버가 묶인다(실측:
 * 카드 한 장 8.7초). 다행히 작을수록 잘 들어가는 한 방향 성질이라,
 * **양 끝을 먼저 보고 가운데를 반씩 갈라** 다섯 번 안에 같은 답을 찾는다.
 */
export async function fitFontSize(input: FitInput): Promise<FitResult> {
  const steps = Math.round((1 - FIT_MIN_SCALE) / FIT_STEP);
  let measured = 0;

  const sizeAt = (step: number) => round2(input.targetPx * ((100 - step * FIT_STEP * 100) / 100));
  const fitsAt = async (step: number): Promise<boolean> => {
    measured += 1;
    const drawn = await input.measure(sizeAt(step));
    return drawn.width <= input.box.width && drawn.height <= input.box.height;
  };

  // 목표 크기 그대로 들어가면 여기서 끝난다. 대부분이 여기다.
  if (await fitsAt(0)) return { fontPx: sizeAt(0), overflow: false, measured };

  // 가장 작게 줄여도 안 들어가면 그 사이를 뒤질 이유가 없다.
  if (!(await fitsAt(steps))) return { fontPx: sizeAt(steps), overflow: true, measured };

  let low = 1;
  let high = steps - 1;
  let best = steps;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (await fitsAt(middle)) {
      best = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return { fontPx: sizeAt(best), overflow: false, measured };
}
