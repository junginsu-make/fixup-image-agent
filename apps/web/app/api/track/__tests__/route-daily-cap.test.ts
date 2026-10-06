import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * **방문 한 줄 받기 — 하루 전체 상한**(계획 2026-10-06 site-analytics, 보안 검토 반영).
 * 1분 상한(300줄) 아래로 천천히 IP 를 바꿔 가며 보내도 하루 2만 줄에서 멈춘다. 상한은 프로세스 안에 있어 파일을 따로 둔다.
 */
vi.mock("server-only", () => ({}));

const 적은것: Array<Record<string, unknown>> = [];
vi.mock("../../../../lib/analytics/record", () => ({
  recordPageView: async (view: Record<string, unknown>) => {
    적은것.push(view);
  },
  pruneSoon: () => undefined,
}));
vi.mock("../../../../lib/analytics/viewer", () => ({ currentUserId: async () => null }));

const { POST } = await import("../route");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";


const START = new Date("2026-10-06T00:00:00Z").getTime();

describe("하루 전체 상한", () => {
  afterAll(() => vi.useRealTimers());

  it("1분 상한을 안 넘기며 20,300번 보내도 20,000줄까지만 적는다", async () => {
    vi.useFakeTimers();
    let sent = 0;
    for (let batch = 0; sent < 20_300; batch += 1) {
      vi.setSystemTime(START + batch * 61_000);
      const size = Math.min(300, 20_300 - sent);
      for (let i = 0; i < size; i += 1, sent += 1) {
        // 요청마다 다른 IP — IP 별 한도에 안 걸린다.
        await POST(new Request("https://formwith.fix-up.kr/api/track", {
          method: "POST",
          headers: { "user-agent": CHROME, "sec-fetch-site": "same-origin", "x-forwarded-for": `10.${(sent >> 16) & 255}.${(sent >> 8) & 255}.${sent & 255}` },
          body: JSON.stringify({ path: "/", entry: false }),
        }));
      }
    }
    expect(sent).toBe(20_300);
    expect(적은것).toHaveLength(20_000);
  }, 120_000);
});
