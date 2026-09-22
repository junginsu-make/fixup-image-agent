/**
 * 회원 이름·추천인(2026-09-22 사용자 결정, 마이그레이션 202609220005).
 *
 * **추천인은 검증하지 않는 입력란이다.** 코드든 이름이든 적은 그대로 담는다. 제도를
 * 만드는 날(코드 발급·보상) 이 값이 원자료가 되고, 그날 추천인 수정을 잠근다 — 안
 * 잠그면 보상을 받은 뒤 추천인을 바꿀 수 있다.
 *
 * **따로 읽는다.** 이 두 칸을 모든 화면이 쓰는 회원 조회(`getMembership`)에 넣으면,
 * 마이그레이션을 돌리기 전 서버에서 모든 화면이 「칸이 없다」로 죽는다. 이 값이 필요한
 * 곳(계정·관리자)만 따로 읽고, 칸이 없으면 빈 값으로 둔다.
 */

export const PROFILE_LIMITS = { name: 40, referrer: 100 } as const;

/** 가입 트리거의 `public.profile_text` 와 같은 규칙. 둘이 다르면 검색이 한쪽만 찾는다. */
export function cleanProfileText(value: string | null | undefined, limit: number): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  // 자른 뒤 한 번 더 걷는다. 앞에서 걷고 자르면 끝에 공백이 남을 수 있다(SQL 쪽도 같다).
  const cut = [...text].slice(0, limit).join("").trim();
  return cut || null;
}

/** 고칠 때 검사. 자르지 않고 알려 준다 — 조용히 잘리면 저장된 것이 적은 것과 다르다. */
export function profileInputError(input: { name: string; referrer: string }): string | null {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  const referrer = String(input.referrer ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "이름을 적어 주세요.";
  if ([...name].length > PROFILE_LIMITS.name) return `이름은 ${PROFILE_LIMITS.name}자까지 적을 수 있습니다.`;
  if ([...referrer].length > PROFILE_LIMITS.referrer) return `추천코드는 ${PROFILE_LIMITS.referrer}자까지 적을 수 있습니다.`;
  return null;
}

/** 칸이 아직 없는 서버인가 — PostgreSQL `42703`(없는 칸), PostgREST `PGRST204`(스키마 캐시에 없음). */
export function missingProfileColumns(error: { code?: string } | null): boolean {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204"));
}

export interface ProfileExtras {
  displayName: string | null;
  referrer: string | null;
}
