import { describe, expect, it, vi } from "vitest";
import { FalHttpRunner, SnsProviderConfigurationError, requireSnsProviderKeys } from "../sns/providers";

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

describe("fal HTTP 어댑터", () => {
  it("num_images가 1이 아니면 네트워크 전에 거부한다", async () => {
    const fetcher = vi.fn();
    const runner = new FalHttpRunner("fal-key", fetcher);
    await expect(runner.run("fal-ai/model", { prompt: "x", num_images: 2 }, 1)).rejects.toThrow(/num_images.*1/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("한 장 요청을 fal.run에 한 번만 보낸다", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ request_id: "fal-1", images: [{ url: "https://example.com/1.png" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const runner = new FalHttpRunner("fal-key", fetcher);
    const result = await runner.run("fal-ai/model", { prompt: "x", num_images: 1 }, 1);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://fal.run/fal-ai/model");
    expect(result.images).toHaveLength(1);
  });

  it("본문에 request_id가 없으면 fal 응답 헤더의 요청 ID를 보존한다", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ images: [{ url: "https://example.com/1.png" }] }), {
      status: 200,
      headers: { "content-type": "application/json", "x-fal-request-id": "fal-header-1" },
    }));
    const runner = new FalHttpRunner("fal-key", fetcher);
    const result = await runner.run("fal-ai/model", { prompt: "x", num_images: 1 }, 1);
    expect(result.requestId).toBe("fal-header-1");
  });
});
