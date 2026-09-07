import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 광고 마스터가 생성까지 가는 배선.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-b·3-d
 *
 * **이 라우트에는 시험이 하나도 없었다.** `app/api/poster/__tests__/` 에는
 * `projects`·`poster-file-route`·`poster-delete-thumbnails` 뿐이었다.
 *
 * 여기서 보는 것은 **무엇이 `submitPoster` 로 넘어가는지** — 배선이다.
 * `ad-export-route.test.ts` 가 같은 방식으로 쓰였다.
 */

vi.mock("server-only", () => ({}));

let project: { id: string; ratio: string; status: string; updatedAt: string; modelId: string; data: Record<string, unknown> } | undefined;
const measured: string[] = [];
const submitted: Array<{ sourceSize?: { width: number; height: number } }> = [];
const updates: Array<Record<string, unknown>> = [];
let submitThrows: Error | null = null;

vi.mock("sharp", () => ({
  default: () => ({ metadata: async () => ({ width: 800, height: 600 }) }),
}));

vi.mock("../../../../lib/poster/asset-bytes", () => ({
  referenceBytes: async (path: string) => {
    measured.push(path);
    return { bytes: Buffer.from("x") };
  },
}));

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => project,
      /**
       * **patch 를 담기만 하면 안 된다.** 그러면 두 번째 요청이 첫 번째가 바꾼
       * 상태를 못 보고, 동시 제출 구멍이 시험에 안 보인다.
       */
      update: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        Object.assign(project!, patch, { updatedAt: new Date().toISOString() });
        return project;
      },
    },
    references: { byIds: async () => [{ id: "r1", storagePath: "u1/ref/1.png" }] },
    requests: {}, images: {},
  }),
}));

vi.mock("../../../../lib/poster/providers", () => ({
  createPosterFalClients: () => ({ queue: {} }),
  PosterProviderConfigurationError: class extends Error {},
}));

vi.mock("../../../../lib/fal/upload", () => ({
  uploadUniqueReferences: async () => {
    // 실제로는 네트워크다. 그 사이에 두 번째 요청이 도착한다.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { "r1": "https://fal/r1.png" };
  },
}));

vi.mock("../../../../lib/poster/flow", () => ({
  submitPoster: async (job: { sourceSize?: { width: number; height: number } }) => {
    submitted.push(job);
    if (submitThrows) throw submitThrows;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { requestRowId: "req1", falRequestId: "fal1", endpoint: "e", estimatedUsd: 1 };
  },
}));

const { POST } = await import("../projects/[id]/generate/route");

const call = () =>
  POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "p1" }) });

const base = {
  id: "p1", ratio: "match-source", status: "ready", modelId: "gpt-image-2",
  updatedAt: new Date(0).toISOString(),
  data: { variants: 1, referenceIds: ["r1"], preservedIds: [], slots: {}, instruction: "x" },
};

beforeEach(() => {
  project = { ...base, data: { ...base.data } };
  measured.length = 0;
  submitted.length = 0;
  updates.length = 0;
  submitThrows = null;
});

describe("마스터 크기가 어디서 오는가", () => {
  /**
   * **호출 횟수를 본다.** 「`sourceSize` 가 첨부 크기와 같다」만 단언하면
   * 구현이 `?? measure(…)` 를 통째로 지워도 첨부가 없는 픽스처에서는 통과한다.
   * 3단계가 실제로 바꾸는 동작은 **「측정을 안 한다」**이다.
   */
  it("마스터가 실려 있으면 첨부를 재지 않는다", async () => {
    project!.data.adMaster = { width: 2048, height: 1072 };
    await call();
    expect(measured, "마스터가 있는데 파일을 읽으면 안 된다").toEqual([]);
    expect(submitted[0]!.sourceSize).toEqual({ width: 2048, height: 1072 });
  });

  it("마스터가 없으면 첨부를 잰다 — 지금까지의 동작", async () => {
    await call();
    expect(measured).toHaveLength(1);
    expect(submitted[0]!.sourceSize).toEqual({ width: 800, height: 600 });
  });

  it("match-source 가 아니면 어느 쪽도 안 본다", async () => {
    project!.ratio = "1:1";
    project!.data.adMaster = { width: 2048, height: 1072 };
    await call();
    expect(measured).toEqual([]);
    expect(submitted[0]!.sourceSize).toBeUndefined();
  });
});

describe("같은 클릭이 두 번 오면", () => {
  /**
   * 이 라우트는 `project.status` 를 안 봤고 상태 갱신도 제출 뒤였다. 같은
   * 프로젝트에 POST 를 두 번 하면 fal 작업이 둘 생기고 **둘 다 과금된다.**
   */
  it("막 제출한 작업은 다시 제출하지 않는다", async () => {
    project!.status = "generating";
    project!.updatedAt = new Date().toISOString();
    const response = await call();
    expect(response.status).toBe(409);
    expect(submitted, "돈이 두 번 나가면 안 된다").toEqual([]);
  });

  /**
   * **이쪽이 더 중요하다.** `status` 가 `"failed"` 로 가는 코드가 저장소에
   * 없어서, 단순히 「generating 이면 거절」로 두면 실패한 작업이 **영원히
   * 잠긴다.** 창이 지나면 언제나 다시 만들 수 있어야 한다.
   */
  it("오래 전에 멈춘 작업은 다시 만들 수 있다 — 영구히 잠기면 안 된다", async () => {
    project!.status = "generating";
    project!.updatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const response = await call();
    expect(response.status).toBe(200);
    expect(submitted).toHaveLength(1);
  });

  it("생성 중이 아니면 창과 무관하게 통과한다", async () => {
    project!.status = "ready";
    project!.updatedAt = new Date().toISOString();
    expect((await call()).status).toBe(200);
  });
});

describe("두 요청이 겹치면", () => {
  /**
   * **자물쇠를 검사만 하고 자리를 안 잡으면 소용이 없다.**
   *
   * 초판은 검사를 맨 앞에서 하고 `status: "generating"` 은 fal 업로드와 제출이
   * **전부 끝난 뒤**에 썼다. 그 사이가 네트워크라 수백 ms~수 초인데, 더블클릭의
   * 두 번째 요청은 그 구간에 도착해 **아직 `"ready"` 인 프로젝트를 읽고 통과한다.**
   * 자물쇠가 실제로 막던 것은 「첫 요청이 DB 갱신까지 마친 뒤의 재클릭」뿐이었다.
   */
  it("같은 클릭이 두 번 와도 한 번만 제출한다", async () => {
    const [first, second] = await Promise.all([call(), call()]);
    expect(submitted, "돈이 두 번 나가면 안 된다").toHaveLength(1);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  /**
   * **제출이 실패하면 자리를 돌려줘야 한다.** 안 그러면 지금까지 `"ready"` 로
   * 남아 바로 다시 누를 수 있던 것이, 창이 지날 때까지 잠긴다 — 기존 사용자에게
   * 없던 제약이 생긴다.
   */
  it("제출이 실패하면 상태를 되돌린다 — 바로 다시 누를 수 있어야 한다", async () => {
    submitThrows = new Error("fal 이 거절했습니다.");
    await call().catch(() => {});
    expect(project!.status, "generating 에 남으면 60초 동안 못 누른다").toBe("ready");
    submitThrows = null;
    expect((await call()).status).toBe(200);
  });
});
