import { describe, expect, it } from "vitest";
import { SourceInputSchema, SourcePatchSchema } from "../schema";
import { createSourceService, type SourceRecord, type SourceRepository } from "../source-service";

describe("소스 입력 규칙", () => {
  it("주기는 1~168시간", () => {
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 0, maxItems: 20 }).success).toBe(false);
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 6, maxItems: 20 }).success).toBe(true);
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "https://a.com", intervalHours: 200, maxItems: 20 }).success).toBe(false);
  });

  it("모르는 종류는 거절한다", () => {
    expect(SourceInputSchema.safeParse({ kind: "블로그", name: "n", url: "https://a.com", intervalHours: 6 }).success).toBe(false);
  });

  it("주소가 없으면 거절한다", () => {
    expect(SourceInputSchema.safeParse({ kind: "rss", name: "n", url: "", intervalHours: 6, maxItems: 20 }).success).toBe(false);
  });

  it("커뮤니티는 목록 선택자가 필요하다", () => {
    expect(SourceInputSchema.safeParse({ kind: "community", name: "n", url: "https://a.com", intervalHours: 6 }).success).toBe(false);
    expect(SourceInputSchema.safeParse({ kind: "community", name: "n", url: "https://a.com", intervalHours: 6, itemSelector: "article.post" }).success).toBe(true);
  });

  it("공식 AI 소식은 지원 공급자를 고른다", () => {
    expect(SourceInputSchema.safeParse({ kind: "official_ai", name: "n", intervalHours: 6, provider: "모름" }).success).toBe(false);
    expect(SourceInputSchema.safeParse({ kind: "official_ai", name: "n", intervalHours: 6, provider: "openai" }).success).toBe(true);
  });
});

describe("소스 수정 규칙", () => {
  it("화면에서 바꿀 수 있는 칸만 받는다", () => {
    expect(SourcePatchSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(SourcePatchSchema.safeParse({ lastError: "위조" }).success).toBe(false);
    expect(SourcePatchSchema.safeParse({ nextPollAt: new Date().toISOString() }).success).toBe(false);
  });
});

describe("소스 서비스", () => {
  it("세션 사용자와 종류별 config 를 넣는다", async () => {
    const inserted: Array<Omit<SourceRecord, "id" | "lastCheckedAt" | "nextPollAt" | "lastError">> = [];
    const repository: SourceRepository = {
      list: async () => [],
      insert: async (row) => {
        inserted.push(row);
        return { ...row, id: "s1", lastCheckedAt: null, nextPollAt: "2026-08-31T00:00:00Z", lastError: null };
      },
      update: async () => { throw new Error("not used"); },
      remove: async () => undefined,
    };
    const service = createSourceService(repository);
    const input = SourceInputSchema.parse({
      kind: "community",
      name: "커뮤니티",
      url: "https://community.example.com/latest",
      intervalHours: 6,
      itemSelector: "article.post",
      titleSelector: ".title",
    });

    await service.create("user-1", input);

    expect(inserted[0]).toMatchObject({
      userId: "user-1",
      kind: "community",
      config: { itemSelector: "article.post", titleSelector: ".title" },
    });
  });

  it("last_error 를 목록 응답에 보존한다", async () => {
    const row: SourceRecord = {
      id: "s1", userId: "u1", kind: "youtube_channel", name: "채널",
      url: "https://youtube.com/@channel", intervalHours: 12, enabled: true,
      config: {}, lastCheckedAt: null, nextPollAt: "2026-08-31T00:00:00Z",
      lastError: "시간당 수집 상한(20회)에 도달했습니다.",
    };
    const repository: SourceRepository = {
      list: async () => [row],
      insert: async () => row,
      update: async () => row,
      remove: async () => undefined,
    };

    expect((await createSourceService(repository).list())[0]!.lastError).toContain("시간당 수집 상한");
  });
});
