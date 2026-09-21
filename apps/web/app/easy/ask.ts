import { POSTER_RATIOS } from "@fixup/sns-core";
import { IMAGE_LOOKS, IMAGE_LOOK_LABEL, type ImageLook } from "@fixup/shared";

/**
 * **비율과 스타일을 한 번 물어본다** (2026-09-21 사용자).
 *
 * 「레퍼런스 없이 그냥 시작해서 어떤 이미지를 만들어줘라고만 입력한다면 토글로
 * 최소한 비율은 물어봐주세요. 지금은 무조건 1:1로만 나옵니다.」
 *
 * ── 되묻지 않기로 한 것과 어긋나지 않나 ─────────────────────
 *
 * 설계 §6 은 **되묻지 않는다**고 못 박았다. 그 뜻은 「빈칸을 채우려고 캐묻지
 * 않는다」이지 **아무것도 안 묻는다**가 아니다. 지금까지는 비율을 물을 자리가
 * 없어서 **무엇을 적든 정사각형**이 나왔다 — 세로 포스터를 달라고 해도 그랬다.
 *
 * 그래서 묻되, **막지 않는다.**
 *
 *   · 말 속에 이미 있으면 안 묻는다 (「세로로」라고 했으면 그것을 쓴다)
 *   · 붙인 이미지가 있으면 안 묻는다 (그 결을 따라가는 것이 기본이다)
 *   · 물어도 답을 기다리지 않는다 — 「이대로 만들기」가 늘 열려 있다
 *
 * **답이 없으면 지금까지대로다** — 1:1, 결은 `auto`(말에 맞춰 기획이 정한다).
 */

/** 안 고르거나 모를 때 쓰는 값. 지금까지의 동작 그대로다. */
export const EASY_DEFAULT_RATIO = "1:1";
export const EASY_DEFAULT_LOOK: ImageLook = "auto";

/**
 * 고를 수 있는 비율.
 *
 * **이름을 지어내지 않는다.** 포스터 표에서 가져온다 — 같은 비율을 두 화면이
 * 다르게 부르면 사용자가 같은 것인 줄 모른다.
 *
 * 포스터의 아홉 가지를 다 내지는 않는다. A4 인쇄·첨부와 같은 비율은 **모델을
 * 가리는 비율**이라(`pixelOnly`), 고를 것을 줄이는 이 모드에서 고르면 모델이
 * 조용히 바뀐다. 어느 모델로도 만들 수 있는 것만 낸다.
 */
const 쓸비율 = ["1:1", "4:5", "9:16", "2:3", "16:9"];

export const EASY_RATIOS = 쓸비율.map((id) => {
  const spec = POSTER_RATIOS.find((ratio) => ratio.id === id);
  if (!spec) throw new Error(`포스터 표에 없는 비율입니다: ${id}`);
  // 목록이 좁아 긴 이름이 안 들어간다. 「인스타그램 피드 4:5」에서 앞말만 쓴다.
  return { id: spec.id, label: spec.label.replace(` ${spec.id}`, ""), ratio: spec.id };
});

/** 고를 수 있는 결. 다섯 도구가 쓰는 그 목록 그대로다. */
export const EASY_LOOKS = IMAGE_LOOKS.map((id) => ({ id, label: IMAGE_LOOK_LABEL[id] }));

export interface EasyAskInput {
  /** 붙인 이미지 장수. */
  attachmentCount: number;
  /** 사용자가 이미 고른 값. 물어본 뒤 다시 보낼 때 온다. */
  chosenRatio?: string;
  chosenLook?: string;
  /** 말 속에서 읽어 낸 값. 없으면 비어 있다. */
  saidRatio?: string;
  saidLook?: string;
}

export interface EasyAsk {
  /** 물어야 하나. */
  asks: boolean;
  /** 이번에 쓸 비율. */
  ratio: string;
  /** 이번에 쓸 결. */
  look: ImageLook;
}

const 아는비율 = new Set(EASY_RATIOS.map((one) => one.id));
const 아는결 = new Set<string>(IMAGE_LOOKS);

/**
 * 지금 물어야 하나, 무엇으로 만들까.
 *
 * **고른 것이 가장 세다.** 그 다음이 말 속에 있던 것, 마지막이 기본값이다.
 * 사용자가 방금 고른 것을 말이 덮으면 고르는 뜻이 없다.
 */
export function easyAsk(input: EasyAskInput): EasyAsk {
  const 고른비율 = 아는비율.has(input.chosenRatio ?? "") ? input.chosenRatio! : undefined;
  const 고른결 = 아는결.has(input.chosenLook ?? "") ? (input.chosenLook as ImageLook) : undefined;
  const 말한비율 = 아는비율.has(input.saidRatio ?? "") ? input.saidRatio! : undefined;
  const 말한결 = 아는결.has(input.saidLook ?? "") ? (input.saidLook as ImageLook) : undefined;

  /*
   * **한 번이라도 손이 닿았으면 안 묻는다.**
   *
   *   고른 것이 있다   물어본 뒤 답한 것이다
   *   말 속에 있다     이미 말했는데 또 물으면 안 들은 것이 된다
   *   붙인 것이 있다   그 결을 따라가는 것이 기본이라 물을 자리가 아니다
   */
  const asks = !고른비율 && !고른결 && !말한비율 && !말한결 && input.attachmentCount === 0;

  return {
    asks,
    ratio: 고른비율 ?? 말한비율 ?? EASY_DEFAULT_RATIO,
    look: 고른결 ?? 말한결 ?? EASY_DEFAULT_LOOK,
  };
}
