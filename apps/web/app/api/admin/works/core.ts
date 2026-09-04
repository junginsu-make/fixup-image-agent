/**
 * 관리자가 보는 전체 작업물 — 값을 다루는 규칙만 모은 곳.
 *
 * DB 도 Storage 도 여기서는 만지지 않는다. **무엇을 더 실어 보내는가**가 이
 * 기능에서 가장 위험한 판단이라, 그 판단만 따로 떼어 시험할 수 있게 둔다.
 */

/** 소유자 정보를 덧댄 한 줄. 원래 모양은 그대로 두고 두 칸만 더한다. */
export interface OwnedRow {
  userId?: string;
  ownerEmail: string | null;
  /** 내가 만든 것인가. 화면은 이 값으로 지우기 단추를 가른다. */
  mine: boolean;
}

/**
 * 소유자 두 칸을 덧댄다.
 *
 * 회원 목록과 **같은 모양**을 유지한다. 관리자용이라고 다른 모양을 주면
 * 화면이 두 벌의 변환을 갖게 되고, 한쪽만 고치는 날이 반드시 온다.
 *
 * `mine` 을 여기서 계산해 화면에 넘기는 이유는 하나다. 관리자는 남의 작업을
 * **보기만** 한다 — 지우기는 자기 것만이다. 화면이 스스로 판단하게 두면
 * 남의 작업에 지우기 단추가 뜨고, 눌러도 아무 일이 안 일어난다.
 */
export function withOwner<T extends { userId?: string }>(
  rows: readonly T[],
  viewerId: string,
  emails: ReadonlyMap<string, string>,
): Array<T & OwnedRow> {
  return rows.map((row) => ({
    ...row,
    ownerEmail: row.userId ? emails.get(row.userId) ?? null : null,
    mine: row.userId === viewerId,
  }));
}

/**
 * 이메일을 물어볼 사람들.
 *
 * 중복을 없애고 빈 값을 버린다. 작업이 200 건이어도 만든 사람은 몇 명뿐이라,
 * 그대로 물으면 같은 사람을 수십 번 조회한다.
 */
export function ownerIdsOf(rows: ReadonlyArray<{ userId?: string }>): string[] {
  return [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
}
