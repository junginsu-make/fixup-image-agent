import { describe, expect, it, vi } from "vitest";
import {
  buildModelInput,
  generateCard,
  generateCards,
  type CardGenerationDependencies,
  type GeneratedCardJob,
} from "../generate";
import { letterboxPlan } from "../letterbox";
import { modelById } from "../models";
import { resolveSize } from "../ratios";

describe("모델 입력", () => {
  it("GPT 는 image_size 를 명시한다", () => {
    const input = buildModelInput(
      modelById("gpt-image-2"),
      "i2i",
      resolveSize("4:5", modelById("gpt-image-2")),
      "p",
      ["u"],
    );
    expect(input.image_size).toEqual({ width: 1088, height: 1360 });
    expect(input.quality).toBe("high");
  });

  it("nano 는 aspect_ratio 와 정해진 resolution 만 준다", () => {
    const nano2 = buildModelInput(
      modelById("nano-banana-2"), "i2i",
      resolveSize("9:16", modelById("nano-banana-2")), "p", ["u"],
    );
    const original = buildModelInput(
      modelById("nano-banana"), "i2i",
      resolveSize("9:16", modelById("nano-banana")), "p", ["u"],
    );
    expect(nano2.aspect_ratio).toBe("9:16");
    expect(nano2.resolution).toBe("2K");
    expect(original).not.toHaveProperty("resolution");
  });

  it("항상 한 장만 요청한다", () => {
    for (const id of ["gpt-image-2", "nano-banana-pro", "nano-banana-2", "nano-banana"]) {
      const model = modelById(id);
      const input = buildModelInput(model, "t2i", resolveSize("4:5", model), "p", []);
      expect(input.num_images).toBe(1);
    }
  });

  it("웹 검색과 thinking 을 켜지 않는다", () => {
    const input = buildModelInput(
      modelById("nano-banana-2"), "i2i",
      resolveSize("4:5", modelById("nano-banana-2")), "p", ["u"],
    );
    const text = JSON.stringify(input);
    expect(text).not.toContain("web_search");
    expect(text).not.toContain("thinking");
  });
});

function dependencies(events: string[] = []): CardGenerationDependencies {
  return {
    requestStore: {
      create: async (row) => { events.push("request:create"); return { id: "request-1", ...row }; },
      complete: async (_id, _patch) => { events.push("request:complete"); },
    },
    cardStore: {
      markDone: async () => { events.push("card:done"); },
      markFailed: async (_index, message) => { events.push(`card:failed:${message}`); },
    },
    runner: {
      run: async () => { events.push("fal"); return { requestId: "fal-1", images: [{ url: "https://fal/image.png" }] }; },
    },
    saveAsset: async () => { events.push("asset"); return "user/sns/project/1.png"; },
    saveOriginal: async () => { events.push("original"); return "user/sns/project/original.png"; },
  };
}

function generatedJob(patch: Partial<GeneratedCardJob> = {}): GeneratedCardJob {
  return {
    kind: "generated",
    projectId: "project-1",
    cardIndex: 1,
    modelId: "gpt-image-2",
    ratioId: "4:5",
    prompt: "prompt",
    imageUrls: ["https://reference/body.png"],
    ...patch,
  };
}

describe("카드 생성", () => {
  it("요청 한 행을 남기고 fal 직후 비용을 한 번 기록한다", async () => {
    const created: unknown[] = [];
    const completed: unknown[] = [];
    const events: string[] = [];
    const deps = dependencies(events);
    deps.requestStore = {
      create: async (row) => { events.push("request:create"); created.push(row); return { id: "request-1", ...row }; },
      complete: async (_id, patch) => { events.push("request:complete"); completed.push(patch); },
    };

    const result = await generateCard(generatedJob(), deps);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ requestedImages: 1, unitCostUsd: 0.178, mode: "i2i" });
    expect(created[0]).not.toHaveProperty("userId");
    expect(completed).toEqual([{
      falRequestId: "fal-1",
      returnedImages: 1,
      costUsd: 0.178,
    }]);
    expect(events).toEqual(["request:create", "fal", "request:complete", "asset", "card:done"]);
    expect(result.status).toBe("done");
  });

  it("레퍼런스가 있으면 i2i, 없으면 t2i 로 부른다", async () => {
    const endpoints: string[] = [];
    const deps = dependencies();
    deps.runner = {
      run: async (endpoint) => { endpoints.push(endpoint); return { requestId: "r", images: [{ url: "u" }] }; },
    };
    await generateCard(generatedJob({ cardIndex: 1, imageUrls: ["u"] }), deps);
    await generateCard(generatedJob({ cardIndex: 2, imageUrls: [] }), deps);
    expect(endpoints).toEqual(["openai/gpt-image-2/edit", "openai/gpt-image-2"]);
  });

  it("추가로 들어온 이전 카드 결과는 fal 입력에 넣지 않는다", async () => {
    let sent: unknown;
    const deps = dependencies();
    deps.runner = {
      run: async (_endpoint, input) => { sent = input; return { requestId: "r", images: [{ url: "u" }] }; },
    };
    await generateCard({
      ...generatedJob(),
      previousCardUrl: "https://previous.png",
    } as GeneratedCardJob, deps);
    expect((sent as { image_urls?: string[] }).image_urls).not.toContain("https://previous.png");
  });

  it("한 카드가 실패해도 뒤 카드를 계속하고 이유를 카드 행에 남긴다", async () => {
    const failed: Array<{ index: number; message: string }> = [];
    const called: number[] = [];
    const deps = dependencies();
    deps.runner = {
      run: async (_endpoint, _input, cardIndex) => {
        called.push(cardIndex);
        if (cardIndex === 2) throw new Error("두 번째 fal 실패");
        return { requestId: `r${cardIndex}`, images: [{ url: `u${cardIndex}` }] };
      },
    };
    deps.cardStore.markFailed = async (index, message) => { failed.push({ index, message }); };

    const results = await generateCards([
      generatedJob({ cardIndex: 1 }),
      generatedJob({ cardIndex: 2 }),
      generatedJob({ cardIndex: 3 }),
    ], deps);

    expect(called).toEqual([1, 2, 3]);
    expect(results.map((result) => result.status)).toEqual(["done", "failed", "done"]);
    expect(failed).toEqual([{ index: 2, message: "두 번째 fal 실패" }]);
  });

  it("원본 그대로 쓸 장은 fal 과 비용 요청을 건너뛴다", async () => {
    const deps = dependencies();
    deps.runner.run = vi.fn(deps.runner.run);
    deps.requestStore.create = vi.fn(deps.requestStore.create);
    const result = await generateCard({
      kind: "place_as_is",
      projectId: "project-1",
      cardIndex: 2,
      letterbox: letterboxPlan({ width: 1600, height: 900 }, { width: 1088, height: 1360 }),
    }, deps);
    expect(result).toMatchObject({ status: "done", usedAi: false, request: undefined });
    expect(deps.runner.run).not.toHaveBeenCalled();
    expect(deps.requestStore.create).not.toHaveBeenCalled();
  });
});
