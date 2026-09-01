import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistReferenceImage } from "../../app/library/reference-upload";
import {
  createLocalCandidateRepository,
  createLocalDatabase,
  createLocalReferenceSetStore,
  createLocalSourceRepository,
  insertLocalReferenceImage,
  listLocalReferenceImages,
  removeLocalReferenceFiles,
  seedLocalCandidate,
  writeLocalReferenceFile,
} from "../local-store";

const roots: string[] = [];
async function database() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fixup-local-store-"));
  roots.push(root);
  return { root, db: createLocalDatabase(root) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("파일 저장소 소유자 격리", () => {
  it("두 사용자는 자기 소스만 보고 남의 소스를 수정·삭제하지 못한다", async () => {
    const { db } = await database();
    const userA = createLocalSourceRepository(db, "user-a");
    const userB = createLocalSourceRepository(db, "user-b");
    const sourceA = await userA.insert({
      userId: "user-a", kind: "rss", name: "A RSS", url: "https://a.example/rss",
      intervalHours: 12, enabled: true, config: {},
    });
    const sourceB = await userB.insert({
      userId: "user-b", kind: "rss", name: "B RSS", url: "https://b.example/rss",
      intervalHours: 12, enabled: true, config: {},
    });

    expect((await userA.list()).map((source) => source.id)).toEqual([sourceA.id]);
    expect((await userB.list()).map((source) => source.id)).toEqual([sourceB.id]);
    await expect(userA.update(sourceB.id, { name: "훔친 이름" })).rejects.toThrow("찾을 수 없습니다");
    await expect(userA.remove(sourceB.id)).rejects.toThrow("찾을 수 없습니다");
  });

  it("두 사용자는 자기 후보만 보고 남의 후보 상태를 바꾸지 못한다", async () => {
    const { db } = await database();
    const candidateA = await seedLocalCandidate(db, {
      userId: "user-a", sourceId: null, title: "A 후보", url: null, body: "A 본문",
      summary: null, thumbnailUrl: null, publishedAt: null,
    });
    const candidateB = await seedLocalCandidate(db, {
      userId: "user-b", sourceId: null, title: "B 후보", url: null, body: "B 본문",
      summary: null, thumbnailUrl: null, publishedAt: null,
    });
    const userA = createLocalCandidateRepository(db, "user-a");
    const userB = createLocalCandidateRepository(db, "user-b");

    expect((await userA.list()).map((candidate) => candidate.id)).toEqual([candidateA.id]);
    expect((await userB.list()).map((candidate) => candidate.id)).toEqual([candidateB.id]);
    await expect(userA.updateStatus(candidateB.id, "picked")).rejects.toThrow("찾을 수 없습니다");
  });

  it("세트는 자기 이미지만 담고 자기 세트만 반환한다", async () => {
    const { db } = await database();
    const imageA = await insertLocalReferenceImage(db, "user-a", {
      id: "image-a", storagePath: "user-a/references/image-a.png", title: "A",
      purpose: "cardnews", width: null, height: null,
    });
    const imageB = await insertLocalReferenceImage(db, "user-b", {
      id: "image-b", storagePath: "user-b/references/image-b.png", title: "B",
      purpose: "cardnews", width: null, height: null,
    });
    const userA = createLocalReferenceSetStore(db, "user-a");
    const userB = createLocalReferenceSetStore(db, "user-b");
    await userA.create("user-a", {
      name: "A 세트", purpose: "cardnews",
      items: [{ referenceImageId: imageA.id, role: "cover", position: 0 }],
    });

    expect(await userB.list()).toEqual([]);
    await expect(userA.create("user-a", {
      name: "남의 이미지", purpose: "cardnews",
      items: [{ referenceImageId: imageB.id, role: "cover", position: 0 }],
    })).rejects.toThrow("참고 이미지 항목을 찾을 수 없습니다");
  });
});

describe("로컬 참고 이미지 업로드", () => {
  it("UUID 경로에 파일을 먼저 쓰고 행 실패 시 파일을 지운다", async () => {
    const { db, root } = await database();
    const id = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const storagePath = `${userId}/references/${id}.png`;
    const file = Object.assign(new Blob(["png"], { type: "image/png" }), { name: "cover.png" });

    await expect(persistReferenceImage(
      { file, title: "표지", purpose: "cardnews" },
      {
        createId: () => id,
        getUserId: async () => userId,
        upload: (target, selected) => writeLocalReferenceFile(root, target, selected),
        insert: async () => { throw new Error("row failed"); },
        remove: (targets) => removeLocalReferenceFiles(root, targets),
      },
    )).rejects.toThrow("row failed");

    await expect(access(path.join(root, "library", ...storagePath.split("/")))).rejects.toThrow();
    expect(await listLocalReferenceImages(db, userId)).toEqual([]);
  });

  it("동시 쓰기에도 JSON 행을 잃지 않는다", async () => {
    const { db, root } = await database();
    const repository = createLocalSourceRepository(db, "user-a");
    await Promise.all(Array.from({ length: 20 }, (_unused, index) => repository.insert({
      userId: "user-a", kind: "rss", name: `RSS ${index}`, url: `https://example.com/${index}`,
      intervalHours: 12, enabled: true, config: {},
    })));

    expect(await repository.list()).toHaveLength(20);
    const stored = JSON.parse(await readFile(path.join(root, "store.json"), "utf8")) as { sources: unknown[] };
    expect(stored.sources).toHaveLength(20);
  });
});
