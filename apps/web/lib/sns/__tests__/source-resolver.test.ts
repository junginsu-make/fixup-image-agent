import { describe, expect, it, vi } from "vitest";
import { resolveSourceText } from "../source-resolver";

const deps = (over: Record<string, unknown> = {}) => ({
  ingestYoutube: vi.fn(async () => ({ segments: [{ text: "자막 첫 줄" }, { text: "자막 둘째 줄" }] })),
  ingestWeb: vi.fn(async () => ({ segments: [{ text: "기사 본문" }] })),
  research: vi.fn(async () => ({ text: "찾아온 최신 정보", citations: [{ title: "출처", url: "https://a" }] })),
  ...over,
}) as never;

describe("01 내용 가져오기", () => {
  it("직접 쓴 글은 그대로 쓴다", async () => {
    const result = await resolveSourceText({ kind: "text", text: "내가 쓴 글" }, deps());
    expect(result.text).toBe("내가 쓴 글");
    expect(result.issues).toEqual([]);
  });

  it("유튜브는 자막을 실제로 가져온다", async () => {
    const dependencies = deps();
    const result = await resolveSourceText(
      { kind: "youtube", url: "https://youtu.be/abc12345678" },
      dependencies,
    );
    expect(result.text).toContain("자막 첫 줄");
    expect(result.text).toContain("자막 둘째 줄");
    // URL 문자열만 넘기면 LLM 이 내용을 지어낸다.
    expect(result.text).not.toContain("가져올 주소");
  });

  it("웹 주소는 본문을 실제로 가져온다", async () => {
    const result = await resolveSourceText({ kind: "web", url: "https://example.com/a" }, deps());
    expect(result.text).toContain("기사 본문");
    expect(result.text).not.toContain("가져올 주소");
  });

  it("질문은 검색해서 근거를 가져온다", async () => {
    const result = await resolveSourceText({ kind: "question", question: "요즘 AI 동향은?" }, deps());
    expect(result.text).toContain("찾아온 최신 정보");
    expect(result.citations?.[0]?.url).toBe("https://a");
  });

  it("가져오기가 실패하면 지어내지 않고 막는다", async () => {
    const result = await resolveSourceText(
      { kind: "youtube", url: "https://youtu.be/abc12345678" },
      deps({ ingestYoutube: async () => { throw new Error("자막 없음"); } }),
    );
    expect(result.text).toBe("");
    expect(result.issues.join("\n")).toMatch(/자막 없음/);
  });

  it("빈 내용을 가져오면 그것도 막는다 — 빈 글로 카드뉴스를 만들 수 없다", async () => {
    const result = await resolveSourceText(
      { kind: "web", url: "https://example.com/a" },
      deps({ ingestWeb: async () => ({ segments: [] }) }),
    );
    expect(result.text).toBe("");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("직접 쓴 글이 비어 있어도 막는다", async () => {
    const result = await resolveSourceText({ kind: "text", text: "   " }, deps());
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("가져온 뒤에는 어디서 왔는지 남긴다", async () => {
    const result = await resolveSourceText({ kind: "web", url: "https://example.com/a" }, deps());
    expect(result.origin).toBe("https://example.com/a");
  });
});
