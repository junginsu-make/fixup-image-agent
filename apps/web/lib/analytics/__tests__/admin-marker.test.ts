import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자 표시 줄.** 관리자가 `/` → `/login` → `/admin` 으로만 다녀도, 그날 관리자 번호가 붙은 줄이 하나는 남아야
 * 보고서가 로그인 전 줄(같은 visitor)을 뺀다. `/admin*` 은 화면에서 안 보내므로 서버가 직접 남긴다.
 */
vi.mock("server-only", () => ({}));
const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }) }));
const recordPageView = vi.fn(async (_view: Record<string, unknown>) => undefined);
vi.mock("../record", () => ({ recordPageView }));

const { markAdminVisit } = await import("../admin-marker");
const { visitorHash } = await import("../visitor");

const UA = "Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36";

describe("markAdminVisit", () => {
  beforeEach(() => {
    recordPageView.mockClear();
    headerValues.clear();
    headerValues.set("x-forwarded-for", "203.0.113.9");
    headerValues.set("user-agent", UA);
  });

  it("관리자 번호가 붙은 /admin 한 줄을 남긴다", async () => {
    await markAdminVisit("admin-1");
    expect(recordPageView).toHaveBeenCalledTimes(1);
    const view = recordPageView.mock.calls[0]![0];
    expect(view).toMatchObject({
      userId: "admin-1", cookieId: null, path: "/admin", entry: false, referrerHost: null,
      utm: { source: null, medium: null, campaign: null },
    });
    expect(view.visitor).toBe(visitorHash("203.0.113.9", UA));
    expect(view).not.toHaveProperty("ip");
  });

  it("기록이 던져도 던지지 않는다", async () => {
    recordPageView.mockImplementationOnce(async () => { throw new Error("db"); });
    await expect(markAdminVisit("admin-1")).resolves.toBeUndefined();
  });
});
