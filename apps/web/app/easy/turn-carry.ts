import { EASY_DEFAULT_RATIO } from "./ask";
import type { EasyResend } from "./cardnews-state";

/**
 * **같은 말에 이어 답할 때 싣는 것**(2026-10-06 설계 B1 · B2). 화면 안에 두면 값으로 못
 * 잰다. 갈래(kind)는 `cardnews-state.ts` 의 `continuingKind` 가 이미 잇는다 — 여기는
 * 비율 · 그림체다.
 */
export interface EasyCarry {
  ratio?: string;
  look?: string;
}

/**
 * 「이대로 만들기」(B1). 아무것도 안 골랐으면 **기본 비율을 고른 값으로** 싣는다. 빈 값을
 * 빼고 보내면 서버가 「안 골랐다」로 보고 같은 물음을 또 띄웠다.
 */
export function askSubmission(prompt: string, picked: { ratio: string; look: string }): EasyResend {
  return { prompt, ratio: picked.ratio || EASY_DEFAULT_RATIO, ...(picked.look ? { look: picked.look } : {}) };
}

/**
 * 이번에 실을 비율 · 그림체(B2). 같은 말에 이어 답하면(`continuing`) 앞서 고른 것에 이번에
 * 고른 것을 덮어 싣는다. **새로 친 말이면 비운다** — 다른 주문에 옛 값이 몰래 붙지 않게.
 * 돌려준 값이 곧 다음 묶음이다.
 */
export function carryChoices(input: { continuing: boolean; carry: EasyCarry; picked?: EasyCarry }): EasyCarry {
  if (!input.continuing) return {};
  const ratio = input.picked?.ratio || input.carry.ratio;
  const look = input.picked?.look || input.carry.look;
  return { ...(ratio ? { ratio } : {}), ...(look ? { look } : {}) };
}
