import type { IngestSourceKind, RawCandidate } from "@fixup/ingest-core";

export const LEASE_MINUTES = 10;
export const DEFAULT_MAX_POLLS_PER_USER_PER_HOUR = 20;

export interface PollSource {
  id: string;
  userId: string;
  kind: IngestSourceKind;
  name: string;
  url: string;
  intervalHours: number;
  enabled?: boolean;
  config: Record<string, unknown>;
  lastCheckedAt?: string | null;
  nextPollAt?: string;
  leaseUntil?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PollResult {
  checked: number;
  collected: number;
  failed: number;
}

export function nextPollAt(from: Date, intervalHours: number): Date {
  return new Date(from.getTime() + intervalHours * 60 * 60 * 1000);
}

export function nextRateWindow(from: Date): Date {
  return new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    from.getUTCHours() + 1,
  ));
}

/**
 * 확인할 차례인 행을 읽고, 조건부 UPDATE로 리스를 얻은 행만 돌려준다.
 *
 * 두 워커가 같은 목록을 읽어도 lease_until 조건을 먼저 갱신한 하나만 행을 받는다.
 */
export async function claimDueSources(now: Date, deps: {
  listDue: (now: Date) => Promise<PollSource[]>;
  claimLease: (source: PollSource, now: Date, leaseUntil: Date) => Promise<PollSource | undefined>;
}): Promise<PollSource[]> {
  const due = await deps.listDue(now);
  const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60 * 1000);
  const claimed: PollSource[] = [];
  for (const source of due) {
    const entry = await deps.claimLease(source, now, leaseUntil);
    if (entry) claimed.push(entry);
  }
  return claimed;
}

/**
 * 한 번 돈다.
 *
 * 한 소스가 실패해도 나머지를 계속한다. 유튜브가 막혔다고 RSS 까지 멈추면 안 된다.
 * 실패와 시간당 상한은 소스 행의 last_error 에 남기고 다음 시각을 예약한다.
 */
export async function pollOnce(deps: {
  now: Date;
  /** 리스를 걸고 확인할 차례인 소스를 가져온다. 중복 실행을 여기서 막는다. */
  claimDue: (now: Date) => Promise<PollSource[]>;
  /** 사용자·UTC 시간 창의 슬롯을 DB에서 원자적으로 얻는다. 생략하면 테스트용 무제한이다. */
  claimUserSlot?: (userId: string, now: Date, limit: number) => Promise<boolean>;
  maxPollsPerUserPerHour?: number;
  fetchFor: (source: PollSource) => Promise<RawCandidate[]>;
  saveCandidates: (rows: Array<RawCandidate & { userId: string; sourceId: string }>) => Promise<number>;
  markChecked: (id: string, next: Date) => Promise<void>;
  markFailed: (id: string, message: string, next: Date) => Promise<void>;
  reportError?: (message: string) => void;
}): Promise<PollResult> {
  const sources = await deps.claimDue(deps.now);
  const limit = deps.maxPollsPerUserPerHour ?? DEFAULT_MAX_POLLS_PER_USER_PER_HOUR;
  let collected = 0;
  let failed = 0;

  const recordFailure = async (id: string, message: string, next: Date): Promise<void> => {
    try {
      await deps.markFailed(id, message, next);
    } catch (error) {
      deps.reportError?.(
        `소스 ${id} 실패 기록을 저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  for (const source of sources) {
    try {
      const allowed = deps.claimUserSlot
        ? await deps.claimUserSlot(source.userId, deps.now, limit)
        : true;
      if (!allowed) {
        failed += 1;
        await recordFailure(
          source.id,
          `시간당 수집 상한(${limit}회)에 도달했습니다. 다음 시간에 다시 시도합니다.`,
          nextRateWindow(deps.now),
        );
        continue;
      }

      const rows = await deps.fetchFor(source);
      collected += await deps.saveCandidates(
        rows.map((row) => ({ ...row, userId: source.userId, sourceId: source.id })),
      );
      await deps.markChecked(source.id, nextPollAt(deps.now, source.intervalHours));
    } catch (error) {
      failed += 1;
      await recordFailure(
        source.id,
        error instanceof Error ? error.message : String(error),
        nextPollAt(deps.now, source.intervalHours),
      );
    }
  }

  return { checked: sources.length, collected, failed };
}
