import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「이대로 만들기」 · 조건 바꾸기 문**(2단계 설계 §7 · §8).
 *
 * 둘 다 이 대화가 만든 원고에만 한다. 아무것도 지우지 않는다(2026-09-30 사용자 결정).
 */

vi.mock("server-only", () => ({}));

const 원고 = (n: number) => ({
  id: "c1", status: "copy_ready", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", toneNote: "", title: "t",
  data: {
    source: { kind: "question" as const, question: "q" }, attachments: [] as unknown[], look: "auto",
    flow: {
      planningIssues: [] as string[], copyIssues: [] as string[],
      cards: Array.from({ length: n }, (_, i) => ({
        index: i + 1, role: "body", kind: "generated", copy: { headline: `${i + 1}` }, status: "pending",
      })) as unknown[],
    },
  },
});

let 지난줄들: Array<Record<string, unknown>>;
let 카드작업들: Record<string, unknown>;
let 새원고: ReturnType<typeof 원고>;
const 남긴줄: Array<{ role: string; body?: string; workId?: string }> = [];
const 시작한것: string[] = [];
const 만든입력: unknown[] = [];
const 지운것: string[] = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
}));
vi.mock("../../../../lib/llm/meter", () => ({ withLlmMeter: (fn: () => unknown) => fn() }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async (id: string) => (id === "conv" ? { id, title: "있음" } : null),
    listMessages: async () => 지난줄들,
    appendMessage: async (row: { role: string; body?: string; workId?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    deleteConversation: async (id: string) => { 지운것.push(id); },
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", () => ({
  cardnewsProject: async (_userId: string, id: string) => 카드작업들[id] ?? null,
  startCardnews: async (_request: Request, id: string) => { 시작한것.push(id); },
  draftCardnews: async (_request: Request, input: unknown) => {
    만든입력.push(input);
    return { projectId: "c2", project: { ...새원고, id: "c2" } };
  },
}));

const { POST } = await import("../cardnews/route");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/cardnews", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "conv", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

beforeEach(() => {
  지난줄들 = [];
  카드작업들 = {};
  새원고 = 원고(2);
  남긴줄.length = 0; 시작한것.length = 0; 만든입력.length = 0; 지운것.length = 0;
});

describe("「이대로 만들기」 (2단계 §8)", () => {
  it("이 대화의 원고면 만들기를 부른다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    const { json } = await 보낸다({ action: "generate", projectId: "c1" });
    expect(json.started).toBe(true);
    expect(시작한것).toEqual(["c1"]);
  });

  /** Review Focus 1 */
  it("이 대화 줄이 없는 작업은 안 만든다", async () => {
    카드작업들 = { c1: 원고(2) };
    const { status } = await 보낸다({ action: "generate", projectId: "c1" });
    expect(status).toBe(404);
    expect(시작한것).toEqual([]);
  });

  it("카드뉴스 작업이 아니면(포스터 줄) 안 만든다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "p1" }];
    const { status } = await 보낸다({ action: "generate", projectId: "p1" });
    expect(status).toBe(404);
    expect(시작한것).toEqual([]);
  });

  it("원고 단계가 아니거나 원고가 0장이면 안 만든다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: { ...원고(2), status: "ready" } };
    expect((await 보낸다({ action: "generate", projectId: "c1" })).status).toBe(400);
    카드작업들 = { c1: 원고(0) };
    expect((await 보낸다({ action: "generate", projectId: "c1" })).status).toBe(400);
    expect(시작한것).toEqual([]);
  });

  it("모르는 할 일이면 아무것도 안 한다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    expect((await 보낸다({ action: "delete", projectId: "c1" })).status).toBe(400);
    expect(시작한것).toEqual([]);
    expect(만든입력).toEqual([]);
  });
});

describe("조건 바꾸기 (2단계 §7)", () => {
  it("새 조건으로 새 작업을 만들고 새 원고 줄을 남긴다, 앞 작업은 그대로", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: { ...원고(2), title: "건강", toneNote: "" } };
    const { json } = await 보낸다({ action: "redraft", projectId: "c1", options: { ratio: "1:1", count: 5 } });
    expect(만든입력[0]).toMatchObject({ ratio: "1:1", cardCountMode: "fixed", cardCount: 5, title: "건강" });
    expect(json.cardnews.rowId).toBeDefined();
    expect(남긴줄).toEqual([{ conversationId: "conv", role: "image", workId: "c2" }]);
    expect(지운것).toEqual([]);
    expect(시작한것).toEqual([]);
  });

  /** 설계 §9: 원고 0장은 조용히 끝내지 않는다. */
  it("새 원고가 0장이면 까닭을 말하고 원고 줄을 안 남긴다", async () => {
    지난줄들 = [{ id: "r1", role: "image", workId: "c1" }];
    카드작업들 = { c1: 원고(2) };
    새원고 = { ...원고(0), data: { ...원고(0).data, flow: { planningIssues: ["내용이 짧습니다"], copyIssues: [], cards: [] } } };
    const { json } = await 보낸다({ action: "redraft", projectId: "c1", options: { count: 8 } });
    expect(json.talked).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["assistant"]);
    expect(남긴줄[0]!.body).toContain("내용이 짧습니다");
  });
});
