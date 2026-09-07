import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 수정이 크기를 실어 보내는 배선.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-b
 *
 * **규칙(`editSourceSize`)은 순수 함수 시험이 덮는데, 라우트가 그것을 부르는지는
 * 아무도 안 봤다.** `sourceSize: editSourceSize(…)` 를 `undefined` 로 바꾸는
 * 뮤테이션 — 즉 3-b-2 를 통째로 되돌리는 뮤테이션 — 에서 저장소 772개가 전부
 * 초록이었다.
 */

vi.mock("server-only", () => ({}));

let project: { id: string; ratio: string; modelId: string; data: Record<string, unknown> };
let parent: { id: string; assetPath: string; selected: boolean; width: number | null; height: number | null };
const submitted: Array<{ ratioId: string; sourceSize?: { width: number; height: number } }> = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => project },
    images: { byProject: async () => [parent] },
    requests: {},
  }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({
    queue: {},
    uploader: { uploadReference: async () => "https://fal/parent.png" },
  }),
  PosterProviderConfigurationError: class extends Error {},
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  posterImageBytes: async () => ({ bytes: Buffer.from("x"), contentType: "image/png" }),
}));

vi.mock("../../../../lib/poster/flow", () => ({
  submitPoster: async (job: { ratioId: string; sourceSize?: { width: number; height: number } }) => {
    submitted.push(job);
    return { requestRowId: "r", falRequestId: "f", endpoint: "e", estimatedUsd: 1 };
  },
}));

const { POST } = await import("../projects/[id]/edit/route");

const call = (body: unknown) =>
  POST(
    new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "p1" }) },
  );

beforeEach(() => {
  project = {
    id: "p1", ratio: "match-source", modelId: "gpt-image-2",
    data: { slots: { action: "" } },
  };
  parent = { id: "i1", assetPath: "u1/poster/p1/0.png", selected: true, width: 1200, height: 628 };
  submitted.length = 0;
});

describe("수정이 크기를 실어 보낸다", () => {
  it("광고 마스터가 있으면 그 값이 넘어간다", async () => {
    project.data.adMaster = { width: 2048, height: 1072 };
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toEqual({ width: 2048, height: 1072 });
  });

  /**
   * **광고와 무관한 기존 사용자가 여기서 고쳐진다.** 지금까지는 크기가 안 넘어가
   * 「첨부한 그림의 크기를 읽지 못해」로 거절됐다.
   */
  it("마스터가 없으면 부모 그림 크기가 넘어간다", async () => {
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toEqual({ width: 1200, height: 628 });
  });

  /**
   * **사용자가 고른 비율을 덮으면 안 된다.** 화면이 수정하면서 비율을 바꿀 수
   * 있는데(`ratioId ?? project.ratio`), 그때 크기를 실으면 고른 비율이 무시된다.
   */
  it("비율을 바꾸면 크기를 안 보낸다", async () => {
    project.data.adMaster = { width: 2048, height: 1072 };
    await call({ instruction: "세로로 다시", ratioId: "9:16" });
    expect(submitted[0]!.ratioId).toBe("9:16");
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });

  /** 옛 행에는 크기가 없다. 그때는 지금까지처럼 거절된다 — 후퇴가 없다. */
  it("부모 크기를 모르면 안 보낸다", async () => {
    parent = { ...parent, width: null, height: null };
    await call({ instruction: "글자를 키워 주세요" });
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });
});
