import { lookNeedsReference, resolveLook, type ImageLook } from "@fixup/shared";

/**
 * **따를 그림이 없어진 `auto` 를 되돌린다**(A-10).
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * `auto` 는 「붙인 레퍼런스의 결을 따른다」는 뜻이다. 그런데 레퍼런스를 빼거나
 * 토글을 꺼도 **값은 `auto` 로 남았다.** 화면은 그 단추를 흐리게 만들 뿐이라,
 * 사용자는 여전히 `auto` 가 골라진 것을 보면서 **무엇을 따르는지 알 수 없다.**
 *
 * 서버 쪽은 U-06 에서 막았다(`resolveLook` 으로 기획 프롬프트가 없는 그림을
 * 가리키지 않게). 여기서는 **화면의 값 자체**를 되돌리고 그 사실을 알린다.
 *
 * 설계 §6.3: 「`auto` 그림체의 레퍼런스를 제거/비활성화하면 유효한 기본
 * 그림체로 복구하고 **알린다.**」
 *
 * ── 조용히 바꾸지 않는다 ─────────────────────────────────────
 *
 * 값만 되돌리면 사용자가 고른 것이 **혼자 사라진 것**처럼 보인다. 무슨 일이
 * 있었는지 함께 돌려준다.
 */

export interface LookRecovery {
  look: ImageLook;
  notice: string;
}

/**
 * 되돌릴 것이 있으면 되돌린 값과 알릴 말을, 없으면 `null` 을.
 *
 * **사람이 고른 결은 건드리지 않는다.** 일러스트·애니는 레퍼런스가 없어도 혼자
 * 설 수 있다 — 되돌리는 것은 따를 그림이 있어야만 뜻이 서는 `auto` 뿐이다.
 */
export function recoverLookWithoutReference(
  look: ImageLook,
  hasReference: boolean,
): LookRecovery | null {
  if (!lookNeedsReference(look) || hasReference) return null;

  const next = resolveLook(look, false);
  return {
    look: next,
    notice: "따라 만들 레퍼런스가 없어 그림체를 기본값으로 되돌렸습니다. 레퍼런스를 다시 붙이면 그 결을 따를 수 있습니다.",
  };
}
