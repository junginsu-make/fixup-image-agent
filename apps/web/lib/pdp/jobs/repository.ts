import type { PdpJobEvent, PdpJobState } from "./state";

/**
 * 생성 작업을 어디에 적어 두는가.
 *
 * ── 왜 계약을 따로 두나 ────────────────────────────────────────
 *
 * 운영은 Supabase, 로컬은 파일이다(설계 §8.1). 두 구현이 **같은 답을 내야**
 * 로컬에서 본 동작을 운영에서 믿을 수 있다. 계약을 글로만 적어 두면 한쪽이
 * 조용히 달라지므로, 같은 시험을 두 구현에 돌릴 수 있게 인터페이스로 못 박는다.
 *
 * ── 저장소가 지키는 것 ────────────────────────────────────────
 *
 *   1. 같은 요청을 두 번 받아도 한 번만 만든다 (`createOrGet`)
 *   2. 남의 작업은 못 읽고 못 바꾼다 (`get`·`advance` 가 userId 를 요구한다)
 *   3. 두 워커가 동시에 잡아도 하나만 (`claimNext`)
 *   4. 결과는 어떤 실패에도 안 사라진다 (`recordItem`)
 *
 * **base64 원본은 여기 안 담는다.** 그림은 스토리지에 두고 경로만 적는다
 * (설계 §8.1). 담기 시작하면 DB 가 붓고, 행 하나를 읽을 때마다 수 MB 가 온다.
 */

export interface CreateJobInput {
  userId: string;
  teamId: string | null;
  /** 화면이 쥐고 있는 요청 식별자. 같은 눌림이면 같은 값이다. */
  idempotencyKey: string;
  /** 요청 내용의 지문. key 가 같아도 이것이 다르면 다른 작업이다. */
  fingerprint: string;
  documentId: string;
  revision: number;
  operation: string;
  sectionIds: string[];
  /** 크레딧 예약 식별자. 서버가 정한다 — 클라이언트가 제출하지 않는다. */
  reservationRequestId: string;
}

export type CreateJobResult =
  | { kind: "created"; jobId: string }
  | { kind: "existing"; jobId: string }
  | { kind: "conflict"; reason: "fingerprint_mismatch" };

/** 섹션 한 장의 결과. **그림이 아니라 그림이 있는 곳**을 적는다. */
export interface JobItemRecord {
  sectionId: string;
  /** 몇 번째 시도인가. QA 재시도가 붙으면 늘어난다. */
  attempt: number;
  providerRequestId?: string;
  model?: string;
  /** 스토리지 경로. 첫 칸이 소유자다(`{userId}/pdp/...`). */
  outputPath?: string;
  qa?: unknown;
  errorCode?: string;
  costUsd?: number;
}

export interface JobRecord {
  id: string;
  userId: string;
  teamId: string | null;
  documentId: string;
  revision: number;
  operation: string;
  sectionIds: string[];
  reservationRequestId: string;
  /** 이 작업을 만든 요청 식별자. 같은 값이 다시 오면 이 작업을 돌려준다. */
  idempotencyKey: string;
  fingerprint: string;
  state: PdpJobState;
  /** 지금 누가 돌리고 있는가. 없으면 아무도 안 잡았다. */
  leaseUntil: string | null;
  leaseOwner: string | null;
  items: JobItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PdpJobRepository {
  createOrGet(input: CreateJobInput): Promise<CreateJobResult>;
  /** 소유자만 읽는다. 남이면 `null` — 있는지 없는지도 알려 주지 않는다. */
  get(jobId: string, userId: string): Promise<JobRecord | null>;
  /** 소유자만 바꾼다. 남이면 던진다. */
  advance(jobId: string, userId: string, event: PdpJobEvent): Promise<JobRecord>;
  /**
   * 돌릴 작업 하나를 **원자적으로** 잡는다.
   *
   * 잡은 워커가 죽으면 `leaseMs` 가 지나 풀린다 — 그래야 작업이 영영 멈추지 않는다.
   */
  claimNext(workerId: string, leaseMs: number): Promise<JobRecord | null>;
  /** 섹션 결과를 적는다. 같은 (섹션, 시도)는 덮어쓴다. */
  recordItem(jobId: string, item: JobItemRecord): Promise<void>;
}
