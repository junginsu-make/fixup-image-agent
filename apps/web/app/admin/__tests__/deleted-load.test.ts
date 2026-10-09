import { describe, expect, it, vi } from "vitest";

/**
 * **삭제 보관 탭이 읽는 것**(2026-10-08 — 계획 2단계). 셋을 **회원이 지운 것만** 읽는다 — 캐릭터는 전체 회원 범위의
 * 「지운 것」, 참고 이미지는 「지운 것」 목록, 대화는 지운 대화. 그림은 목록용 사본을 먼저 쓴다.
 */
vi.mock("server-only", () => ({}));
const calls: unknown[] = [];
vi.mock("../../../lib/characters", () => ({
  listCharacters: async (...args: unknown[]) => {
    calls.push(["characters", ...args]);
    return [{ id: "c1", name: "호랑이", ownerEmail: "m@example.com", deletedAt: "D", views: [
      { angle: "back", url: "https://img/back.png", thumbUrl: null },
      { angle: "front", url: "https://img/front.png", thumbUrl: "https://img/front.thumb.webp" },
    ] }];
  },
}));
vi.mock("../../../lib/reference-images", () => ({
  listDeletedReferenceImages: async (...args: unknown[]) => {
    calls.push(["references", ...args]);
    return [{ id: "r1", title: null, ownerEmail: "r@example.com", deletedAt: "D", signedUrl: "https://img/r.png", thumbUrl: null }];
  },
}));
vi.mock("../../../lib/easy/deleted-conversations", () => ({
  listDeletedConversations: async () => [{ id: "e1", userId: "u", ownerEmail: null, title: "대화", createdAt: "C", deletedAt: "D" }],
}));

const { loadDeletedMaterials } = await import("../deleted/load");

describe("삭제 보관 탭이 읽는 것", () => {
  it("회원이 지운 것만, 전체 회원 범위로 읽는다", async () => {
    await loadDeletedMaterials({ userId: "a1", role: "admin" });
    expect(calls).toEqual([
      ["characters", "a1", null, { allMembers: true, deleted: true }],
      ["references", { userId: "a1", role: "admin" }],
    ]);
  });

  it("캐릭터는 정면 사본, 참고 이미지는 사본이 없으면 원본을 보인다", async () => {
    const loaded = await loadDeletedMaterials({ userId: "a1", role: "admin" });
    expect(loaded.characters).toEqual([
      { id: "c1", name: "호랑이", ownerEmail: "m@example.com", deletedAt: "D", imageUrl: "https://img/front.thumb.webp" },
    ]);
    expect(loaded.references).toEqual([
      { id: "r1", title: "(제목 없음)", ownerEmail: "r@example.com", deletedAt: "D", imageUrl: "https://img/r.png" },
    ]);
    expect(loaded.conversations).toEqual([{ id: "e1", title: "대화", ownerEmail: null, deletedAt: "D" }]);
  });
});
