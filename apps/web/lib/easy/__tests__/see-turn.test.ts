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

  it("다 안 만든 이미지 · 없는 번호 · 없는 사진이면 부르지 않는다 — 볼 것이 없다(none)", async () => {
    expect(await 본다({ see: ["2", "9", "p3"] })).toEqual({ kind: "none" });
    expect(받은).toEqual([]);
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
