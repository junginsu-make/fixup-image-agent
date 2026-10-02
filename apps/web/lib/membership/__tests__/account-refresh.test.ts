import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccountRefresh } from "../account-refresh";
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
afterEach(() => vi.useRealTimers());
describe("잔액 재조회 순서", () => {
  it("자동 재시도 대기 중에도 수동 새로고침은 바로 실행한다", async () => {
    vi.useFakeTimers(); const pending = vi.fn();
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ value: 8 });
    const refresh = createAccountRefresh({ read, accept: vi.fn(), fail: vi.fn(), pending });
    await refresh.request(true); refresh.request();
    expect(pending).toHaveBeenLastCalledWith(false);
    await refresh.request(true); expect(read).toHaveBeenCalledTimes(2); refresh.dispose();
  });
  it("인증 거절 뒤 주기 요청은 중단한다", async () => {
    const read = vi.fn().mockRejectedValue({ status: 403 });
    const refresh = createAccountRefresh({ read, accept: vi.fn(), fail: vi.fn(), pending: vi.fn() });
    await refresh.request(true); await refresh.request(); expect(read).toHaveBeenCalledOnce(); refresh.dispose();
  });
  it("동시 신호는 합치고 오래된 응답 대신 마지막 조회를 표시한다", async () => {
    vi.useFakeTimers();
    const a = deferred(), b = deferred();
    const read = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const accept = vi.fn();
    const refresh = createAccountRefresh({ read, accept, fail: vi.fn(), pending: vi.fn() });
    const first = refresh.request(true);
    refresh.request(); refresh.request();
    a.resolve({ value: 10 }); await vi.advanceTimersByTimeAsync(0);
    expect(accept).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(2);
    b.resolve({ value: 100 }); await first;
    expect(accept).toHaveBeenCalledExactlyOnceWith({ value: 100 });
    refresh.dispose();
  });
  it("폐기한 회원의 응답은 표시하지 않는다", async () => {
    const a = deferred(), accept = vi.fn(), fail = vi.fn();
    const refresh = createAccountRefresh({ read: () => a.promise, accept, fail, pending: vi.fn() });
    const done = refresh.request(true); refresh.dispose(); a.resolve({ value: 30 }); await done;
    expect(accept).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it("조회 실패는 잔액을 덮지 않고 자동 요청은 60초 쉰다", async () => {
    vi.useFakeTimers(); const accept = vi.fn(), fail = vi.fn();
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ value: 9 });
    const refresh = createAccountRefresh({ read, accept, fail, pending: vi.fn() });
    await refresh.request(true); expect(fail).toHaveBeenCalledOnce(); expect(accept).not.toHaveBeenCalled();
    refresh.request(); await vi.advanceTimersByTimeAsync(59000); expect(read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000); expect(accept).toHaveBeenCalledWith({ value: 9 }); refresh.dispose();
  });
});
