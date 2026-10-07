import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planCards, reviewCard, writeCaption, writeCopy } from "@fixup/sns-core";

/**
 * **카드뉴스 글 모델 · 검수 모델이 던진 원문이 `issues` 로 화면에 안 간다**(2026-10-07 오류 원문 가리기 Task 3).
 *
 * 패키지(`withIssueFallback`)는 제공자가 던진 글을 그대로 「주 모델 기획 실패: <원문>」으로 적는다. 그 목록은
 * 작업에 저장되고 카드뉴스 화면 · 쉽게 모드 대화에 뜬다. 원문(SDK · 네트워크 글, 열쇠 조각)은 서버 기록에만
 * 남기고 「응답을 받지 못했습니다.」로 다시 던진다. **여전히 던지므로** 주→예비 넘어가기는 같다.
 * 패키지가 응답을 검사하며 던지는 글(「AI가 허용 범위 …」)은 제공자 밖이라 그대로다 — 쉽게 모드가 그 글로 갈래를 탄다.
 */
const 날것 = "401 invalid x-api-key sk-ant-SECRET at https://api.anthropic.com/v1/messages";

type Handler = (tool: string) => unknown;
let anthropicReply: Handler;
let openaiReply: Handler;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (body: { tools: Array<{ name: string }> }) => {
        const input = anthropicReply(body.tools[0]!.name);
        return { content: [{ type: "tool_use", name: body.tools[0]!.name, input }] };
      },
    };
  },
}));
vi.mock("openai", () => ({
  default: class {
    responses = {
      create: async (body: { tools: Array<{ name: string }> }) => {
        const input = openaiReply(body.tools[0]!.name);
        return { output: [{ type: "function_call", name: body.tools[0]!.name, arguments: JSON.stringify(input) }] };
      },
    };
  },
}));
vi.mock("../../fal/pool/default", () => ({ defaultFalRouter: () => ({}) }));
vi.mock("../../fal/queue", () => ({ createFalQueueClient: () => ({}) }));
vi.mock("../../fal/upload", () => ({ createFalUploader: () => ({}) }));

const { createSnsGenerationProviders, createSnsPlanningProviders } = await import("../providers");

const KEYS = { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", FAL_KEY: "f" };
const throwRaw: Handler = () => { throw new Error(날것); };
const card = (index: number) => ({ index, role: index === 1 ? "cover" : "body", intent: `의도${index}`, visualBrief: `장면${index}` });
const planInput = {
  sourceText: "본문",
  slots: { total: "auto" as const, cover: 1, placeAsIs: 2, aiBody: 0, ending: 1, autoRange: { min: 4, max: 8 }, issues: [] },
  language: "ko" as const,
};
const reviewed = {
  decision: "pass", summary: "통과", issues: [],
  textFidelity: { headline: "exact", body: "not_applicable", accent: "not_applicable", footnote: "not_applicable" },
  extraCopy: { status: "none", texts: [] },
};

let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  anthropicReply = throwRaw;
  openaiReply = throwRaw;
});
afterEach(() => errors.mockRestore());

describe("기획 · 원고 · 게시글 제공자", () => {
  it("주 모델 원문은 issues 에 없고, 예비로 넘어가 만든다", async () => {
    openaiReply = () => ({ total: 6, cards: [card(1), card(2), card(3)] });
    const providers = createSnsPlanningProviders(KEYS);
    const result = await planCards(planInput, providers.planningPrimary, providers.planningBackup);

    expect(result.cards).toHaveLength(3);
    expect(result.issues).toEqual(["주 모델이 실패해 OpenAI 예비로 만들었습니다: 응답을 받지 못했습니다."]);
    expect(logged()).toContain("invalid x-api-key");
    // 기록도 주소는 가린 글이다(`errorLogText`).
    expect(logged()).not.toContain("https://api.anthropic.com");
  });

  it("패키지의 장수 검사 글은 그대로 남는다 — 쉽게 모드가 그 글로 쉬운 말을 고른다", async () => {
    anthropicReply = () => ({ total: 10, cards: Array.from({ length: 7 }, (_unused, index) => card(index + 1)) });
    const providers = createSnsPlanningProviders(KEYS);
    const result = await planCards(planInput, providers.planningPrimary, providers.planningBackup);

    const text = result.issues.join("\n");
    expect(text).toContain("AI가 허용 범위 4~8장을 벗어난 10장을 골랐습니다.");
    expect(text).toContain("OpenAI 예비 기획도 실패했습니다: 응답을 받지 못했습니다.");
    expect(text).not.toContain("x-api-key");
  });

  it("원고 두 제공자가 다 실패해도 원문은 issues 에 없다", async () => {
    const providers = createSnsPlanningProviders(KEYS);
    const result = await writeCopy(
      { sourceText: "본문", plans: [card(1) as never], language: "ko" },
      providers.copyPrimary,
      providers.copyBackup,
    );
    expect(result.copies).toEqual([]);
    expect(result.issues.join("\n")).toContain("응답을 받지 못했습니다.");
    expect(result.issues.join("\n")).not.toContain("x-api-key");
  });

  it("게시글은 주 모델 원문을 가리고 예비로 쓴다", async () => {
    openaiReply = () => ({ hook: "첫 줄", body: "본문", hashtags: ["카드뉴스"], firstComment: "댓글" });
    const providers = createSnsPlanningProviders(KEYS);
    const result = await writeCaption(
      { title: "제목", cards: [{ index: 1, headline: "제목" }], language: "ko" },
      providers.captionPrimary,
      providers.captionBackup,
    );
    expect(result.caption?.hook).toBe("첫 줄");
    expect(result.issues).toEqual(["주 모델이 실패해 OpenAI 예비로 게시글을 썼습니다: 응답을 받지 못했습니다."]);
  });
});

describe("검수 제공자", () => {
  it("두 검수가 다 실패하면 사람 확인으로 가고, 원문은 issues 에 없다", async () => {
    const providers = createSnsGenerationProviders(KEYS);
    const result = await reviewCard(
      { kind: "generated", imageUrl: "data:image/png;base64,eA==", copy: { headline: "제목" }, preservedImageUrls: [] },
      providers.reviewPrimary,
      providers.reviewBackup,
    );
    expect(result.status).toBe("review_required");
    expect(result.issues.join("\n")).toContain("응답을 받지 못했습니다.");
    expect(result.issues.join("\n")).not.toContain("x-api-key");
    expect(logged()).toContain("invalid x-api-key");
  });

  it("주 검수 원문을 가리고 예비로 검수한다", async () => {
    openaiReply = () => reviewed;
    const providers = createSnsGenerationProviders(KEYS);
    const result = await reviewCard(
      { kind: "generated", imageUrl: "data:image/png;base64,eA==", copy: { headline: "제목" }, preservedImageUrls: [] },
      providers.reviewPrimary,
      providers.reviewBackup,
    );
    expect(result.status).toBe("done");
    expect(result.issues).toEqual(["주 검수가 실패해 OpenAI 예비로 검수했습니다: 응답을 받지 못했습니다."]);
  });
});
