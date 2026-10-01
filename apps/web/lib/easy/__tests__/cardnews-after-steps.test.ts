import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **만든 카드뉴스 손보기의 서버 일**(3단계 설계 §6). 카드뉴스 라우트를 함수로 부른다.
 * 기존 코드는 0줄이라 그 라우트들은 가짜로 바꿔 무엇을 보냈는지만 잰다.
 */

vi.mock("server-only", () => ({}));

const 고친것: Array<{ index: string; body: unknown }> = [];
const 다시만든것: Array<{ index: string; body: unknown }> = [];
const 부른게시글: string[] = [];

vi.mock("../../../app/api/sns/projects/[id]/cards/[index]/route", () => ({
  PATCH: async (req: Request, { params }: { params: Promise<{ id: string; index: string }> }) => {
    const { id, index } = await params;
    고친것.push({ index, body: await req.json() });
    return Response.json({ ok: true, project: { id } });
  },
  POST: async (req: Request, { params }: { params: Promise<{ id: string; index: string }> }) => {
    const { id, index } = await params;
    다시만든것.push({ index, body: await req.json() });
    return Response.json({ ok: true, project: { id, status: "generating" } });
  },
}));
vi.mock("../../../app/api/sns/projects/[id]/caption/route", () => ({
  POST: async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    부른게시글.push(id);
    return Response.json({ ok: true, project: { id } });
  },
}));

const { captionCard, editCard } = await import("../cardnews-after-steps");

const 요청 = () => new Request("http://localhost/api/easy/cardnews", {
  method: "POST", headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
});
const 장 = (index: number, over: Record<string, unknown> = {}) =>
  ({ index, role: "body", kind: "generated", copy: { headline: `h${index}` }, status: "pending", ...over });
const 만든작업 = () => ({
  id: "c1", title: "거북목", status: "ready", language: "ko",
  data: { flow: { cards: [
    장(1, { status: "done", assetPath: "me/sns/c1/1.png" }),
    장(2, { status: "done", assetPath: "me/sns/c1/2.png" }),
    장(3, { status: "failed" }),
  ] } },
});
const 원고작업 = () => ({ id: "c1", title: "거북목", status: "copy_ready", language: "ko", data: { flow: { cards: [장(1), 장(2)] } } });

beforeEach(() => {
  고친것.length = 0; 다시만든것.length = 0; 부른게시글.length = 0;
});

describe("한 장 글 고치기 (3단계 §6-2)", () => {
  it("칸으로 온 글은 그대로 저장한다, 그림이 있는 장이면 다시 그릴지 묻게 한다", async () => {
    const got = await editCard(요청(), 만든작업(), 2, { copy: { headline: "새 제목" } });
    expect(고친것).toEqual([{ index: "2", body: { headline: "새 제목" } }]);
    expect(got.needsRedraw).toBe(true);
  });

  it("말로 오면 고른 글 모델이 고치고, 빈 칸은 안 보낸다", async () => {
    const 받은부탁: string[] = [];
    await editCard(요청(), 만든작업(), 2, { words: "더 짧게" }, async (prompt) => {
      받은부탁.push(prompt);
      return { headline: "", body: "짧게", accent: "", footnote: "" };
    });
    expect(받은부탁[0]).toContain("더 짧게");
    expect(고친것[0]!.body).toEqual({ body: "짧게" });
  });

  it("그림이 없는 장(원고 단계)은 다시 그릴 필요가 없다", async () => {
    expect((await editCard(요청(), 원고작업(), 1, { copy: { body: "x" } })).needsRedraw).toBe(false);
  });

  it("고칠 것이 없으면 저장하지 않고 멈춘다", async () => {
    await expect(editCard(요청(), 만든작업(), 2, { words: "더 짧게" }, async () => ({ headline: "", body: "", accent: "", footnote: "" })))
      .rejects.toThrow("고칠 글");
    await expect(editCard(요청(), 만든작업(), 2, {})).rejects.toThrow("고칠 글");
    expect(고친것).toEqual([]);
  });

  it("없는 번호는 멈춘다", async () => {
    await expect(editCard(요청(), 만든작업(), 9, { copy: { body: "x" } })).rejects.toThrow("없습니다");
    expect(고친것).toEqual([]);
  });
});

describe("게시글 (3단계 §6-4)", () => {
  it("카드뉴스 게시글 라우트를 부르고 작업을 돌려준다", async () => {
    expect((await captionCard(요청(), "c1")).id).toBe("c1");
    expect(부른게시글).toEqual(["c1"]);
  });
});
