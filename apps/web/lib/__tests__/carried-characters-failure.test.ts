import { describe, expect, it, vi } from "vitest";

/**
 * **캐릭터 찾기가 실패해도 만들기는 막지 않는다**(2026-10-07 독립 리뷰).
 *
 * 거드는 일이다. 저장소가 잠깐 안 돼도 카드뉴스·이미지 만들기는 지금처럼(사람으로) 간다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../characters", () => ({ listCharacters: vi.fn(async () => { throw new Error("db down"); }) }));
vi.mock("../teams/store", () => ({ teamIdOf: vi.fn(async () => null) }));
vi.mock("../reference-images", () => ({ referenceImagesByIds: vi.fn(async () => { throw new Error("db down"); }) }));
vi.mock("../poster/references", () => ({ posterReferencesByIds: vi.fn(async () => { throw new Error("db down"); }) }));

const member = { userId: "u1", profile: { role: "member" as const } };

describe("찾다 실패하면", () => {
  it("카드뉴스: 정보 없이, 화면이 보낸 값은 버리고 그대로 간다", async () => {
    const { withCarriedCharacters } = await import("../carried-characters-server");
    const [first] = await withCarriedCharacters(member, [
      { id: "a", kind: "keep_identity", subject: "person", characterId: "c1", character: { identity: "EVIL" } as unknown },
    ]);
    expect(first!.character).toBeUndefined();
    expect(first!.characterId).toBe("c1");
  });

  it("이미지 만들기: 빈 결과로 간다", async () => {
    const { carriedCharactersForPosterPeople } = await import("../carried-characters-server");
    await expect(carriedCharactersForPosterPeople(member, ["11111111-1111-4111-8111-111111111111"])).resolves.toEqual({});
  });
});
