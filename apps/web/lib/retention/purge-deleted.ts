/**
 * **회원이 지운 것은 6개월 뒤 저절로 완전히 지운다**(2026-10-08 사용자 결정 — 계획 3단계).
 *
 * 회원이 지우면 줄·파일을 남기고 지운 때만 적는다(1·2단계). 하루 한 번 서버 타이머가
 * `/api/internal/purge-deleted` 를 부르고, 그 주소가 여기서 6개월 지난 것을 관리자 완전 삭제와 **같은 함수로**
 * 지운다(`purge-targets.ts`) — 지우는 규칙(사본·각도·옛 라이브러리 그림)이 두 군데로 갈리지 않게.
 *
 * 묶음(50건)씩 하나하나 지운다 — 서버 램이 작다(911MB). 묶음이 꽉 차면 시간 예산(5분) 안에서 다음 묶음을 잇는다
 * — 하루 50건으로 자르면 많이 지우는 날 밀린 것이 계속 쌓인다. 예산은 한 건마다 본다(타이머의 10분 제한 안에 끝나게).
 * 실패한 것은 그 회차에서 건너뛴다 — 늘 실패하는 것이 맨 앞에 쌓여 그 갈래가 못 나아가는 일이 없게. 몇 건
 * 지웠는지·실패했는지·남았는지 기록한다.
 */
export const RETENTION_MONTHS = 6;
/** 한 묶음의 수. */
export const PURGE_BATCH = 50;
/** 한 회차의 시간 예산. 한 건마다 보므로 타이머 스크립트의 curl 제한(10분) 안에 넉넉히 끝난다. */
export const PURGE_BUDGET_MS = 5 * 60 * 1000;

export type PurgeKind = "sns" | "poster" | "library" | "pdp" | "characters" | "references" | "easy";

export interface PurgeItem {
  id: string;
  /** 주인. 지우기 함수가 주인 폴더 안만 지운다. */
  owner: string;
  /** 상세페이지 문서의 옛 저장분(옛 라이브러리 그림 정리에 쓴다). */
  sourceDraftId?: string | null;
}

export interface PurgeTarget {
  kind: PurgeKind;
  /** `cutoff` 보다 먼저 지운 것을 오래된 것부터 `limit` 개까지. `skip` 의 id 는 뺀다(이번 회차에 실패한 것). */
  list(cutoff: string, limit: number, skip: readonly string[]): Promise<PurgeItem[]>;
  purge(item: PurgeItem): Promise<void>;
}

export type PurgeReport = Partial<Record<PurgeKind, { purged: number; failed: number; listFailed?: true; more?: true }>>;

/**
 * 6개월 전 같은 시각(달력 기준). **달말은 그 달 마지막 날로 맞춘다** — 8월 31일의 6개월 전을 3월 3일로 넘기면
 * 6개월을 덜 채우고 지운다. 받은 시각은 바꾸지 않는다.
 */
export function purgeCutoff(now: Date): Date {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RETENTION_MONTHS, 1));
  const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    month.getUTCFullYear(), month.getUTCMonth(), Math.min(now.getUTCDate(), lastDay),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds(),
  ));
}

/** 갈래를 하나씩, 그 안도 하나씩 지운다 — 동시에 돌리면 작은 서버의 램이 한꺼번에 찬다. */
export async function runPurge(
  targets: readonly PurgeTarget[],
  now: Date,
  limit = PURGE_BATCH,
  options: { budgetMs?: number; clock?: () => number } = {},
): Promise<PurgeReport> {
  const cutoff = purgeCutoff(now).toISOString();
  const clock = options.clock ?? Date.now;
  const deadline = clock() + (options.budgetMs ?? PURGE_BUDGET_MS);
  const report: PurgeReport = {};
  for (const target of targets) {
    report[target.kind] = await purgeKind(target, cutoff, limit, () => clock() > deadline);
  }
  return report;
}

async function purgeKind(target: PurgeTarget, cutoff: string, limit: number, overBudget: () => boolean) {
  const skip: string[] = [];
  const done = new Set<string>();
  let purged = 0;
  for (;;) {
    let items: PurgeItem[];
    try {
      items = await target.list(cutoff, limit, skip);
    } catch (error) {
      console.error(`[purge] ${target.kind} 목록을 읽지 못했습니다`, error instanceof Error ? error.message : error);
      return { purged, failed: skip.length, listFailed: true as const };
    }
    // 지웠다고 했는데 다시 나오면 같은 것을 예산이 다할 때까지 되풀이한다 — 이 갈래를 멈추고, 지운 수에서 빼
    // 실패로 센다(주소가 500 으로 답해 타이머 기록에 남는다).
    const again = items.filter((item) => done.has(item.id)).length;
    if (again) {
      console.error(`[purge] ${target.kind} 지운 것이 목록에 다시 나와 멈춥니다`);
      return { purged: purged - again, failed: skip.length + again, more: true as const };
    }
    for (const item of items) {
      if (overBudget()) return { purged, failed: skip.length, more: true as const };
      try {
        await target.purge(item);
        done.add(item.id);
        purged += 1;
      } catch (error) {
        skip.push(item.id);
        console.error(`[purge] ${target.kind} ${item.id} 을 지우지 못했습니다`, error instanceof Error ? error.message : error);
      }
    }
    if (items.length < limit) return { purged, failed: skip.length };
  }
}
