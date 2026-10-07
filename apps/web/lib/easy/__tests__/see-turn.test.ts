import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이미지를 보고 답하기**(2026-10-07 2차 D5). 값을 안 쓰고 잰다 — 글 모델 대신 가짜 `write` 가 받은
 * 그림 · 글을 본다. 운영은 서버가 서명한 주소, 로컬은 `lib/poster/asset-bytes.ts` 로 읽은 base64 다
 * (2차 최종 리뷰 e — 바이트 읽기를 따로 짜지 않는다).
 */
vi.mock("server-only", () => ({}));
let 로컬 = false;
let 읽기실패 = false;
const 읽은경로: string[] = [];
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => 로컬, localStoreRoot: () => "root" }));
vi.mock("../../storage/signing", () => ({ signPath: async (bucket: string, path: string) => `https://signed.test/${bucket}/${path}` }));
vi.mock("../../poster/asset-bytes", () => ({
  posterImageBytes: async (assetPath: string) => {
    읽은경로.push(assetPath);
    if (읽기실패) throw new Error("ENOENT");
    return { bytes: Buffer.from("poster-bytes"), contentType: "image/webp" };
  },
  referenceBytes: async (storagePath: string) => {
    읽은경로.push(storagePath);
    return { bytes: Buffer.from(`ref-${storagePath}`), contentType: "image/jpeg" };
  },
}));

const { rewriteReplyBySeeing } = await import("../see-turn");

const 사실 = {
  entries: [
    { n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "카페" },
    { n: 2, rowId: "i2", workId: "p2", kind: "image" as const, state: "making" as const, words: "배너" },
  ],
  posters: new Set(["p1", "p2"]),
  pictures: new Map([[1, {
    id: "img-1", projectId: "p1", generationRequestId: "r1", selected: false, assetPath: "me/p1/1.png", thumbPath: "me/p1/1.thumb.webp",
  }]]),
  madeImage: true,
  lastIsImage: true,
};
let 받은: Array<{ prompt: string; images: unknown[] }>;
const 쓴다 = (reply: unknown = { reply: "  배경이 밝아 글자가 잘 보여요.  " }) =>
  async (prompt: string, images: readonly unknown[]) => { 받은.push({ prompt, images: [...images] }); return reply; };
const 본다 = (over: Record<string, unknown> = {}) => rewriteReplyBySeeing({
  userId: "me", rows: [{ role: "user", body: "카페 포스터" }], prompt: "방금 거 어때?", see: ["1", "p1"], facts: 사실,
  photos: [{ id: "ref-1", url: "https://signed.test/ref-1", storagePath: "me/references/ref-1.jpg" }], write: 쓴다(), ...over,
});

beforeEach(() => { 로컬 = false; 읽기실패 = false; 받은 = []; 읽은경로.length = 0; });

describe("이미지를 보고 답하기", () => {
  it("운영에서는 결과 사본 · 붙인 사진을 서명한 주소로 넘기고, 다시 쓴 답을 준다", async () => {
    expect(await 본다()).toEqual({ kind: "seen", reply: "배경이 밝아 글자가 잘 보여요." });
    expect(받은[0]!.images).toEqual([{ url: "https://signed.test/library/me/p1/1.thumb.webp" }, { url: "https://signed.test/ref-1" }]);
    expect(받은[0]!.prompt).toContain("1번째: 이 대화의 이미지 1번");
    expect(받은[0]!.prompt).toContain("2번째: 사용자가 붙인 사진 1");
    expect(받은[0]!.prompt).toContain("사용자: 카페 포스터");
    expect(읽은경로).toEqual([]);
  });

  it("로컬에서는 asset-bytes 로 사본 · 붙인 사진을 읽어 base64 로 넘긴다", async () => {
    로컬 = true;
    await 본다();
    expect(읽은경로).toEqual(["me/p1/1.thumb.webp", "me/references/ref-1.jpg"]);
    expect(받은[0]!.images).toEqual([
      { mediaType: "image/webp", data: Buffer.from("poster-bytes").toString("base64") },
      { mediaType: "image/jpeg", data: Buffer.from("ref-me/references/ref-1.jpg").toString("base64") },
    ]);
  });

  it("다 안 만든 이미지 · 없는 번호면 부르지 않는다 — 볼 것이 없다(none)", async () => {
    expect(await 본다({ see: ["2", "9"] })).toEqual({ kind: "none" });
    expect(받은).toEqual([]);
  });

  /**
   * 후속 Task 2 — 최근 100개 밖이라 읽지 않은 결과물(`unreadOld`)만 골랐으면 판단의 답(못 본 채 쓴 글)을 내보내지
   * 않고 오래되어 볼 수 없다고 사실대로 말한다. 「잠시 뒤 다시」(SEE_FAILED)는 기다려도 안 되므로 쓰지 않는다.
   */
  describe("100개 밖의 옛 결과물 (후속 Task 2)", () => {
    const 옛사실 = {
      ...사실,
      entries: [
        { n: 3, rowId: "i3", workId: "w3", kind: "unknown" as const, state: "unknown" as const, words: "옛것" },
        { n: 4, rowId: "i4", workId: "w4", kind: "unknown" as const, state: "unknown" as const, words: "옛것" },
        { n: 5, rowId: "i5", workId: "w5", kind: "unknown" as const, state: "unknown" as const, words: "모름" },
        ...사실.entries,
      ],
      unreadOld: new Set([3, 4]),
    };

    it("고른 것이 모두 오래된 번호면 부르지 않고 오래되어 볼 수 없다고 답한다", async () => {
      expect(await 본다({ see: ["3"], facts: 옛사실 })).toEqual({
        kind: "old", reply: "결과물 3 은 오래되어 이 대화에서는 볼 수 없습니다. 지우지 않았다면 라이브러리에서 열어 볼 수 있습니다.",
      });
      expect(await 본다({ see: ["3", "4", "3"], facts: 옛사실 })).toEqual({
        kind: "old", reply: "결과물 3 · 4 은 오래되어 이 대화에서는 볼 수 없습니다. 지우지 않았다면 라이브러리에서 열어 볼 수 있습니다.",
      });
      expect(받은).toEqual([]);
    });

    it("오래된 번호와 볼 수 있는 것을 함께 골랐으면 볼 수 있는 것만 본다", async () => {
      expect(await 본다({ see: ["3", "1"], facts: 옛사실 })).toMatchObject({ kind: "seen" });
      expect(받은).toHaveLength(1);
    });

    it("오래되지 않은 못 읽은 번호 · 없는 번호가 섞이면 지금처럼 none 이다", async () => {
      expect(await 본다({ see: ["3", "5"], facts: 옛사실 })).toEqual({ kind: "none" });
      expect(await 본다({ see: ["3", "9"], facts: 옛사실 })).toEqual({ kind: "none" });
      expect(await 본다({ see: ["5"], facts: 옛사실 })).toEqual({ kind: "none" });
    });
  });

  /**
   * Fix round 1 — 이번 턴에 확인한 사진이 없는데 사진(「p1」)을 보라고 했으면 판단의 답(보지 못한 사진 이야기)을
   * 그대로 내보내지 않는다. 새로고침 뒤 말 답에서는 프롬프트가 물음 줄의 사진 수를 알려 주지만 볼 사진은 없다.
   */
  it("확인한 사진이 없는 사진 번호를 고르면 부르지 않고 failed", async () => {
    expect(await 본다({ see: ["p1"], photos: [] })).toEqual({ kind: "failed" });
    expect(await 본다({ see: ["1", "p3"] })).toEqual({ kind: "failed" });
    expect(받은).toEqual([]);
    expect(읽은경로).toEqual([]);
  });

  /** Fix round 1 — 붙인 사진도 사본(서명한 작은 그림)이 먼저다. 큰 원본 하나로 호출 전체가 실패하지 않게. */
  it("운영에서 붙인 사진은 사본 주소가 있으면 그것을 넘긴다", async () => {
    await 본다({ see: ["p1"], photos: [{ id: "ref-1", url: "https://signed.test/ref-1", thumbUrl: "https://signed.test/ref-1.thumb", storagePath: "me/references/ref-1.jpg" }] });
    expect(받은[0]!.images).toEqual([{ url: "https://signed.test/ref-1.thumb" }]);
  });

  /** Fix round 1 — 운영에서 주소를 못 만든 사진은 원본을 메모리로 읽지 않고 뺀다. 다 빠지면 failed. */
  it("운영에서 주소가 없는 사진은 원본을 읽지 않고 빼고, 볼 것이 다 빠지면 failed", async () => {
    const 주소없음 = [{ id: "ref-1", url: null, thumbUrl: null, storagePath: "me/references/ref-1.jpg" }];
    await 본다({ see: ["1", "p1"], photos: 주소없음 });
    expect(받은[0]!.images).toEqual([{ url: "https://signed.test/library/me/p1/1.thumb.webp" }]);
    expect(받은[0]!.prompt).not.toContain("사용자가 붙인 사진 1");
    expect(await 본다({ see: ["p1"], photos: 주소없음 })).toEqual({ kind: "failed" });
    expect(받은).toHaveLength(1);
    expect(읽은경로).toEqual([]);
  });

  /** 2차 최종 리뷰 10 — 라우트가 「지금은 이미지를 볼 수 없었습니다…」로 바꾼다. */
  it("보고 답하기가 실패하거나 빈 답이거나 그림을 못 읽으면 failed", async () => {
    expect(await 본다({ write: async () => { throw new Error("timeout"); } })).toEqual({ kind: "failed" });
    expect(await 본다({ write: 쓴다({ reply: "" }) })).toEqual({ kind: "failed" });
    로컬 = true;
    읽기실패 = true;
    expect(await 본다({ see: ["1"] })).toEqual({ kind: "failed" });
  });

  /** 볼 것이라고 고른 번호인데 그림을 하나도 못 찾으면 지어내지 않게 부르지 않고 failed 다(리드 지시 · Task 7). */
  it("고른 번호의 그림을 하나도 못 찾으면 부르지 않고 failed", async () => {
    expect(await 본다({ see: ["1"], facts: { ...사실, pictures: new Map() } })).toEqual({ kind: "failed" });
    expect(받은).toEqual([]);
  });

  /** 2차 최종 리뷰 c — 보고 다시 쓴 답도 표시 머리를 푼다. */
  /** 최종 수정 11(보안 리뷰) — 실패 글에 서명한 주소가 섞여 오면 서버 기록에 주소를 남기지 않는다. */
  it("보기 실패 기록에서 주소를 가린다", async () => {
    const 경고 = vi.spyOn(console, "warn").mockImplementation(() => {});
    await 본다({ write: async () => { throw new Error("못 받음 https://signed.test/library/me/p1/1.thumb.webp?token=abc 다음 http://x.test/y"); } });
    const 남긴글 = 경고.mock.calls.flat().join(" ");
    경고.mockRestore();
    expect(남긴글).not.toMatch(/https?:\/\//);
    expect(남긴글).toContain("못 받음 <url> 다음 <url>");
  });

  it("다시 쓴 답의 표시 머리를 푼다", async () => {
    expect(await 본다({ write: 쓴다({ reply: "say:좋아 보여요." }) })).toEqual({ kind: "seen", reply: "say：좋아 보여요." });
  });

  /** Task 9 — 일하는 턴의 머리말 줄(`say:`) · 물음 줄의 표시가 보기 프롬프트의 지난 대화에 새지 않는다. */
  it("지난 대화는 표시를 뗀 보일 글만 싣는다", async () => {
    await 본다({ rows: [
      { role: "user", body: "카페 포스터" },
      { role: "assistant", body: "say:카페 포스터를 만들게요." },
      { role: "image", body: "edit-request:x" },
    ] });
    expect(받은[0]!.prompt).toContain("도우미: 카페 포스터를 만들게요.");
    expect(받은[0]!.prompt).not.toContain("say:");
    expect(받은[0]!.prompt).not.toContain("edit-request");
  });
});
