import { describe, expect, it } from "vitest";
import { CommunityPageAdapter } from "../adapters/community";
import type { IngestSource } from "../types";

function source(config: Record<string, unknown>): IngestSource { const now = new Date().toISOString(); return { id: "s1", userId: "u1", name: "커뮤니티", kind: "community", url: "https://community.example.com/latest", enabled: true, intervalHours: 60, config, nextPollAt: now, createdAt: now, updatedAt: now }; }

describe("공개 커뮤니티 페이지 어댑터", () => {
  it("사이트별 CSS 선택자로 목록을 표준 후보로 바꾼다", async () => {
    const html = `<html><body><article class="post" data-id="42"><a class="link" href="/posts/42"><strong class="title">새 정책 질문</strong></a><p class="summary">실무자가 궁금해한 내용</p><span class="writer">홍길동</span></article></body></html>`;
    const fetcher = async (input: URL | RequestInfo) => String(input).endsWith("robots.txt") ? new Response("User-agent: *\nDisallow:") : new Response(html, { headers: { "content-type": "text/html" } });
    const adapter = new CommunityPageAdapter(fetcher as typeof fetch, async () => ["93.184.216.34"]);
    const [item] = await adapter.fetch(source({ itemSelector: "article.post", linkSelector: "a.link", titleSelector: ".title", summarySelector: ".summary", authorSelector: ".writer" }));
    expect(item).toMatchObject({ externalId: "42", title: "새 정책 질문", url: "https://community.example.com/posts/42", summary: "실무자가 궁금해한 내용", author: "홍길동" });
  });
  it("목록 선택자가 없으면 무차별 추측 대신 설정 오류를 알린다", async () => {
    const adapter = new CommunityPageAdapter();
    await expect(adapter.fetch(source({}))).rejects.toThrow("itemSelector");
  });
});
