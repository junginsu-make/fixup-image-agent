import type { CharacterReferenceRole } from "@fixup/pdp-core";
import { resolveLook, type ImageLook } from "@fixup/shared";

/**
 * **「레퍼런스 스타일」은 한 스위치가 두 자리에 나오는 것이다.**
 *
 * 화면에 고를 곳이 둘 있다.
 *
 *   · 그림체 — 「레퍼런스 스타일」
 *   · 이 그림의 역할 — 「레퍼런스 스타일」(전에는 「결만 따라 만들기」)
 *
 * **둘은 같은 뜻이다.** 따로 움직이면 사용자는 「이 둘이 뭐가 다르지」부터
 * 풀어야 한다. 그래서 하나를 고르면 다른 하나가 따라온다.
 *
 * ── 프롬프트가 이미 그렇게 전제한다 ──────────────────────
 *
 * 이건 화면 편의가 아니라 **모델에 가는 글이 요구하는 것**이다
 * (`pdp-core/src/pdp.character.ts` 의 `referenceDirective`).
 *
 *   역할 `style`   → 「Imitate **only** its rendering style」
 *   역할 `extract` → 「The rendering style is **NOT** part of what you copy.
 *                     How it is drawn … is **set separately below**」
 *
 * 그러니 `extract` 는 구체적인 그림체가 **있어야** 한다. 「뽑아내기 + 레퍼런스
 * 스타일」을 허용하면, 지시문은 「화풍은 아래에서 정한다」고 말하는데 아래에
 * 아무 말도 없는 프롬프트가 나간다 — 모델이 제멋대로 고른다.
 *
 * 거꾸로 `style` 에 구체적인 그림체를 붙이면 「화풍만 베껴라」와 「애니로
 * 그려라」가 한 프롬프트에서 부딪힌다.
 */

/** 역할을 고를 때 그림체가 어떻게 되나. */
export function lookAfterRole(role: CharacterReferenceRole, look: ImageLook): ImageLook {
  if (role === "style") return "auto";
  /*
   * 「뽑아내기」는 그림체를 따로 정해야 한다. 「레퍼런스 스타일」이던 것은 내린다.
   *
   * **내려갈 곳을 여기서 정하지 않는다.** 서버가 첨부 없는 `auto` 를 떨어뜨리는
   * 곳과 같아야 하고(`resolveLook`), 두 곳에 적으면 갈라진다. 「첨부가 없을 때
   * 갈 곳」을 물어보면 그 답이 그대로 쓸 수 있다.
   */
  return look === "auto" ? resolveLook("auto", false) : look;
}

/** 그림체를 고를 때 역할이 어떻게 되나. */
export function roleAfterLook(look: ImageLook): CharacterReferenceRole {
  return look === "auto" ? "style" : "extract";
}
