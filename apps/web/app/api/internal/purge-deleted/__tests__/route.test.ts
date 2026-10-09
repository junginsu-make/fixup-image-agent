import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **6개월 자동 파기 주소**(2026-10-08 — 계획 3단계). 서버 타이머만 부른다 — 운영 설정의 `CRON_SECRET` 을 머리에
 * 실어 온 요청만 받는다. 값이 없거나 짧으면 아예 안 돈다(아무나 부르는 문이 되지 않게). 틀린 값에는 없는 주소처럼
 * 답한다. 두 번 겹쳐 부르면 뒤의 것은 돌지 않는다.
 */
vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({ run: vi.fn(), release: () => undefined as void }));
vi.mock("../../../../../lib/retention/purge-deleted", () => ({ runPurge: st.run }));
vi.mock("../../../../../lib/retention/purge-targets", () => ({ purgeTargets: () => ["targets"] }));

const { POST } = await import("../route");
const SECRET = "s".repeat(40);
const call = (secret?: string) => POST(new Request("http://local/api/internal/purge-deleted", {
  method: "POST", headers: secret === undefined ? {} : { "x-cron-secret": secret },
}));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  st.run.mockReset();
  st.run.mockResolvedValue({ sns: { purged: 1, failed: 0 } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("6개월 자동 파기 주소", () => {
  it("맞는 비밀값이면 지우고 몇 건인지 답한다", async () => {
    const response = await call(SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, report: { sns: { purged: 1, failed: 0 } } });
    expect(st.run).toHaveBeenCalledWith(["targets"], expect.any(Date));
  });

  it("비밀값이 없거나 틀리면 없는 주소처럼 — 아무것도 안 지운다", async () => {
    expect((await call()).status).toBe(404);
    expect((await call("x".repeat(40))).status).toBe(404);
    expect((await call(SECRET.slice(1))).status).toBe(404);
    expect(st.run).not.toHaveBeenCalled();
  });

  it("운영 설정에 값이 없거나 짧으면 돌지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await call("short")).status).toBe(503);
    expect(st.run).not.toHaveBeenCalled();
  });

  it("두 번 겹쳐 부르면 뒤의 것은 돌지 않는다", async () => {
    let finish: (value: unknown) => void = () => undefined;
    st.run.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = call(SECRET);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await call(SECRET)).status).toBe(409);
    finish({});
    expect((await first).status).toBe(200);
    expect((await call(SECRET)).status).toBe(200);
  });

  /** 일부라도 못 지웠으면 실패로 답한다 — 타이머 스크립트(curl -f)가 실패로 끝나 기록에 남는다(보안 리뷰). */
  it("못 지운 것이 있거나 목록을 못 읽으면 500 — 보고는 함께 준다", async () => {
    st.run.mockResolvedValueOnce({ sns: { purged: 1, failed: 1 } });
    const partial = await call(SECRET);
    expect(partial.status).toBe(500);
    expect(await partial.json()).toEqual({ ok: false, report: { sns: { purged: 1, failed: 1 } } });
    st.run.mockResolvedValueOnce({ library: { purged: 0, failed: 0, listFailed: true } });
    expect((await call(SECRET)).status).toBe(500);
  });

  /** 멈춘 실행이 표시를 영영 쥐고 있으면 재시작 전까지 매일 409 다 — 30분이 지나면 놓아준다(보안 리뷰). */
  it("30분 넘게 끝나지 않은 실행은 다음 실행을 막지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      st.run.mockImplementationOnce(() => new Promise(() => undefined));
      void call(SECRET);
      await Promise.resolve();
      expect((await call(SECRET)).status).toBe(409);
      vi.setSystemTime(Date.now() + 31 * 60 * 1000);
      expect((await call(SECRET)).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
