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

// 기본 보관 길(운영 저장소 · 로컬 파일 · 참고 이미지 저장)은 시험에서 안 쓴다. 들여오기만 막는다.
vi.mock("../../reference-images", () => ({ saveReferenceImage: async () => ({}) }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => true, localStoreRoot: () => "", readLocalSnsResultFile: async () => Buffer.from([]) }));

const { captionCard, editCard, redoCard } = await import("../cardnews-after-steps");

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

describe("한 장 다시 만들기 (3단계 §6-3)", () => {
  const 보관 = () => {
    const 넣은것: Array<Record<string, unknown>> = [];
    const 읽은것: string[] = [];
    return {
      넣은것,
      읽은것,
      deps: {
        readFile: async (path: string) => {
          읽은것.push(path);
          return { bytes: new Uint8Array([1, 2]), mimeType: path.endsWith(".png") ? "image/png" : "image/jpeg" };
        },
        save: async (input: Record<string, unknown>) => { 넣은것.push(input); return {}; },
        newId: () => "00000000-0000-4000-8000-000000000099",
      },
    };
  };

  it("앞 그림을 참고 이미지로 보관한 뒤 그 장만 다시 만든다", async () => {
    const { 넣은것, 읽은것, deps } = 보관();
    const got = await redoCard(요청(), "me", 만든작업(), 2, "글자 크게", deps);
    expect(읽은것).toEqual(["me/sns/c1/2.png"]);
    expect(넣은것).toEqual([{
      userId: "me", id: "00000000-0000-4000-8000-000000000099", title: "거북목 · 2번 장 이전 그림",
      purpose: "cardnews", bytes: new Uint8Array([1, 2]), mimeType: "image/png",
    }]);
    expect(다시만든것).toEqual([{ index: "2", body: { note: "글자 크게" } }]);
    expect(got.archived).toEqual({ id: "00000000-0000-4000-8000-000000000099", title: "거북목 · 2번 장 이전 그림" });
    expect(got.project.status).toBe("generating");
  });

  /** Review Focus 2 */
  it("보관이 실패하면 다시 만들지 않는다(앞 그림을 잃지 않고 값도 안 나간다)", async () => {
    const { deps } = 보관();
    await expect(redoCard(요청(), "me", 만든작업(), 2, undefined, { ...deps, save: async () => { throw new Error("디스크"); } }))
      .rejects.toThrow("보관하지 못해");
    await expect(redoCard(요청(), "me", 만든작업(), 2, undefined, { ...deps, readFile: async () => { throw new Error("읽기"); } }))
      .rejects.toThrow("보관하지 못해");
    expect(다시만든것).toEqual([]);
  });

  it("그림이 없던 장(실패한 장)은 보관 없이 다시 만든다", async () => {
    const { 넣은것, deps } = 보관();
    const got = await redoCard(요청(), "me", 만든작업(), 3, undefined, deps);
    expect(넣은것).toEqual([]);
    expect(got.archived).toBeNull();
    expect(다시만든것).toEqual([{ index: "3", body: {} }]);
  });

  it("없는 번호는 보관도 다시 만들기도 안 한다", async () => {
    const { 넣은것, deps } = 보관();
    await expect(redoCard(요청(), "me", 만든작업(), 9, undefined, deps)).rejects.toThrow("없습니다");
    expect(넣은것).toEqual([]);
    expect(다시만든것).toEqual([]);
  });

  it("바라는 점은 500자까지만 보낸다", async () => {
    await redoCard(요청(), "me", 만든작업(), 3, "가".repeat(600), 보관().deps);
    expect((다시만든것[0]!.body as { note: string }).note).toHaveLength(500);
  });
});
