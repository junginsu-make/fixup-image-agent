import { describe, expect, it, vi } from "vitest";

/**
 * **몸통을 읽은 자리가 인증 결과를 넘긴다**(설계 2026-09-29 §3.2) — 라우트가
 * 그대로 `reserveAiUsage` 에 건네 두 번째 인증을 없앤다.
 */
vi.mock("server-only", () => ({}));
const member = { userId: "u1", profile: { id: "u1", status: "active" } };
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member }),
}));

const { readPdpRequest, readRedesignForm } = await import("../request");

describe("인증 결과를 넘긴다", () => {
  it("readPdpRequest", async () => {
    const result = await readPdpRequest(
      new Request("http://localhost/api/pdp/analyze", { method: "POST", body: JSON.stringify({ imageBase64: "AAAA", mimeType: "image/png" }) }),
      "analyze",
    );

    expect(result.ok && result.member).toBe(member);
  });

  it("readRedesignForm", async () => {
    const form = new FormData();
    form.set("jobIndex", "1");
    form.set("jobTotal", "1");
    form.append("files", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const result = await readRedesignForm(new Request("http://localhost/api/redesign/generate", { method: "POST", body: form }));

    expect(result.ok && result.member).toBe(member);
  });
});
