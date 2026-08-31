import { describe, expect, it } from "vitest";
import {
  GLOBAL_AI_MODEL_CATEGORY,
  OFFICIAL_AI_SOURCE_PRESETS,
  OfficialAiSourceAdapter,
  parseOfficialChangelog,
  parseOfficialListing,
} from "../adapters/official-ai";
import type { IngestSource } from "../types";

function subscription(config: Record<string, unknown>, url = "https://example.com/updates"): IngestSource {
  const now = new Date().toISOString();
  return {
    id: "source_1", userId: "owner_1", name: "공식 소식", kind: "official_ai", url,
    enabled: true, intervalHours: 60, config, nextPollAt: now, createdAt: now, updatedAt: now,
  };
}

describe("글로벌 AI 모델 공식 소스", () => {
  it("제외 요청한 Mistral과 Cohere 없이 6개 공급자 프리셋을 제공한다", () => {
    expect(OFFICIAL_AI_SOURCE_PRESETS.map((item) => item.provider)).toEqual([
      "openai", "anthropic", "google", "meta", "xai", "deepseek",
    ]);
    expect(OFFICIAL_AI_SOURCE_PRESETS.every((item) => item.category === GLOBAL_AI_MODEL_CATEGORY)).toBe(true);
  });

  it("날짜별 변경 로그를 각각 독립된 수집 후보로 만든다", () => {
    const html = `<main><h1>Release notes</h1>
      <h2 id="august-13-2026">August 13, 2026</h2><p>Gemini 3.7 Flash is generally available.</p>
      <h2 id="july-30-2026">July 30, 2026</h2><p>Gemini Robotics is now in preview.</p></main>`;
    const items = parseOfficialChangelog(html, "https://ai.google.dev/changelog", {
      provider: "google", providerLabel: "Google Gemini", maxItems: 5,
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Google Gemini 업데이트 · August 13, 2026",
      url: "https://ai.google.dev/changelog#august-13-2026",
      publishedAt: "2026-08-13T00:00:00.000Z",
      metadata: { provider: "google", category: GLOBAL_AI_MODEL_CATEGORY, extractionStatus: "complete" },
    });
    expect(items[0]!.body).toContain("Gemini 3.7 Flash");
  });

  it("공식 블로그 목록에서는 허용된 글 주소만 발견한다", () => {
    const html = `<main>
      <article><a href="/blog/llama-update/"><h2>Llama 모델 업데이트</h2></a><time datetime="2026-08-20">Aug 20</time></article>
      <a href="/about/">회사 소개</a>
    </main>`;
    expect(parseOfficialListing(html, "https://ai.meta.com/blog/", {
      provider: "meta", providerLabel: "Meta AI", articlePathPrefix: "/blog/", maxItems: 5,
    })).toEqual([expect.objectContaining({
      externalId: "https://ai.meta.com/blog/llama-update/",
      title: "Llama 모델 업데이트",
      publishedAt: "2026-08-20T00:00:00.000Z",
      metadata: expect.objectContaining({ provider: "meta", category: GLOBAL_AI_MODEL_CATEGORY }),
    })]);
  });

  it("RSS 결과에도 카테고리와 공급자 정보를 보존한다", async () => {
    const rssDiscover = async () => [{ externalId: "news-1", title: "GPT 업데이트", url: "https://openai.com/news/update", body: "공식 설명" }];
    const adapter = new OfficialAiSourceAdapter({ rssDiscover });
    const items = await adapter.fetch(subscription({ strategy: "rss", provider: "openai", providerLabel: "OpenAI", maxItems: 5 }, "https://openai.com/news/rss.xml"));
    expect(items[0]!.metadata).toMatchObject({ provider: "openai", providerLabel: "OpenAI", category: GLOBAL_AI_MODEL_CATEGORY });
  });
});
