/**
 * 팀 크레딧 — 값을 다루는 규칙만.
 *
 * DB 도 세션도 안 만진다. 돈이 오가는 계산이라 그 판단만 따로 떼어 시험할 수
 * 있어야 한다.
 */

/**
 * 적을 수 있는 최대값. **DB 의 check 와 같아야 한다.**
 *
 * 팀과 개인이 다르다. 개인은 `profiles.monthly_quota` 가 10000 이고, 팀은
 * `teams.monthly_quota` 가 1000000 이다. 하나로 뭉뚱그리면 화면에서는 통과한
 * 값이 DB 에서 「23514」로 막히고, 사용자에게는 무엇이 잘못됐는지 안 보인다 —
 * 2026-09-04 에 예약 상한이 딱 그렇게 터졌다.
 *
 * 관리자 화면(`admin/actions.ts`)의 개인 상한 검사도 같은 10000 이다. 그쪽은
 * 팀과 무관한 옛 코드라 굳이 이 상수를 끌어가게 고치지 않았다 — 다만 값이
 * 갈리면 두 화면이 서로 못 고치는 값을 만든다는 것을 여기 적어 둔다.
 */
export const TEAM_QUOTA_MAX = 1000000;
export const PERSONAL_QUOTA_MAX = 10000;

export interface MemberUsage {
  userId: string;
  email: string;
  role: "leader" | "member";
  /**
   * 이번 달 쓴 것 + 잡아 둔 것. **어느 팀에서 썼든 전부.**
   *
   * 개인 상한과 비교하는 값이라 팀을 안 가린다 — 예약 함수도 이 사람의
   * 이벤트를 팀과 무관하게 더해 개인 상한과 비교한다.
   */
  used: number;
  /**
   * 그중 **이 팀에 달린 것만.**
   *
   * DB 의 `team_units_used()` 가 `generation_events.team_id` 로 세기 때문에
   * 팀 잔량은 이 값으로 셈해야 한다. 팀을 옮겨 온 사람은 옛 팀에서 쓴 것이
   * `used` 에는 있고 여기에는 없다.
   */
  usedInTeam: number;
  /** 이 사람의 개인 상한. */
  personalQuota: number;
}

export interface TeamCredit {
  /** 팀 한도. **0 은 「아직 안 정했다」** — 그때는 개인 상한만 본다. */
  quota: number;
  /**
   * 이 팀에 달린 이번 달 사용량 전부. **지금 팀원이 아닌 사람 것도 포함한다.**
   *
   * 예전에는 화면이 현재 팀원의 `used` 를 더해서 이 값을 대신했다. 그런데 DB 의
   * `team_units_used()` 는 `team_id` 로 세고 `generation_events.team_id` 는
   * 배정 때 소급 갱신되지 않는다. 그래서 달 중간에 사람이 빠지면 화면은
   * 「60장 남음」인데 DB 는 옛 이벤트를 계속 세어 11장째부터 막았다.
   */
  teamUsed: number;
  members: MemberUsage[];
}

/* ── 한도 ─────────────────────────────────────────────────────── */

function quotaError(raw: string, max: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "숫자를 적어 주세요.";
  if (!/^\d+$/.test(trimmed)) return "0 이상의 정수만 적을 수 있습니다.";
  if (Number(trimmed) > max) return `${max.toLocaleString("ko-KR")} 을 넘길 수 없습니다.`;
  return null;
}

export function teamQuotaError(raw: string): string | null {
  return quotaError(raw, TEAM_QUOTA_MAX);
}

export function personalQuotaError(raw: string): string | null {
  return quotaError(raw, PERSONAL_QUOTA_MAX);
}

/**
 * 한도를 안 정했을 때 화면이 제안할 값.
 *
 * 팀원 개인 상한의 합이다. **팀을 만든 순간 쓸 수 있는 양이 줄면 그건
 * 사고다** — 지금까지 각자 쓰던 만큼을 그대로 더한 것이 최소한의 출발점이다.
 */
export function suggestedQuota(members: readonly MemberUsage[]): number {
  return members.reduce((sum, member) => sum + member.personalQuota, 0);
}

/* ── 잔량 ─────────────────────────────────────────────────────── */

export interface TeamBalance {
  quota: number;
  used: number;
  remaining: number;
  /** 막대에 쓸 비율 0–1. 한도가 없으면 0 이다 — 0 으로 나누지 않는다. */
  ratio: number;
  /** 한도를 아직 안 정했나. 그때는 팀 한도가 아무것도 안 막는다. */
  unset: boolean;
  /** 이미 쓴 것이 한도를 넘었나. 한도를 나중에 내리면 그럴 수 있다. */
  over: boolean;
}

export function balanceOf(credit: TeamCredit): TeamBalance {
  // **DB 와 같은 기준으로 센다.** 현재 팀원을 더하면 빠져나간 사람이 쓴 것이
  // 화면에서만 사라져, 남았다고 뜨는데 만들면 막힌다.
  const used = credit.teamUsed;
  const unset = credit.quota === 0;
  return {
    quota: credit.quota,
    used,
    // 한도를 안 정했으면 「남은 것」이라는 말이 성립하지 않는다. 0 으로 두고
    // 화면이 「정하지 않음」이라고 말한다 — 큰 숫자를 지어내 보여주면 그만큼
    // 쓸 수 있다는 뜻이 된다.
    remaining: unset ? 0 : Math.max(0, credit.quota - used),
    ratio: unset ? 0 : Math.min(1, used / credit.quota),
    unset,
    over: !unset && used > credit.quota,
  };
}

/**
 * 이 사람이 이번 달에 실제로 쓸 수 있는 최대치.
 *
 * DB 의 `effective_quota()` 와 **같은 규칙이어야 한다.** 화면이 다른 답을 내면,
 * 40 이 남았다고 떠 있는데 만들면 막힌다 — 그 상태는 고장으로 보인다.
 */
export function effectiveQuotaOf(credit: TeamCredit, member: MemberUsage): number {
  if (credit.quota === 0) return member.personalQuota;
  // DB 의 `team_units_used(team, period, exclude_user)` 와 같은 셈이다 —
  // 팀에 달린 전부에서 내 몫만 뺀다.
  const others = Math.max(0, credit.teamUsed - member.usedInTeam);
  const outsideTeam = Math.max(0, member.used - member.usedInTeam);
  return Math.min(member.personalQuota, Math.max(0, credit.quota - others) + outsideTeam);
}
