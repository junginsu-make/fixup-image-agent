import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **검수도 돈이 드는 길이다 — 본인 그림만 본다**(2026-09-29 리뷰).
 *
 * 검수는 그림을 fal 에 올리고 검수 모델(LLM)을 부른다. 작업·그림 읽기는 팀이면
 * 팀원 것까지 열려 있는데(RLS), 결과 저장(`saveReview`)은 본인 것만 된다. 그래서
 * 팀원의 작업을 검수하면 **모델 값을 낸 뒤에야** 저장에서 막혔다. 그림을 본인 것만
 * 읽으면 돈이 나가기 전에 「먼저 변형 하나를 고르세요」로 멈춘다.
 */

vi.mock("server-only", () => ({}));

const listOptions: unknown[] = [];
const uploads: string[] = [];
let ownImages: Array<{ id: string; selected: boolean; assetPath: string }> = [];
/** 팀 읽기 규칙으로 보이는 남의 그림 — 주인 조건을 안 걸면 이것이 나온다. */
const teammateImage = { id: "남의그림", selected: true, assetPath: "u2/poster/p1/req/0.png" };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => ({ id: "p1", data: { slots: {} } }) },
    images: {
      byProject: async (_projectId: string, options?: { ownOnly?: boolean }) => {
        listOptions.push(options);
        return options?.ownOnly ? ownImages : [...ownImages, teammateImage];
      },
      saveReview: async () => {},
    },
  }),
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async (assetPath: string) => ({ bytes: Buffer.from(assetPath), contentType: "image/png" }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({
    uploader: { uploadReference: async (bytes: Buffer) => { uploads.push(bytes.toString()); return "https://fal/x.png"; } },
  }),
  createPosterReviewProviders: () => ({ primary: {} }),
  PosterProviderConfigurationError: class extends Error { missing: string[] = []; },
}));

vi.mock("@fixup/poster-core", async () => {
  const real = await vi.importActual<typeof import("@fixup/poster-core")>("@fixup/poster-core");
  return {
    ...real,
    reviewPoster: async () => ({ status: "ok", review: { decision: "pass", summary: "좋다", issues: [] }, issues: [] }),
  };
});

const { POST } = await import("../projects/[id]/review/route");

const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  listOptions.length = 0;
  uploads.length = 0;
  ownImages = [];
});

describe("검수는 본인 그림만", () => {
  it("그림 목록을 본인 것만 달라고 한다", async () => {
    ownImages = [{ id: "내그림", selected: true, assetPath: "u1/poster/p1/req/0.png" }];
    await call();
    expect(listOptions[0]).toMatchObject({ ownOnly: true });
    expect(uploads).toEqual(["u1/poster/p1/req/0.png"]);
  });

  it("본인이 고른 그림이 없으면 올리기·검수 전에 멈춘다 — 팀원 그림이 골라져 있어도", async () => {
    const response = await call();
    expect(response.status).toBe(400);
    expect(uploads).toEqual([]);
  });
});
