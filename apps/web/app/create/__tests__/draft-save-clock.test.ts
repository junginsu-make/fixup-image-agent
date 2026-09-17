import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftSaveClock, startDraftAutosave } from "../draft-save-clock";

afterEach(() => vi.useRealTimers());
describe("T-SAVE: 저장 시점과 현재 수정 버전", () => {
  it("저장 도중 생긴 수정은 옛 저장 완료로 지우지 않는다", () => {
    const clock = new DraftSaveClock();
    const saving = clock.changed();
    clock.changed(); clock.acknowledge(saving);
    expect(clock.dirty).toBe(true);
    clock.acknowledge(clock.revision);
    expect(clock.dirty).toBe(false);
  });
  it("타이핑을 계속해도 30초에 현재 저장 함수를 호출한다", async () => {
    vi.useFakeTimers();
    const writes: number[] = []; let revision = 0;
    let current = () => { writes.push(revision); };
    const stop = startDraftAutosave(() => current());
    for (let i = 1; i <= 30; i++) {
      revision = i;
      current = () => { writes.push(revision); };
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(writes).toEqual([30]);
    stop(); await vi.advanceTimersByTimeAsync(30000);
    expect(writes).toEqual([30]);
  });
});
