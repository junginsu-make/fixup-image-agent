export type GenerationRunStatus = "running" | "finished";

export interface GenerationRunView {
  mode: "batch";
  status: GenerationRunStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentLabel: string;
  startedAt: number;
  endedAt?: number;
  /** 남은 묶음의 예상 소요(초). 모델 정보를 모르면 없다. */
  expectedSeconds?: number;
}

/**
 * 일괄 생성의 진행 상태를 만든다.
 *
 * **화면 안에 두면 값으로 못 잰다.** 「몇 장이 미시도인가」와 「얼마나 남았나」는
 * 실제 계산이라 틀리면 사용자가 진행 표시를 못 믿게 된다. 그런데 화면 파일에
 * 들어 있는 동안에는 시험이 한 건도 없었다.
 */
export function describeBatchRun(input: {
  status: GenerationRunStatus;
  label: string;
  /** 만들려는 전체 섹션 수. */
  total: number;
  completed: number;
  failed: number;
  /** 지금까지 손댄 섹션 수. 성공·실패를 합친 값이다. */
  processed: number;
  startedAt: number;
  /** 나눈 묶음 수. */
  chunkCount: number;
  /** 모델 정보를 모르면 예상 시간을 안 보여준다 — 틀린 숫자보다 없는 편이 낫다. */
  model?: { expectedBatchSeconds: number; maxBatchSize: number };
  now?: () => number;
}): GenerationRunView {
  const now = input.now ?? Date.now;

  return {
    mode: "batch",
    status: input.status,
    total: input.total,
    completed: input.completed,
    failed: input.failed,
    // 손대지 않은 것만 미시도다. 실패는 손댄 것이다.
    skipped: Math.max(0, input.total - input.processed),
    currentLabel: input.label,
    startedAt: input.startedAt,
    // 이미 끝난 묶음은 빼고 남은 묶음의 예상만 보여준다.
    expectedSeconds: input.model
      ? input.model.expectedBatchSeconds *
        Math.max(1, input.chunkCount - Math.floor(input.processed / input.model.maxBatchSize))
      : undefined,
    ...(input.status === "finished" ? { endedAt: now() } : {}),
  };
}
