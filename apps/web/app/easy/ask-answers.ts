import { EASY_DEFAULT_RATIO, EASY_LOOKS, EASY_RATIOS } from "./ask";
import type { EasyPick } from "./ask-chain";
import type { EasyResend } from "./cardnews-state";
import { photoAnswer, type PhotoAskState } from "./photo-ask-state";

/**
 * **단추로 한 답**(2026-10-07 2차 설계 D1 · §3-1). 화면이 보내는 것은 단추 글 · 물음 줄 id · 고른
 * 값뿐이다 — 처음 말은 서버가 대화 줄에서 잇는다. 화면 안에 두면 값으로 못 잰다.
 */
export interface EasyButtonReply {
  /** 사용자 말로 보일 글. */
  text: string;
  answersRowId: string;
  pick: EasyPick;
}

export const KIND_REPLY_TEXT = { image: "이미지 한 장", cardnews: "카드뉴스 여러 장" } as const;

export function kindReply(rowId: string, kind: "image" | "cardnews"): EasyButtonReply {
  return { text: KIND_REPLY_TEXT[kind], answersRowId: rowId, pick: { kind } };
}

/**
 * 「이대로 만들기」(1차 B1): 아무것도 안 골랐으면 **기본 비율을 고른 값으로** 싣는다. 빈 값으로
 * 보내면 서버가 「안 골랐다」로 보고 같은 물음을 또 띄운다.
 */
export function ratioReply(rowId: string, picked: { ratio: string; look: string }): EasyButtonReply {
  const 이름 = [
    EASY_RATIOS.find((one) => one.id === picked.ratio)?.label,
    EASY_LOOKS.find((one) => one.id === picked.look)?.label,
  ].filter(Boolean).join(" · ");
  return {
    text: 이름 ? `이걸로 만들기 (${이름})` : "이대로 만들기",
    answersRowId: rowId,
    pick: { ratio: picked.ratio || EASY_DEFAULT_RATIO, ...(picked.look ? { look: picked.look } : {}) },
  };
}

/** 사진 단추 — 모든 줄의 고른 쓰임을 싣는다. 서버는 고른 사진을 안 읽는다(설계 §2-5). */
export function photoReply(rowId: string, state: PhotoAskState): EasyButtonReply {
  return { text: "이걸로 만들기", answersRowId: rowId, pick: { photoRoles: photoAnswer(state).photoRoles } };
}

/**
 * 사진 고르기가 열린 채 **말로 친 답**(1차 설계 §2-5 그대로, 2차 최종 리뷰 8). 입력창 안내도 「위 사진 물음에
 * 대한 답으로 보냅니다」다. 그 말과 손댄 줄의 쓰임을 그 물음의 답으로 싣는다 — `typed` 라 서버가 그 말을
 * 처음 말 뒤에 잇는다. 이 답은 판단 모델을 안 부른다(물음 줄의 판단으로 간다).
 */
export function photoTypedReply(rowId: string, state: PhotoAskState, text: string): EasyButtonReply {
  return { text, answersRowId: rowId, pick: { photoRoles: photoAnswer(state, text).photoRoles, typed: true } };
}

/** 레퍼런스 요청의 답 — 붙인 그림은 분위기 참고로 확정해 싣는다(`referenceAnswer`). 갈래는 카드뉴스다. */
export function referenceReply(rowId: string, answer: Pick<EasyResend, "photoRoles" | "photoSlots">): EasyButtonReply {
  return {
    text: "이걸로 만들기",
    answersRowId: rowId,
    pick: {
      kind: "cardnews",
      ...(answer.photoRoles?.length ? { photoRoles: answer.photoRoles } : {}),
      ...(answer.photoSlots?.length ? { photoSlots: answer.photoSlots } : {}),
    },
  };
}
