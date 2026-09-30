import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **카드뉴스 작업 찾기는 내 것만**(2단계 §7 · §8).
 *
 * 카드뉴스 저장소는 팀 읽기 규칙 덕에 팀원의 작업도 읽어 온다(`sns-flow-store.ts`).
 * 팀 기능은 잠들어 있어도 그 규칙은 살아 있다. 다시 쓰기 · 다시 열기는 내 것만 본다.
 */

vi.mock("server-only", () => ({}));

let 작업들: Record<string, { id: string; userId: string }>;
let 원고: Record<string, unknown>;
let 고치기실패: boolean;
const 고친것: Array<{ id: string; index: string; body: Record<string, unknown> }> = [];

vi.mock("../../sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({ get: async (id: string) => 작업들[id] }),
}));
vi.mock("../../sns/runtime", () => ({ refreshProjectAssetUrls: async (p: unknown) => p }));
vi.mock("../../../app/api/sns/projects/route", () => ({ POST: async () => Response.json({ ok: true, project: { id: "c1" } }) }));
vi.mock("../../../app/api/sns/projects/[id]/plan/route", () => ({ POST: async () => Response.json({ ok: true, project: 원고 }) }));
vi.mock("../../../app/api/sns/projects/[id]/cards/[index]/route", () => ({
  PATCH: async (req: Request, { params }: { params: Promise<{ id: string; index: string }> }) => {
    const { id, index } = await params;
    const body = await req.json();
    고친것.push({ id, index, body });
    if (고치기실패) return Response.json({ ok: false, message: "저장 실패" }, { status: 500 });
    return Response.json({ ok: true, project: { ...원고, patched: body } });
  },
}));
vi.mock("../../../app/api/sns/projects/[id]/generate/route", () => ({ POST: async () => Response.json({}) }));

const { cardnewsProject, draftCardnews, lastCardnewsProject } = await import("../cardnews-steps");

const 카드 = (index: number, role: string, headline: string, extra: Record<string, unknown> = {}) =>
  ({ index, role, kind: "generated", copy: { headline }, status: "pending", ...extra });
const 기본원고 = () => ({
  id: "c1", language: "ko",
  data: { flow: { cards: [카드(1, "cover", "표지"), 카드(2, "body", "목표부터"), 카드(3, "ending", "핵심 내용을 기억해 주세요")] } },
});
const 요청 = () => new Request("http://localhost/api/easy/generate", {
  method: "POST", headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
});

beforeEach(() => {
  작업들 = { mine: { id: "mine", userId: "me" }, theirs: { id: "theirs", userId: "other" } };
  원고 = 기본원고();
  고치기실패 = false;
  고친것.length = 0;
});

describe("마지막 장 채우기 (2026-09-30 사용자 결정 B)", () => {
  it("AI 가 쓴 정리 문장을 카드뉴스 원고 고치기로 저장하고, 저장된 원고를 돌려준다", async () => {
    const got = await draftCardnews(요청(), {}, async () => ({ headline: "핵심만 다시", body: "· 목표부터" }));
    expect(고친것).toEqual([{ id: "c1", index: "3", body: { headline: "핵심만 다시", body: "· 목표부터" } }]);
    expect((got.project as unknown as { patched: unknown }).patched).toEqual({ headline: "핵심만 다시", body: "· 목표부터" });
  });

  it("AI 가 실패하면 앞 장 제목 목록으로 채운다", async () => {
    await draftCardnews(요청(), {}, async () => { throw new Error("모델 실패"); });
    expect(고친것[0]!.body).toEqual({ headline: "오늘의 핵심 정리", body: "· 목표부터" });
  });

  it("AI 가 모양이 틀린 답을 주면 앞 장 제목 목록으로 채운다", async () => {
    await draftCardnews(요청(), {}, async () => ({ headline: "", body: "" }));
    expect(고친것[0]!.body).toEqual({ headline: "오늘의 핵심 정리", body: "· 목표부터" });
  });

  it("채울 끝 장이 없으면(끝 장 그림) 안 부른다", async () => {
    원고 = { ...기본원고(), data: { flow: { cards: [카드(1, "cover", "표지"), 카드(2, "ending", "x", { kind: "ending_image" })] } } };
    const 쓴다 = vi.fn(async () => ({ headline: "a", body: "b" }));
    await draftCardnews(요청(), {}, 쓴다);
    expect(쓴다).not.toHaveBeenCalled();
    expect(고친것).toEqual([]);
  });

  it("저장이 실패해도 원고는 그대로 돌려준다(원고를 잃지 않는다)", async () => {
    고치기실패 = true;
    const got = await draftCardnews(요청(), {}, async () => ({ headline: "a", body: "b" }));
    expect(got.projectId).toBe("c1");
    expect(got.project).toEqual(기본원고());
  });
});

describe("카드뉴스 작업 찾기", () => {
  it("내 작업은 찾는다", async () => {
    expect((await cardnewsProject("me", "mine"))?.id).toBe("mine");
  });

  it("남의 작업은 없는 것으로 본다", async () => {
    expect(await cardnewsProject("me", "theirs")).toBeNull();
  });

  it("없는 작업(포스터 작업)은 없는 것으로 본다", async () => {
    expect(await cardnewsProject("me", "poster-1")).toBeNull();
  });

  it("대화의 마지막 카드뉴스 작업을 뒤에서부터 찾고, 남의 것은 건너뛴다", async () => {
    const rows = [
      { role: "image", workId: "mine" },
      { role: "image", workId: "theirs" },
      { role: "image", workId: "poster-1" },
      { role: "user", workId: null },
    ];
    expect((await lastCardnewsProject("me", rows))?.id).toBe("mine");
  });
});
