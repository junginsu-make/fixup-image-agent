import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CandidateRecord, CandidateRepository, CandidateSource } from "../../app/api/candidates/candidate-service";
import type { CandidateStatus } from "../../app/api/candidates/schema";
import type { ReferenceSetRecord, SetInput } from "../../app/api/reference-sets/schema";
import type {
  SourceCreateRecord,
  SourceRecord,
  SourceRepository,
  SourceUpdateRecord,
} from "../../app/api/sources/source-service";
import type { ReferenceImageRow } from "../../app/library/reference-upload";

interface LocalCandidateRow extends Omit<CandidateRecord, "source"> {
  userId: string;
}

interface LocalReferenceSetRow extends ReferenceSetRecord {
  userId: string;
}

interface LocalStoreData {
  version: 1;
  sources: Array<SourceRecord & { createdAt: string }>;
  candidates: LocalCandidateRow[];
  referenceImages: ReferenceImageRow[];
  referenceSets: LocalReferenceSetRow[];
}

function emptyData(): LocalStoreData {
  return { version: 1, sources: [], candidates: [], referenceImages: [], referenceSets: [] };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class LocalDatabase {
  readonly dataPath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly root: string) {
    this.dataPath = path.join(root, "store.json");
  }

  private async load(): Promise<LocalStoreData> {
    try {
      return JSON.parse(await readFile(this.dataPath, "utf8")) as LocalStoreData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyData();
      throw error;
    }
  }

  async read<T>(select: (data: LocalStoreData) => T): Promise<T> {
    await this.queue;
    return copy(select(await this.load()));
  }

  async update<T>(change: (data: LocalStoreData) => T | Promise<T>): Promise<T> {
    let result!: T;
    const operation = this.queue.then(async () => {
      const data = await this.load();
      result = await change(data);
      await mkdir(this.root, { recursive: true });
      const temporary = path.join(this.root, `.store-${randomUUID()}.tmp`);
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(temporary, this.dataPath);
    });
    this.queue = operation.catch(() => undefined);
    await operation;
    return copy(result);
  }
}

export function createLocalDatabase(root: string): LocalDatabase {
  return new LocalDatabase(path.resolve(root));
}

export function isLocalStoreEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== "production" && environment.LOCAL_STORE === "1";
}

function findWorkspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("pnpm-workspace.yaml 을 찾지 못했습니다.");
    current = parent;
  }
}

const databaseCache = new Map<string, LocalDatabase>();
export function localStoreRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(environment.LOCAL_STORE_ROOT ?? path.join(findWorkspaceRoot(process.cwd()), "data", "local"));
}

export function getLocalDatabase(environment: NodeJS.ProcessEnv = process.env): LocalDatabase {
  const root = localStoreRoot(environment);
  let database = databaseCache.get(root);
  if (!database) {
    database = createLocalDatabase(root);
    databaseCache.set(root, database);
  }
  return database;
}

function notFound(label: string): Error {
  return new Error(`${label} 항목을 찾을 수 없습니다.`);
}

export function createLocalSourceRepository(database: LocalDatabase, userId: string): SourceRepository {
  return {
    async list() {
      return database.read((data) => data.sources
        .filter((source) => source.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ createdAt: _createdAt, ...source }) => source));
    },
    async insert(row: SourceCreateRecord) {
      if (row.userId !== userId) throw notFound("수집 소스");
      const now = new Date().toISOString();
      const source: SourceRecord & { createdAt: string } = {
        ...row,
        id: randomUUID(),
        lastCheckedAt: null,
        nextPollAt: now,
        lastError: null,
        createdAt: now,
      };
      await database.update((data) => { data.sources.push(source); });
      const { createdAt: _createdAt, ...record } = source;
      return record;
    },
    async update(id: string, patch: SourceUpdateRecord) {
      return database.update((data) => {
        const source = data.sources.find((entry) => entry.id === id && entry.userId === userId);
        if (!source) throw notFound("수집 소스");
        Object.assign(source, patch);
        const { createdAt: _createdAt, ...record } = source;
        return record;
      });
    },
    async remove(id: string) {
      await database.update((data) => {
        const index = data.sources.findIndex((entry) => entry.id === id && entry.userId === userId);
        if (index < 0) throw notFound("수집 소스");
        data.sources.splice(index, 1);
      });
    },
  };
}

function candidateSource(data: LocalStoreData, row: LocalCandidateRow): CandidateSource | null {
  if (!row.sourceId) return null;
  const source = data.sources.find((entry) => entry.id === row.sourceId && entry.userId === row.userId);
  return source ? { id: source.id, name: source.name, kind: source.kind } : null;
}

function candidateRecord(data: LocalStoreData, row: LocalCandidateRow): CandidateRecord {
  const { userId: _userId, ...candidate } = row;
  return { ...candidate, source: candidateSource(data, row) };
}

export function createLocalCandidateRepository(database: LocalDatabase, userId: string): CandidateRepository {
  return {
    async list() {
      return database.read((data) => data.candidates
        .filter((candidate) => candidate.userId === userId)
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))
        .map((candidate) => candidateRecord(data, candidate)));
    },
    async updateStatus(id: string, status: CandidateStatus) {
      return database.update((data) => {
        const candidate = data.candidates.find((entry) => entry.id === id && entry.userId === userId);
        if (!candidate) throw notFound("수집 후보");
        candidate.status = status;
        return candidateRecord(data, candidate);
      });
    },
  };
}

export async function seedLocalCandidate(
  database: LocalDatabase,
  input: Omit<LocalCandidateRow, "id" | "collectedAt" | "status">,
): Promise<CandidateRecord> {
  return database.update((data) => {
    const row: LocalCandidateRow = {
      ...input,
      id: randomUUID(),
      collectedAt: new Date().toISOString(),
      status: "new",
    };
    data.candidates.push(row);
    return candidateRecord(data, row);
  });
}

export async function insertLocalReferenceImage(
  database: LocalDatabase,
  userId: string,
  input: Omit<ReferenceImageRow, "userId" | "createdAt">,
): Promise<ReferenceImageRow> {
  return database.update((data) => {
    if (data.referenceImages.some((image) => image.id === input.id)) throw new Error("참고 이미지 ID가 이미 있습니다.");
    const expectedPrefix = `${userId}/references/${input.id}.`;
    if (!input.storagePath.startsWith(expectedPrefix) || input.storagePath.slice(expectedPrefix.length).includes("/")) {
      throw new Error("참고 이미지 경로가 소유자 규약과 맞지 않습니다.");
    }
    const image: ReferenceImageRow = { ...input, userId, createdAt: new Date().toISOString() };
    data.referenceImages.push(image);
    return image;
  });
}

export function listLocalReferenceImages(database: LocalDatabase, userId: string): Promise<ReferenceImageRow[]> {
  return database.read((data) => data.referenceImages
    .filter((image) => image.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function findLocalReferenceImage(
  database: LocalDatabase,
  userId: string,
  id: string,
): Promise<ReferenceImageRow | undefined> {
  return database.read((data) => data.referenceImages.find((image) => image.id === id && image.userId === userId));
}

function validateSetImages(data: LocalStoreData, userId: string, input: SetInput): void {
  for (const item of input.items) {
    if (!data.referenceImages.some((image) => image.id === item.referenceImageId && image.userId === userId)) {
      throw notFound("참고 이미지");
    }
  }
}

export function createLocalReferenceSetStore(database: LocalDatabase, boundUserId: string) {
  return {
    async list(): Promise<ReferenceSetRecord[]> {
      return database.read((data) => data.referenceSets
        .filter((set) => set.userId === boundUserId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ userId: _userId, ...set }) => set));
    },
    async create(userId: string, input: SetInput): Promise<ReferenceSetRecord> {
      if (userId !== boundUserId) throw notFound("참고 이미지 세트");
      return database.update((data) => {
        validateSetImages(data, boundUserId, input);
        const now = new Date().toISOString();
        const set: LocalReferenceSetRow = {
          id: randomUUID(),
          userId: boundUserId,
          name: input.name,
          purpose: input.purpose,
          createdAt: now,
          updatedAt: now,
          items: input.items.map((item) => ({ ...item, id: randomUUID() })),
        };
        data.referenceSets.push(set);
        const { userId: _userId, ...record } = set;
        return record;
      });
    },
    async update(id: string, input: SetInput): Promise<ReferenceSetRecord> {
      return database.update((data) => {
        const set = data.referenceSets.find((entry) => entry.id === id && entry.userId === boundUserId);
        if (!set) throw notFound("참고 이미지 세트");
        validateSetImages(data, boundUserId, input);
        set.name = input.name;
        set.purpose = input.purpose;
        set.updatedAt = new Date().toISOString();
        set.items = input.items.map((item) => ({ ...item, id: randomUUID() }));
        const { userId: _userId, ...record } = set;
        return record;
      });
    },
    async remove(id: string): Promise<void> {
      await database.update((data) => {
        const index = data.referenceSets.findIndex((entry) => entry.id === id && entry.userId === boundUserId);
        if (index < 0) throw notFound("참고 이미지 세트");
        data.referenceSets.splice(index, 1);
      });
    },
  };
}

function localFilePath(root: string, storagePath: string): string {
  const parts = storagePath.split("/");
  if (parts.length !== 3 || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("올바르지 않은 로컬 Storage 경로입니다.");
  }
  const libraryRoot = path.resolve(root, "library");
  const target = path.resolve(libraryRoot, ...parts);
  if (!target.startsWith(`${libraryRoot}${path.sep}`)) throw new Error("로컬 Storage 경로가 범위를 벗어났습니다.");
  return target;
}

export async function writeLocalReferenceFile(root: string, storagePath: string, file: Blob): Promise<void> {
  const target = localFilePath(root, storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
}

export async function removeLocalReferenceFiles(root: string, storagePaths: string[]): Promise<void> {
  await Promise.all(storagePaths.map((storagePath) => rm(localFilePath(root, storagePath), { force: true })));
}

export async function readLocalReferenceFile(root: string, storagePath: string): Promise<Buffer> {
  const target = localFilePath(root, storagePath);
  await access(target);
  return readFile(target);
}
