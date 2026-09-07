/**
 * 「무엇이 보이나」를 정하는 한 곳.
 *
 * 4단계에서 RLS 를 팀 기준으로 넓혔는데, 그것만으로는 아무것도 안 보인다.
 * 읽는 코드가 `.eq("user_id", me)` 로 **다시 좁히기** 때문이다. 정책이
 * 열어 준 문 앞에서 코드가 스스로 문을 닫고 있었다.
 *
 * 게다가 절반은 서비스 롤로 읽는다(라이브러리·캐릭터). 거기서는 RLS 가
 * 아예 안 걸리므로, **이 필터가 유일한 문지기**다. 정책을 아무리 넓혀도
 * 그쪽은 코드를 안 고치면 안 열린다 — 그래서 정책이 아니라 필터를 옮긴다.
 *
 * ── 오늘은 아무 일도 안 일어난다 ─────────────────────────────────
 *
 * 팀에 아무도 없으면 `teamId` 가 `null` 이고, 그때 이 필터는 정확히
 * 「내 것」이다. 지금과 같은 답이다. 배정이 시작되는 날부터 달라진다.
 */

export interface ViewScope {
  userId: string;
  /** 이 사람의 팀. 없으면 개인이다. */
  teamId: string | null;
  /** 운영자는 전부 본다. 필터를 안 건다. */
  isAdmin: boolean;
}

/**
 * PostgREST 의 `.or()` 에 넣을 조건.
 *
 * 「같은 팀 것 **또는** 내 것」이다. 뒤쪽을 늘 넣는 이유는, 내가 만든 것이
 * 나에게 안 보이는 경우를 만들지 않기 위해서다 — 팀을 옮기는 중이거나
 * 손으로 팀을 고친 행이 있어도, 자기 작업물이 사라지지는 않는다.
 *
 * 운영자와 개인에게는 `null` 을 준다. 부르는 쪽이 각각 「필터 없음」과
 * 「내 것만」으로 처리한다.
 */
export function teamOrFilter(scope: ViewScope): string | null {
  if (scope.isAdmin || !scope.teamId) return null;
  return `team_id.eq.${scope.teamId},user_id.eq.${scope.userId}`;
}

/** 질의에서 이 함수가 쓰는 것만. 실제 빌더 타입을 안 끌어온다. */
interface Filterable {
  eq(column: string, value: string): unknown;
  or(filter: string): unknown;
}

/**
 * 질의에 범위를 건다.
 *
 * 세 갈래가 한 곳에 모여 있어야 한다. 부르는 자리마다 `if (isAdmin)` 를
 * 적으면, **한 곳을 빠뜨렸을 때 남의 것이 보인다.** 빠뜨린 쪽이 안전한
 * 방향으로 틀리지 않는 종류의 실수다.
 *
 * 지우기에는 안 쓴다. 4단계에서 정한 대로 읽기만 넓어지고, 지우기는
 * 주인만 한다.
 *
 * **캐스팅이 여기 한 곳에만 있다.** `Q extends { eq(...): Q }` 로 적으면
 * 타입이 자기를 다시 가리켜, Supabase 빌더와 만나면 전개가 안 끝난다
 * (TS2589). 부르는 쪽의 타입은 그대로 두고 안쪽만 좁게 본다.
 */
export function scopedRead<Q>(query: Q, scope: ViewScope): Q {
  if (scope.isAdmin) return query;
  const filterable = query as unknown as Filterable;
  const or = teamOrFilter(scope);
  return (or ? filterable.or(or) : filterable.eq("user_id", scope.userId)) as Q;
}
