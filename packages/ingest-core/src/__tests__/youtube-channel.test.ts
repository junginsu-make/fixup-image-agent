import { describe, expect, it } from "vitest";
import { channelIdFromInput, YoutubeChannelAdapter } from "../adapters/youtube-channel";
import type { IngestSource } from "../types";

const channelId = "UC1234567890123456789012";
const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:abcdefghijk</id><title>새 영상</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghijk"/><published>2026-08-24T00:00:00Z</published><author><name>채널</name></author></entry></feed>`;

describe("YouTube 채널 어댑터", () => {
  it("채널 ID와 /channel/ 주소를 받는다", () => {
    expect(channelIdFromInput(channelId)).toBe(channelId);
    expect(channelIdFromInput(`https://www.youtube.com/channel/${channelId}`)).toBe(channelId);
  });

  it("채널 피드에서 최신 영상 목록을 만든다", async () => {
    const calls: string[] = [];
    const adapter = new YoutubeChannelAdapter(async (input) => { calls.push(String(input)); return new Response(feed, { status: 200 }); });
    const now = new Date().toISOString();
    const source: IngestSource = { id: "s1", userId: "u1", name: "채널", kind: "youtube_channel", url: `https://youtube.com/channel/${channelId}`, enabled: true, intervalHours: 60, config: {}, nextPollAt: now, createdAt: now, updatedAt: now };
    expect((await adapter.fetch(source))[0]).toMatchObject({ title: "새 영상", url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(calls[0]).toContain(channelId);
  });

  it("핸들 주소에서는 관련 영상 채널보다 페이지 소유자의 채널 ID를 우선한다", async () => {
    const relatedChannelId = "UCabcdefghijklmnopqrstuv";
    const calls: string[] = [];
    const adapter = new YoutubeChannelAdapter(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/@jocoding")) {
        return new Response(`<html><script>{"channelId":"${relatedChannelId}","externalId":"${channelId}"}</script></html>`, { status: 200 });
      }
      return new Response(feed, { status: 200 });
    });
    const now = new Date().toISOString();
    const source: IngestSource = { id: "s1", userId: "u1", name: "조코딩", kind: "youtube_channel", url: "https://www.youtube.com/@jocoding", enabled: true, intervalHours: 720, config: {}, nextPollAt: now, createdAt: now, updatedAt: now };

    await adapter.fetch(source);

    expect(calls[1]).toContain(channelId);
    expect(calls[1]).not.toContain(relatedChannelId);
  });

  it("영상 URL은 채널 전체가 아니라 입력한 영상 한 건만 수집한다", async () => {
    const calls: string[] = [];
    const adapter = new YoutubeChannelAdapter(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/watch")) {
        return new Response(`<html><head><meta property="og:title" content="AICE 자격증 소개"><meta property="og:image" content="https://i.ytimg.com/vi/1PVLg7jUsWw/hqdefault.jpg"><meta itemprop="author" content="해커스 자격증"><meta itemprop="channelId" content="${channelId}"><meta itemprop="uploadDate" content="2026-08-22T10:15:00+09:00"></head></html>`, { status: 200 });
      }
      return new Response(feed, { status: 200 });
    });
    const now = new Date().toISOString();
    const source: IngestSource = { id: "s1", userId: "u1", name: "영상", kind: "youtube_channel", url: "https://www.youtube.com/watch?v=1PVLg7jUsWw", enabled: true, intervalHours: 60, config: {}, nextPollAt: now, createdAt: now, updatedAt: now };

    expect(await adapter.fetch(source)).toEqual([expect.objectContaining({
      externalId: "yt:video:1PVLg7jUsWw",
      title: "AICE 자격증 소개",
      url: "https://www.youtube.com/watch?v=1PVLg7jUsWw",
      author: "해커스 자격증",
      thumbnailUrl: "https://i.ytimg.com/vi/1PVLg7jUsWw/hqdefault.jpg",
      publishedAt: "2026-08-22T01:15:00.000Z",
    })]);
    expect(calls.some((url) => url.includes("/feeds/videos.xml"))).toBe(false);
  });

  it("YouTube가 아닌 서버에서 채널 ID를 찾으려 하지 않는다", async () => {
    const calls: string[] = [];
    const adapter = new YoutubeChannelAdapter(async (input) => {
      calls.push(String(input));
      return new Response(`<meta itemprop="channelId" content="${channelId}" />`, { status: 200 });
    });
    const now = new Date().toISOString();
    const source: IngestSource = { id: "s1", userId: "u1", name: "채널", kind: "youtube_channel", url: "http://127.0.0.1/channel-name", enabled: true, intervalHours: 60, config: {}, nextPollAt: now, createdAt: now, updatedAt: now };

    await expect(adapter.fetch(source)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
