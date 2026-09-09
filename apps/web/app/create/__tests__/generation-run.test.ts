import { describe, expect, it } from "vitest";
import { describeBatchRun } from "../generation-run";

/**
 * 진행 표시가 틀리면 사용자가 그 표시를 못 믿게 된다. 화면 파일 안에 있는
 * 동안에는 이 계산에 시험이 한 건도 없었다.
 */

const 기본 = {
  status: "running" as const,
  label: "히어로",
  total: 6,
  completed: 0,
  failed: 0,
  processed: 0,
  startedAt: 1000,
  chunkCount: 2,
  now: () => 9999,
};

const gpt = { expectedBatchSeconds: 150, maxBatchSize: 3 };

describe("미시도 장수", () => {
  it("아무것도 안 했으면 전부 미시도다", () => {
    expect(describeBatchRun(기본).skipped).toBe(6);
  });

  it("실패는 손댄 것이라 미시도가 아니다", () => {
    expect(describeBatchRun({ ...기본, processed: 3, completed: 2, failed: 1 }).skipped).toBe(3);
  });

  it("다 했으면 미시도가 없다", () => {
    expect(describeBatchRun({ ...기본, processed: 6, completed: 6 }).skipped).toBe(0);
  });

  it("음수가 되지 않는다", () => {
    expect(describeBatchRun({ ...기본, processed: 9 }).skipped).toBe(0);
  });
});

describe("남은 예상 시간", () => {
  it("시작 전에는 모든 묶음이 남아 있다", () => {
    expect(describeBatchRun({ ...기본, model: gpt }).expectedSeconds).toBe(300);
  });

  it("한 묶음이 끝나면 그만큼 뺀다", () => {
    expect(describeBatchRun({ ...기본, processed: 3, model: gpt }).expectedSeconds).toBe(150);
  });

  it("마지막 묶음 중이어도 0 으로 떨어지지 않는다", () => {
    expect(describeBatchRun({ ...기본, processed: 6, model: gpt }).expectedSeconds).toBe(150);
  });

  /**
   * 묶음이 덜 끝난 상태에서는 **내림**이다. 올림하면 아직 안 끝난 묶음을
   * 끝난 것으로 세어 남은 시간을 실제보다 짧게 말한다.
   */
  it("묶음 중간이면 그 묶음은 아직 남은 것으로 센다", () => {
    expect(describeBatchRun({ ...기본, processed: 1, model: gpt }).expectedSeconds).toBe(300);
    expect(describeBatchRun({ ...기본, processed: 2, model: gpt }).expectedSeconds).toBe(300);
    expect(describeBatchRun({ ...기본, processed: 4, model: gpt }).expectedSeconds).toBe(150);
  });

  /** 틀린 숫자보다 없는 편이 낫다. */
  it("모델을 모르면 아예 안 보여준다", () => {
    expect(describeBatchRun(기본).expectedSeconds).toBeUndefined();
  });
});

describe("끝난 시각", () => {
  it("도는 중에는 없다", () => {
    expect(describeBatchRun(기본).endedAt).toBeUndefined();
  });

  it("끝나면 찍힌다", () => {
    expect(describeBatchRun({ ...기본, status: "finished" }).endedAt).toBe(9999);
  });
});

describe("나머지 값은 그대로 실린다", () => {
  it("모드·상태·개수·이름·시작시각", () => {
    const view = describeBatchRun({ ...기본, completed: 2, failed: 1, processed: 3, label: "베네핏" });
    expect(view.mode).toBe("batch");
    expect(view.status).toBe("running");
    expect(view.total).toBe(6);
    expect(view.completed).toBe(2);
    expect(view.failed).toBe(1);
    expect(view.currentLabel).toBe("베네핏");
    expect(view.startedAt).toBe(1000);
  });
});
