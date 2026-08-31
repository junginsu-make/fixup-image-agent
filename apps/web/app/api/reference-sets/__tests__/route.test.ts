import { describe, expect, it } from "vitest";
import { persistReferenceImage } from "../../../library/reference-upload";
import { SetInputSchema, groupByRole } from "../schema";

describe("세트 입력", () => {
  it("표지는 한 장만", () => {
    const twoCovers = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "cover", position: 0 },
        { referenceImageId: "b", role: "cover", position: 1 },
      ],
    };
    expect(SetInputSchema.safeParse(twoCovers).success).toBe(false);
  });

  it("엔딩도 한 장만", () => {
    const twoEndings = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "ending", position: 0 },
        { referenceImageId: "b", role: "ending", position: 1 },
      ],
    };
    expect(SetInputSchema.safeParse(twoEndings).success).toBe(false);
  });

  it("속지는 여러 장 된다", () => {
    const many = {
      name: "세트", purpose: "cardnews",
      items: [
        { referenceImageId: "a", role: "cover", position: 0 },
        { referenceImageId: "b", role: "body", position: 1 },
        { referenceImageId: "c", role: "body", position: 2 },
      ],
    };
    expect(SetInputSchema.safeParse(many).success).toBe(true);
  });

  it("역할별로 묶어 돌려준다", () => {
    const grouped = groupByRole([
      { referenceImageId: "a", role: "cover", position: 0 },
      { referenceImageId: "b", role: "body", position: 2 },
      { referenceImageId: "c", role: "body", position: 1 },
    ]);
    expect(grouped.cover?.referenceImageId).toBe("a");
    expect(grouped.body.map((item) => item.referenceImageId)).toEqual(["c", "b"]);
    expect(grouped.ending).toBeUndefined();
  });
});

describe("참고 이미지 업로드", () => {
  it("UUID 경로로 업로드한 뒤 같은 UUID 로 행을 넣는다", async () => {
    const events: string[] = [];
    const id = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const path = `${userId}/references/${id}.webp`;
    const file = Object.assign(new Blob(["image"], { type: "image/webp" }), { name: "body.webp" });

    await persistReferenceImage(
      { file, title: "속지", purpose: "both" },
      {
        createId: () => { events.push("uuid"); return id; },
        getUserId: async () => userId,
        upload: async (storagePath) => { events.push(`upload:${storagePath}`); },
        insert: async (row) => {
          events.push(`insert:${row.id}:${row.storage_path}`);
          return {
            id: row.id, userId: row.user_id, storagePath: row.storage_path,
            title: row.title, purpose: row.purpose, width: null, height: null,
            createdAt: "2026-08-31T00:00:00Z",
          };
        },
        remove: async () => undefined,
      },
    );

    expect(events).toEqual(["uuid", `upload:${path}`, `insert:${id}:${path}`]);
  });

  it("행 INSERT 가 실패하면 먼저 올린 Storage 파일을 지운다", async () => {
    const removed: string[][] = [];
    const file = Object.assign(new Blob(["image"], { type: "image/png" }), { name: "cover.png" });

    await expect(persistReferenceImage(
      { file, title: "표지", purpose: "cardnews" },
      {
        createId: () => "11111111-1111-4111-8111-111111111111",
        getUserId: async () => "22222222-2222-4222-8222-222222222222",
        upload: async () => undefined,
        insert: async () => { throw new Error("row failed"); },
        remove: async (paths) => { removed.push(paths); },
      },
    )).rejects.toThrow("row failed");

    expect(removed).toEqual([[
      "22222222-2222-4222-8222-222222222222/references/11111111-1111-4111-8111-111111111111.png",
    ]]);
  });

  it("Storage 정리도 실패하면 남은 파일 경로를 알린다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const path = `${userId}/references/${id}.png`;
    const file = Object.assign(new Blob(["image"], { type: "image/png" }), { name: "cover.png" });

    await expect(persistReferenceImage(
      { file, title: "표지", purpose: "cardnews" },
      {
        createId: () => id,
        getUserId: async () => userId,
        upload: async () => undefined,
        insert: async () => { throw new Error("row failed"); },
        remove: async () => { throw new Error("cleanup failed"); },
      },
    )).rejects.toThrow(path);
  });
});
