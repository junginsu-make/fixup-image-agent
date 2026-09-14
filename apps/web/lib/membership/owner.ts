/**
 * 소유자 계정 — 관리자 중에서도 건드릴 수 없는 한 사람.
 *
 * 관리자가 둘이 되면서 서로를 지우거나 정지시킬 수 있게 되었다. 그러면
 * **되돌릴 방법이 없는 사고**가 한 번의 실수로 일어난다. 관리자를 내리는 길은
 * 화면에 없고 DB 를 직접 열어야 하는데, 그 DB 를 여는 사람이 방금 지워진
 * 계정일 수 있다.
 *
 * 그래서 한 계정을 못 건드리게 고정한다. 이 계정은 다른 관리자를 지울 수
 * 있지만, 다른 관리자는 이 계정에 아무것도 못 한다.
 */

/**
 * 환경변수가 없을 때 쓰는 값.
 *
 * **비워 두지 않는다.** 없으면 아무도 보호받지 못하는데, 그 사실은 사고가
 * 난 뒤에야 드러난다. 운영에서 환경변수를 한 줄 빠뜨리는 것은 흔한 일이다.
 */
export const OWNER_EMAIL_FALLBACK = "9843ohs@gmail.com";

/** 주소 비교는 대소문자와 공백을 무시한다. 사람이 손으로 적는 값이다. */
function normalize(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** 설정에서 읽은 값을 다듬는다. 비어 있으면 기본값으로 돌아간다. */
export function resolveOwnerEmail(raw: string | null | undefined): string {
  return normalize(raw) || normalize(OWNER_EMAIL_FALLBACK);
}

/** 이 주소가 소유자인가. */
export function isOwnerEmail(email: string | null | undefined, owner: string): boolean {
  const target = normalize(email);
  return target.length > 0 && target === normalize(owner);
}

/**
 * 이 사람이 저 사람을 손댈 수 있나.
 *
 * 소유자는 누구든 손댈 수 있다. 나머지는 소유자만 못 손댄다 — 나머지끼리는
 * 지금까지대로다.
 */
export function canManageTarget(options: {
  actorEmail: string | null | undefined;
  targetEmail: string | null | undefined;
  owner: string;
}): boolean {
  const { actorEmail, targetEmail, owner } = options;
  if (isOwnerEmail(actorEmail, owner)) return true;
  return !isOwnerEmail(targetEmail, owner);
}

/**
 * 관리자 계정을 지울 수 있나.
 *
 * **소유자만 지운다.** 관리자끼리 서로 지우기 시작하면 마지막 한 명이 남을
 * 때까지 되돌릴 방법이 없다. 소유자 자신은 자기를 못 지우므로(그 검사는
 * 부르는 쪽에 있다), 결과적으로 소유자 계정은 화면에서 사라지지 않는다.
 */
export function canDeleteAdmin(actorEmail: string | null | undefined, owner: string): boolean {
  return isOwnerEmail(actorEmail, owner);
}

/** 막혔을 때 화면에 낼 말. 왜 막혔는지 말한다. */
export const OWNER_PROTECTED_MESSAGE =
  "이 계정은 시스템 소유자 계정이라 다른 관리자가 바꿀 수 없습니다.";

export const ADMIN_DELETE_MESSAGE =
  "관리자 계정은 시스템 소유자만 지울 수 있습니다.";
