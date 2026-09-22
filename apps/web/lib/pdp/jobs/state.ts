/**
 * 생성 작업이 지금 어디까지 갔는가.
 *
 * ── 왜 한 곳에 모으나 ──────────────────────────────────────────
 *
 * 화면을 옮기거나 브라우저를 닫아도 **이미 값을 치른 그림**을 되찾아야 한다
 * (설계 §8). 그러려면 서버가 「지금 어디까지 갔나」를 알아야 하는데, 그 판단이
 * 라우트와 워커에 흩어지면 한쪽만 고치는 날 결과를 잃는다. 이 저장소는 그
 * 손실을 이미 겪었다 — 배치 라우트의 `settleAiUsage` 가 `try` 밖에 있어
 * 장부가 흔들리면 만든 그림 전부가 본문 없는 500 과 함께 사라졌다.
 *
 * ── 축이 셋인 이유 ────────────────────────────────────────────
 *
 * **생성·정산·보존은 서로 독립이다.** 하나로 합치면 반드시 한쪽이 다른 쪽을
 * 덮는다.
 *
 *   정산이 실패해도  → 결과는 살아 있어야 한다 (사용자는 그림을 받는다)
 *   그림을 받았어도  → 저장 전에는 「끝났다」고 말하면 안 된다
 *   저장이 실패해도  → **그 결과 URL 로** 다시 시도한다. 새로 그리면 두 번 낸다
 *
 * 여기 있는 것은 순수 함수뿐이다. DB·네트워크를 모른다.
 */

/** 생성 축. 공급자에게 보내고 결과를 받아 보존하기까지. */
export type GenerationState =
  | "validated"
  | "reserved"
  | "submitting"
  | "submitted"
  | "generating"
  | "result_available"
  | "persisted"
  | "completed"
  | "review_required"
  | "partial"
  | "failed";

/** 정산 축. 크레딧 차감과 원가 기록. */
export type SettlementState = "not_started" | "pending" | "settled" | "retry_required";

/** 보존 축. 결과를 우리 저장소에 옮겨 담기. */
export type PersistenceState = "pending" | "stored" | "retry_required";

/**
 * 제출 축. **공급자에게 실제로 갔는지 아는가.**
 *
 * `uncertain` 은 「안 갔다」가 아니라 「모른다」다. 이 둘을 같이 다루면
 * 같은 유료 호출을 두 번 보내게 된다.
 */
export type SubmissionState = "known" | "uncertain";

export interface PdpJobState {
  generation: GenerationState;
  settlement: SettlementState;
  persistence: PersistenceState;
  submission: SubmissionState;
}

export type PdpJobEvent =
  | { type: "reserved" }
  | { type: "submitting" }
  | { type: "submitted" }
  | { type: "submission_unknown" }
  | { type: "generating" }
  | { type: "result_available" }
  | { type: "persisted" }
  | { type: "persist_failed" }
  | { type: "settled" }
  | { type: "settlement_failed" }
  | { type: "reviewed"; passed: boolean }
  | { type: "partial" }
  | { type: "failed" };

export function initialJobState(): PdpJobState {
  return {
    generation: "validated",
    settlement: "not_started",
    persistence: "pending",
    submission: "known",
  };
}

/**
 * 생성 축에서 갈 수 있는 다음 자리.
 *
 * **건너뛰기를 막는다.** 제출한 적 없는 작업이 결과를 가질 수는 없다. 그런 일이
 * 생겼다면 어딘가에서 상태를 잃은 것이고, 조용히 통과시키면 그 손실이 묻힌다.
 */
const NEXT: Record<GenerationState, GenerationState[]> = {
  validated: ["reserved", "failed"],
  reserved: ["submitting", "failed"],
  // 제출 중 실패는 아직 깨끗하다 — 공급자에게 안 갔다는 것을 아는 경우다.
  submitting: ["submitted", "failed"],
  submitted: ["generating", "result_available", "failed"],
  generating: ["result_available", "partial", "failed"],
  // **결과를 받은 뒤로는 실패로 못 간다.** 값은 이미 치렀고 그림은 손에 있다.
  result_available: ["persisted", "partial"],
  persisted: ["completed", "review_required", "partial"],
  completed: [],
  review_required: [],
  partial: [],
  failed: [],
};

export class PdpJobTransitionError extends Error {
  constructor(from: GenerationState, to: GenerationState) {
    super(`허용되지 않는 전이입니다: ${from} → ${to}`);
    this.name = "PdpJobTransitionError";
  }
}

function moveGeneration(state: PdpJobState, to: GenerationState): PdpJobState {
  if (!NEXT[state.generation].includes(to)) {
    throw new PdpJobTransitionError(state.generation, to);
  }
  return { ...state, generation: to };
}

export function advanceJob(state: PdpJobState, event: PdpJobEvent): PdpJobState {
  switch (event.type) {
    case "reserved":
      return { ...moveGeneration(state, "reserved"), settlement: "pending" };
    case "submitting":
      return moveGeneration(state, "submitting");
    case "submitted":
      // 뒤늦게 request ID 를 찾은 경우도 여기로 온다. 그때는 더 이상 모르는 상태가 아니다.
      return { ...moveGeneration(state, "submitted"), submission: "known" };
    case "submission_unknown":
      // 생성 축은 `submitting` 에 머문다. 갔는지 안 갔는지 모르니 앞으로도 뒤로도 못 간다.
      return { ...state, submission: "uncertain" };
    case "generating":
      return moveGeneration(state, "generating");
    case "result_available":
      return moveGeneration(state, "result_available");
    case "persisted":
      return { ...moveGeneration(state, "persisted"), persistence: "stored" };
    case "persist_failed":
      // **생성 축을 되돌리지 않는다.** 되돌리면 다시 그리게 되고 값을 두 번 낸다.
      return { ...state, persistence: "retry_required" };
    case "settled":
      return { ...state, settlement: "settled" };
    case "settlement_failed":
      // 정산은 생성과 독립이다. 결과를 버리지 않는다.
      return { ...state, settlement: "retry_required" };
    case "reviewed":
      return moveGeneration(state, event.passed ? "completed" : "review_required");
    case "partial":
      return moveGeneration(state, "partial");
    case "failed":
      return moveGeneration(state, "failed");
  }
}

const TERMINAL: GenerationState[] = ["completed", "review_required", "partial", "failed"];

/**
 * 더 움직일 일이 남았는가.
 *
 * 생성이 끝났어도 **정산이나 보존이 남아 있으면 끝난 것이 아니다.** 워커가
 * 여기서 손을 떼면 그 두 가지가 영영 안 끝난다.
 */
export function isTerminal(state: PdpJobState): boolean {
  if (!TERMINAL.includes(state.generation)) return false;
  return state.settlement !== "retry_required" && state.persistence !== "retry_required";
}

/** 사용자에게 보여줄 한마디. 화면이 같은 말을 여러 곳에서 짓지 않게 한다. */
export type PdpJobOutcome =
  | "waiting"
  | "checking"
  | "running"
  | "storing"
  | "settling"
  | "done"
  | "review_required"
  | "partial"
  | "failed";

export function outcomeOf(state: PdpJobState): PdpJobOutcome {
  // 제출이 불확실한 것이 가장 먼저다 — 실패도 성공도 아니고, 사람이 봐야 한다.
  if (state.submission === "uncertain") return "checking";
  if (state.generation === "failed") return "failed";
  if (state.persistence === "retry_required") return "storing";

  switch (state.generation) {
    case "validated":
    case "reserved":
      return "waiting";
    case "submitting":
    case "submitted":
    case "generating":
      return "running";
    case "result_available":
      // 그림은 받았지만 아직 우리 것이 아니다.
      return "storing";
    case "persisted":
      return state.settlement === "settled" ? "done" : "settling";
    case "completed":
      return state.settlement === "retry_required" ? "settling" : "done";
    case "review_required":
      return "review_required";
    case "partial":
      return "partial";
  }
}

/**
 * 같은 유료 호출을 다시 보내도 되는가.
 *
 * **모르면 보내지 않는다.** 공급자가 멱등을 보장하는지 우리가 확인하지 않았고
 * (설계 §8.2), 확인 없이 다시 보내면 두 번 낸다. 사람이 공급자 쪽을 확인하고
 * 판단할 일로 남긴다.
 */
export function canRetrySubmission(state: PdpJobState): boolean {
  if (state.submission === "uncertain") return false;
  return state.generation === "reserved" || state.generation === "submitting";
}
