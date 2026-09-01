import { describe, expect, it, vi } from "vitest";
import { FalQueuedClient, SnsProviderConfigurationError, requireSnsProviderKeys } from "../sns/providers";

describe("제공자 설정", () => {
  it("기획 키가 없으면 빠진 환경변수 이름을 사람이 읽는 문구로 알린다", () => {
    expect(() => requireSnsProviderKeys("planning", {})).toThrowError(SnsProviderConfigurationError);
    expect(() => requireSnsProviderKeys("planning", {})).toThrow(/ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
  });

  it("생성 키가 없으면 FAL_KEY를 따로 알린다", () => {
    expect(() => requireSnsProviderKeys("generation", {
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
    })).toThrow(/FAL_KEY/);
  });
});

describe("fal queue 어댑터", () => {
  it("레퍼런스를 1시간 수명으로 올리고 submit에서 request_id를 즉시 돌려준다", async () => {
    const upload = vi.fn(async () => "https://v3b.fal.media/reference.jpg");
    const submit = vi.fn(async () => ({
      status: "IN_QUEUE", request_id: "fal-queue-1", queue_position: 0,
      status_url: "https://queue.fal.run/fal-ai/nano-banana/edit/requests/fal-queue-1/status",
      response_url: "https://queue.fal.run/fal-ai/nano-banana/edit/requests/fal-queue-1",
      cancel_url: "https://queue.fal.run/fal-ai/nano-banana/edit/requests/fal-queue-1/cancel",
    }));
    const client = {
      storage: { upload },
      queue: { submit, status: vi.fn(), result: vi.fn() },
    };
    const queued = new FalQueuedClient("key", client as never);
    const referenceUrl = await queued.uploadReference({
      id: "ref-1", kind: "style_reference", role: "body",
      assetPath: "user/references/ref.jpg", url: "data:image/jpeg;base64,eA==",
    });
    const submitted = await queued.submit("fal-ai/nano-banana/edit", { prompt: "x", num_images: 1 }, 1);

    expect(referenceUrl).toBe("https://v3b.fal.media/reference.jpg");
    expect(upload).toHaveBeenCalledWith(expect.any(Blob), { lifecycle: { expiresIn: "1h" } });
    expect(submit).toHaveBeenCalledOnce();
    expect(submitted).toMatchObject({ requestId: "fal-queue-1", endpoint: "fal-ai/nano-banana/edit" });
    await expect(queued.submit("fal-ai/nano-banana/edit", { prompt: "x", num_images: 2 }, 2)).rejects.toThrow(/num_images.*1/);
    expect(submit).toHaveBeenCalledOnce();
  });
});
