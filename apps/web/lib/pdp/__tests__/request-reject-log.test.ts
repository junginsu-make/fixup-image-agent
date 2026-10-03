import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **형식 거절은 어느 칸인지 남긴다**(2026-10-02 사용자 신고).
 *
 * 상세페이지 이미지 생성이 0.3초 만에 「요청 형식이 올바르지 않습니다」로
 * 네 번 거절됐다. 서버는 어느 칸이 걸렸는지 적지 않았고, 몸통은 사용자
 * 브라우저에만 있어서 원인을 짚을 수 없었다.
 *
 * 그래서 칸 이름과 규칙 종류만 남긴다. **값은 남기지 않는다** — 제목·지시문은
 * 사용자가 쓴 글이다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { id: "u1", status: "active" } } }),
}));

const { readPdpRequest } = await import("../request");

const post = (body: unknown) =>
  new Request("http://localhost/api/pdp/images", { method: "POST", body: JSON.stringify(body) });

afterEach(() => vi.restoreAllMocks());

describe("형식 거절 기록", () => {
  it("걸린 칸 이름을 남긴다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await readPdpRequest(post({
      originalImageBase64: "AAAA",
      section: { section_id: "", prompt_en: "", headline: "비밀 문구 123" },
    }), "single");

    expect(result.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]!.map(String).join(" ");
    expect(line).toContain("single");
    expect(line).toContain("section.section_id");
  });

  it("값은 남기지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await readPdpRequest(post({
      originalImageBase64: "AAAA",
      desiredTone: "사용자가 쓴 아무 문장",
      section: { section_id: "S1", prompt_en: "scene" },
    }), "single");

    const line = warn.mock.calls.flat().map((value) => JSON.stringify(value)).join(" ");
    expect(line).toContain("desiredTone");
    expect(line).not.toContain("사용자가 쓴 아무 문장");
  });

  it("몸통이 JSON 이 아니어도 남긴다 — 같은 답이 나가서 구별이 안 된다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await readPdpRequest(
      new Request("http://localhost/api/pdp/images", { method: "POST", body: "{\"originalImageBase64\": \"비밀" }),
      "single",
    );

    expect(result.ok).toBe(false);
    const line = warn.mock.calls.flat().map(String).join(" ");
    expect(line).toContain("single");
    expect(line).not.toContain("비밀");
  });

  it("통과하면 아무것도 남기지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await readPdpRequest(post({
      originalImageBase64: "AAAA",
      section: { section_id: "S1", prompt_en: "scene" },
    }), "single");

    expect(result.ok).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
