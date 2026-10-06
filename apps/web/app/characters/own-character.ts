import type { CharacterReferenceRole } from "@fixup/pdp-core";

/**
 * 「내 캐릭터」 칸의 규칙.
 *
 * 지킬 대상은 하나여야 한다. 내 캐릭터가 있으면 참고할 그림은 **레퍼런스
 * 스타일**(화풍·몸 비율)로만 쓴다 — 서버도 같은 조합을 거절한다
 * (`OWN_WITH_EXTRACT_MESSAGE`). 2026-10-06 사용자 결정.
 */

export const OWN_EXTRACT_BLOCKED = "내 캐릭터를 넣으면 쓸 수 없습니다. 참고할 그림은 레퍼런스 스타일로만 씁니다.";
export const OWN_LOOK_LOCKED =
  "내 캐릭터를 참고할 그림의 화풍·체형으로 바꿉니다. 다른 그림체를 쓰려면 참고할 그림을 빼세요.";
export const OWN_STYLE_HINT = "내 캐릭터의 생김새는 지키고, 이 그림의 화풍과 몸 비율(등신)로 다시 그립니다.";

export function roleWithOwn(role: CharacterReferenceRole, hasOwn: boolean): CharacterReferenceRole {
  return hasOwn ? "style" : role;
}

/** 빈 문자열이면 안 잠근다. 잠그면 그 이유를 단추 아래에 적는다. */
export function lookLockedByPair(hasOwn: boolean, hasReference: boolean): string {
  return hasOwn && hasReference ? OWN_LOOK_LOCKED : "";
}

/**
 * 붙인 그림 둘의 base64 글자 수 합 한도. base64 는 1.33배로 부풀고 앱의 요청 상한은 16MB 다.
 * 15_000_000 글자 ≈ 그림 11MB. 그림을 줄이지 않고 올리기 전에 막는다.
 */
export const IMAGES_BASE64_MAX = 15_000_000;
export const IMAGES_TOO_LARGE_MESSAGE = "붙인 그림이 너무 큽니다. 두 그림을 합쳐 약 11MB 이하로 올려 주세요.";

export function imagesTooLarge(
  attached: { base64: string } | null | undefined,
  own: { base64: string } | null | undefined,
): boolean {
  return (attached?.base64.length ?? 0) + (own?.base64.length ?? 0) > IMAGES_BASE64_MAX;
}
