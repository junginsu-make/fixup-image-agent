import { describe, expect, it, vi } from "vitest";

/**
 * **방문 한 줄 받기 — 서버 전체 상한**(계획 2026-10-06 site-analytics, 보안 검토 반영).
 * IP 를 바꿔 가며 몰아쳐도 1분에 300줄을 넘기지 않는다. 상한은 프로세스 안에 있어, 다른 시험과 섞이지 않게 파일을 따로 둔다.
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

describe("서버 전체 상한", () => {
  it("서로 다른 IP 320곳이 1분 안에 보내도 300줄까지만 적는다", async () => {
    for (let i = 0; i < 320; i += 1) {
      const res = await POST(new Request("https://formwith.fix-up.kr/api/track", {
        method: "POST",
        headers: { "user-agent": CHROME, "sec-fetch-site": "same-origin", "x-forwarded-for": `198.51.${Math.floor(i / 250)}.${(i % 250) + 1}` },
        body: JSON.stringify({ path: "/", entry: false }),
      }));
      expect(res.status).toBe(204);
    }
    expect(적은것).toHaveLength(300);
  });
});
