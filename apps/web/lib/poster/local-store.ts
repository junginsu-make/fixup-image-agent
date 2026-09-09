import { randomUUID } from "node:crypto";
import type {
  PosterGenerationRequestRecord,
  PosterImageRecord,
  PosterImageStore,
  PosterProjectRecord,
  PosterProjectStore,
  PosterReferenceRecord,
  PosterReferenceStore,
  PosterRequestStore,
} from "@fixup/poster-core";
import { getLocalDatabase, type LocalDatabase } from "../local-store";
import { posterImageUrl, posterThumbUrl } from "./supabase-store-core";

/**
 * 로컬 파일 저장소의 포스터 부분.
 *
 * Supabase 에는 RLS 가 있지만 파일에는 없다. **모든 저장소를 먼저 userId 에
 * 묶어서** 남의 것이 보이지 않게 한다.
 */

type Owned<T> = T & { userId: string };

export interface PosterLocalData {
  posterProjects: Owned<PosterProjectRecord>[];
  posterRequests: Owned<PosterGenerationRequestRecord>[];
  posterImages: Owned<PosterImageRecord>[];
}

function bucket<K extends keyof PosterLocalData>(data: unknown, key: K): PosterLocalData[K] {
  const store = data as Partial<PosterLocalData>;
  if (!store[key]) store[key] = [] as PosterLocalData[K];
  return store[key]!;
}

function strip<T extends { userId: string }>(row: T): Omit<T, "userId"> {
  const { userId: _drop, ...rest } = row;
  return rest;
}

/**
 * 화면이 읽을 주소를 붙인다.
 *
 * 운영에서는 `toImageRecord` 가 이 일을 하는데, 로컬은 표를 안 거치므로 여기서
 * 같은 값을 만든다. 없으면 로컬에서는 **사본을 만들기만 하고 한 번도 읽지
 * 않는다** — 두 모드가 다르게 동작하면 로컬에서 확인한 것이 운영에서 확인한
 * 것이 아니게 된다.
 */
function withUrls<T extends { id: string; projectId: string; variantIndex: number }>(row: T) {
  return {
    ...row,
    url: posterImageUrl(row.projectId, row.id),
    // **조건을 걸지 않는다.** 운영은 무조건 붙이고 라우트가 사본이 없으면
    // 원본으로 떨어뜨린다. 로컬만 조건을 걸면 **이미 쌓인 모든 행이 타는 그
    // 폴백 갈래**를 로컬에서 한 번도 못 밟는다 — 두 모드를 맞추려던 뜻이 어긋난다.
    thumbUrl: posterThumbUrl(row.projectId, row.id),
  };
}

function notFound(label: string): Error {
  return new Error(`${label} 항목을 찾을 수 없습니다.`);
}

export function createLocalPosterProjectStore(
  database: LocalDatabase,
  userId: string,
): PosterProjectStore {
  return {
    async list() {
      return database.read((data) => bucket(data, "posterProjects")
        .filter((row) => row.userId === userId)
        .map(strip)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    },
    async get(id) {
      return database.read((data) => {
        const row = bucket(data, "posterProjects").find((entry) => entry.id === id && entry.userId === userId);
        return row ? strip(row) : undefined;
      });
    },
    async create(input) {
      return database.update((data) => {
        const now = new Date().toISOString();
        const row = { ...input, userId, id: randomUUID(), createdAt: now, updatedAt: now };
        bucket(data, "posterProjects").push(row);
        return strip(row);
      });
    },
    async update(id, patch) {
      return database.update((data) => {
        const row = bucket(data, "posterProjects").find((entry) => entry.id === id && entry.userId === userId);
        if (!row) throw notFound("포스터 작업");
        Object.assign(row, patch, { updatedAt: new Date().toISOString() });
        return strip(row);
      });
    },
    async remove(id) {
      await database.update((data) => {
        const list = bucket(data, "posterProjects");
        const index = list.findIndex((entry) => entry.id === id && entry.userId === userId);
        if (index < 0) throw notFound("포스터 작업");
        list.splice(index, 1);
      });
    },
  };
}

/**
 * 포스터 레퍼런스는 **라이브러리의 참고 이미지를 그대로 쓴다.**
 *
 * 따로 테이블을 두면 올리는 곳이 둘이 되어 사용자가 어디에 뒀는지 못 찾는다.
 * `reference_images` 가 이미 `purpose('cardnews'|'poster'|'both')` 를 갖고 있다.
 */
export function createLocalPosterReferenceStore(
  database: LocalDatabase,
  userId: string,
): PosterReferenceStore {
  const mine = (data: unknown) => {
    const store = data as { referenceImages?: Array<Record<string, unknown>> };
    // 용도로 거르지 않는다. 올린 곳이 어디든 세 도구가 다 쓴다 —
    // 거르면 "분명 올렸는데 여기선 안 보인다" 가 생긴다.
    return (store.referenceImages ?? []).filter((row) => row.userId === userId);
  };
  const toRecord = (row: Record<string, unknown>): PosterReferenceRecord => ({
    id: String(row.id),
    storagePath: String(row.storagePath),
    fileName: String(row.storagePath).split("/").pop() ?? "",
    title: (row.title as string | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    createdAt: String(row.createdAt),
    url: `/api/reference-images/${String(row.id)}/file`,
  });
  return {
    async list() {
      return database.read((data) => mine(data).map(toRecord));
    },
    async byIds(ids) {
      // 남의 id 를 섞어 보내도 자기 것만 돌아온다.
      return database.read((data) => mine(data).filter((row) => ids.includes(String(row.id))).map(toRecord));
    },
  };
}

/**
 * 비용 장부.
 *
 * `create` 입력에 `userId` 칸이 없다. 세션에 미리 묶여 있으므로 요청 본문의
 * 값이 들어올 자리가 아예 없다.
 */
export function createLocalPosterRequestStore(
  database: LocalDatabase,
  userId: string,
): PosterRequestStore {
  return {
    async create(row) {
      return database.update((data) => {
        const id = randomUUID();
        bucket(data, "posterRequests").push({
          ...row, userId, id,
          falRequestId: null,
          returnedImages: 0,
          costUsd: null,
          createdAt: new Date().toISOString(),
        });
        return { id };
      });
    },
    async complete(id, patch) {
      await database.update((data) => {
        const row = bucket(data, "posterRequests").find((entry) => entry.id === id && entry.userId === userId);
        if (!row) throw notFound("포스터 생성 요청");
        Object.assign(row, patch);
      });
    },
    async unitCost(id) {
      return database.read((data) => {
        const row = bucket(data, "posterRequests").find((entry) => entry.id === id && entry.userId === userId);
        const value = row?.unitCostUsd;
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      });
    },
  };
}

export function createLocalPosterImageStore(
  database: LocalDatabase,
  userId: string,
): PosterImageStore {
  return {
    async byProject(projectId) {
      return database.read((data) => bucket(data, "posterImages")
        .filter((row) => row.userId === userId && row.projectId === projectId)
        .map((row) => withUrls(strip(row)))
        .sort((a, b) => a.variantIndex - b.variantIndex));
    },
    async byProjects(projectIds) {
      if (!projectIds.length) return [];
      const wanted = new Set(projectIds);
      return database.read((data) => bucket(data, "posterImages")
        .filter((row) => row.userId === userId && wanted.has(row.projectId))
        .map((row) => withUrls(strip(row)))
        .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.variantIndex - b.variantIndex));
    },
    async add(rows) {
      return database.update((data) => rows.map((row) => {
        const saved = {
          ...row, userId, id: randomUUID(), selected: false,
          createdAt: new Date().toISOString(),
        };
        bucket(data, "posterImages").push(saved);
        return withUrls(strip(saved));
      }));
    },
    async select(projectId, imageId) {
      await database.update((data) => {
        const mine = bucket(data, "posterImages").filter((row) => row.userId === userId);
        const target = mine.find((row) => row.id === imageId && row.projectId === projectId);
        if (!target) throw notFound("포스터 이미지");
        // 먼저 풀고 나서 건다. Supabase 의 부분 유니크 인덱스와 같은 순서다.
        for (const row of mine) if (row.projectId === projectId) row.selected = false;
        target.selected = true;
      });
    },
    async saveReview(imageId, review) {
      await database.update((data) => {
        const row = bucket(data, "posterImages").find((entry) => entry.id === imageId && entry.userId === userId);
        if (!row) throw notFound("포스터 이미지");
        row.review = review;
      });
    },
  };
}

export function localPosterStores(userId: string) {
  const database = getLocalDatabase();
  return {
    projects: createLocalPosterProjectStore(database, userId),
    references: createLocalPosterReferenceStore(database, userId),
    requests: createLocalPosterRequestStore(database, userId),
    images: createLocalPosterImageStore(database, userId),
  };
}
