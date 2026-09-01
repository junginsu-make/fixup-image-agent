import { describe, expect, it, vi } from "vitest";
import { EMPTY_SLOTS } from "@fixup/poster-core";
import { collectPoster, submitPoster } from "../poster/flow";

const job = {
  projectId: "p1",
  modelId: "gpt-image-2",
  ratioId: "2:3",
  variants: 3,
  slots: { ...EMPTY_SLOTS, headline: "가을" },
  referenceUrls: ["https://fal.media/ref.png"],
  preservedUrls: [] as string[],
};

function deps(overrides: Record<string, unknown> = {}) {
  const created: unknown[] = [];
  const completed: unknown[] = [];
  const added: unknown[] = [];
  return {
    created, completed, added,
    dependencies: {
      queue: {
        submitJob: vi.fn(async () => ({ requestId: "fal-1" })),
        jobStatus: vi.fn(async () => "completed" as const),
        jobResult: vi.fn(async () => ({ images: [{ url: "u1" }, { url: "u2" }, { url: "u3" }] })),
        ...(overrides.queue as object ?? {}),
      },
      requests: {
        create: vi.fn(async (row: unknown) => { created.push(row); return { id: "req-1" }; }),
        complete: vi.fn(async (id: string, patch: unknown) => { completed.push({ id, patch }); }),
      },
      images: {
        byProject: async () => [],
        add: vi.fn(async (rows: unknown[]) => { added.push(...rows); return rows as never; }),
        select: async () => {},
        saveReview: async () => {},
      },
      saveImage: vi.fn(async (_p: string, index: number) => `p1/${index}.png`),
      ...overrides,
    } as never,
  };
}

describe("포스터 제출", () => {
  it("한 번만 제출한다", async () => {
    const { dependencies } = deps();
    await submitPoster(job, dependencies);
    expect((dependencies as never as { queue: { submitJob: { mock: { calls: unknown[] } } } })
      .queue.submitJob.mock.calls).toHaveLength(1);
  });

  it("제출 직후 장부에 적는다 — 여기서 죽어도 돈을 찾을 수 있어야 한다", async () => {
    const { dependencies, created } = deps();
    const result = await submitPoster(job, dependencies);
    expect(created).toHaveLength(1);
    expect(result.falRequestId).toBe("fal-1");
    expect((created[0] as { requestedImages: number }).requestedImages).toBe(3);
  });

  it("장부 입력에 userId 가 없다 — 세션에 묶인 저장소가 붙인다", async () => {
    const { dependencies, created } = deps();
    await submitPoster(job, dependencies);
    expect(created[0]).not.toHaveProperty("userId");
  });

  it("만들 수 없는 조합은 제출조차 하지 않는다", async () => {
    const { dependencies } = deps();
    await expect(submitPoster(
      { ...job, modelId: "nano-banana-pro", ratioId: "a4-print" },
      dependencies,
    )).rejects.toThrow(/인쇄/);
    expect((dependencies as never as { queue: { submitJob: { mock: { calls: unknown[] } } } })
      .queue.submitJob.mock.calls).toHaveLength(0);
  });

  it("표에 없는 크기면 근사임을 알린다", async () => {
    const { dependencies } = deps();
    const result = await submitPoster({ ...job, ratioId: "a4-print" }, dependencies);
    expect(result.approximate).toBe(true);
  });
});

describe("포스터 결과 회수", () => {
  const collect = {
    projectId: "p1", requestRowId: "req-1", falRequestId: "fal-1",
    endpoint: "openai/gpt-image-2/edit", unitCostUsd: 0.178,
  };

  it("아직 안 끝났으면 기다린다 — 결과를 부르지 않는다", async () => {
    const { dependencies } = deps({ queue: { jobStatus: vi.fn(async () => "in_progress" as const) } });
    const result = await collectPoster(collect, dependencies);
    expect(result.done).toBe(false);
  });

  it("비용을 이미지 저장보다 먼저 확정한다 — 저장이 실패해도 돈은 나갔다", async () => {
    const order: string[] = [];
    const { dependencies } = deps({
      requests: {
        create: async () => ({ id: "req-1" }),
        complete: async () => { order.push("cost"); },
      },
      saveImage: async () => { order.push("save"); return "p.png"; },
    });
    await collectPoster(collect, dependencies);
    expect(order[0]).toBe("cost");
  });

  it("받은 장수만큼 비용을 확정한다", async () => {
    const { dependencies, completed } = deps();
    await collectPoster(collect, dependencies);
    expect((completed[0] as { patch: { costUsd: number } }).patch.costUsd).toBeCloseTo(0.534, 4);
  });

  it("받은 장수만큼 이미지 행을 만든다", async () => {
    const { dependencies, added } = deps();
    await collectPoster(collect, dependencies);
    expect(added).toHaveLength(3);
    expect(added.map((row) => (row as { variantIndex: number }).variantIndex)).toEqual([0, 1, 2]);
  });

  it("이미지 행에 비용을 적지 않는다 — 요청 행에만 있다", async () => {
    const { dependencies, added } = deps();
    await collectPoster(collect, dependencies);
    for (const row of added) expect(row).not.toHaveProperty("costUsd");
  });
});
