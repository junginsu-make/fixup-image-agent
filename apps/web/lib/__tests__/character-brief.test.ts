import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createCharacterBriefProvider, prepareCharacterBrief } = await import("../character-brief");

const input = { description: "고양이인데 3등신", kind: "character" as const, look: "3d" as const };
const 원문 = { prompt: input.description, identity: input.description, refined: false };

function 제공자(generate: (prompt: string) => Promise<unknown>) {
  return { generate: vi.fn(generate) };
}

describe("의도 정리", () => {
  it("정리되면 정체성과 정면용 말을 따로 돌려준다", async () => {
    const provider = 제공자(async () => ({ identity: "A cat with one head.", extras: "Smiling." }));
    expect(await prepareCharacterBrief(input, provider)).toEqual({
      prompt: "A cat with one head. Smiling.",
      identity: "A cat with one head.",
      refined: true,
    });
    expect(provider.generate.mock.calls[0]![0]).toContain(input.description);
  });

  it("제공자가 없으면(키 없음·꺼 둠) 원문 그대로", async () => {
    expect(await prepareCharacterBrief(input, null)).toEqual(원문);
  });

  it("LLM 이 던지면 원문 그대로 — 그림 만들기를 막지 않는다", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = 제공자(async () => { throw new Error("Request timed out."); });
    expect(await prepareCharacterBrief(input, provider)).toEqual(원문);
    quiet.mockRestore();
  });

  it("이상한 응답이면 원문 그대로", async () => {
    const provider = 제공자(async () => ({ identity: "" }));
    expect(await prepareCharacterBrief(input, provider)).toEqual(원문);
  });
});

describe("제공자 만들기", () => {
  it("키가 없으면 만들지 않는다", () => {
    expect(createCharacterBriefProvider({})).toBeNull();
  });

  it("꺼 두면 키가 있어도 만들지 않는다", () => {
    expect(createCharacterBriefProvider({ ANTHROPIC_API_KEY: "k", CHARACTER_BRIEF: "off" })).toBeNull();
  });

  it("키가 있으면 만든다", () => {
    expect(createCharacterBriefProvider({ ANTHROPIC_API_KEY: "k" })).not.toBeNull();
  });
});
