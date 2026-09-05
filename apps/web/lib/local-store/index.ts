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
import type { SnsProjectCreateRecord, SnsProjectRecord, SnsProjectRepository } from "../../app/api/sns/projects/project-service";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type {
  GenerationRequestComplete,
  GenerationRequestCreate,
  GenerationRequestStore,
} from "@fixup/sns-core";
import type { SubmittedGenerationRequestStore } from "../sns/queued-flow";
import { snsPreviewPath } from "../sns/preview-path";

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
  snsProjects: SnsProjectRecord[];
  generationRequests: LocalSnsGenerationRequest[];
  cards: LocalSnsCardRow[];
  characters: LocalCharacterRow[];
  characterViews: LocalCharacterViewRow[];
}

/** 캐릭터. 운영의 characters 표와 같은 칸을 쓴다. */
export interface LocalCharacterRow {
  id: string;
  userId: string;
  name: string;
  sourcePrompt: string;
  identityPrompt: string;
  kind: string;
  look: string;
  createdAt: string;
}

/** 각도 한 장. path 는 characters/{characterId}/{angle}.{ext} 다. */
export interface LocalCharacterViewRow {
  characterId: string;
  userId: string;
  angle: string;
  path: string;
  mimeType: string;
}

function emptyData(): LocalStoreData {
  return {
    version: 1,
    sources: [], candidates: [], referenceImages: [], referenceSets: [], snsProjects: [],
    generationRequests: [], cards: [], characters: [], characterViews: [],
  };
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
      const stored = JSON.parse(await readFile(this.dataPath, "utf8")) as Partial<LocalStoreData>;
      return {
        ...emptyData(), ...stored,
        snsProjects: stored.snsProjects ?? [],
        generationRequests: stored.generationRequests ?? [],
        cards: stored.cards ?? [],
        characters: stored.characters ?? [],
        characterViews: stored.characterViews ?? [],
      };
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

export function createLocalSnsProjectRepository(
  database: LocalDatabase,
  userId: string,
): SnsProjectRepository {
  return {
    async create(row: SnsProjectCreateRecord): Promise<SnsProjectRecord> {
      if (row.userId !== userId) throw notFound("SNS 프로젝트");
      return database.update((data) => {
        const now = new Date().toISOString();
        const project: SnsProjectRecord = { ...row, id: randomUUID(), createdAt: now, updatedAt: now };
        data.snsProjects.push(project);
        return project;
      });
    },
    async list(): Promise<SnsProjectRecord[]> {
      return database.read((data) => data.snsProjects
        .filter((project) => project.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    },
  };
}

export function getLocalSnsProject(
  database: LocalDatabase,
  userId: string,
  id: string,
): Promise<SnsProjectRecord | undefined> {
  return database.read((data) => data.snsProjects.find((project) => project.id === id && project.userId === userId));
}

/**
 * 카드뉴스 작업을 지운다.
 *
 * 작업과 카드는 지우고 **비용 기록은 남긴다.** 운영 DB 도 같다 — 작업을
 * 지웠다고 돈이 안 나간 것이 되지는 않는다. 그 기록을 지울 수 있으면 장부를
 * 믿을 수 없다.
 *
 * 파일 경로는 부르는 쪽이 준다. 여기서는 파일을 모른다.
 */
export function removeLocalSnsProject(
  database: LocalDatabase,
  userId: string,
  projectId: string,
): Promise<boolean> {
  return database.update((data) => {
    const index = data.snsProjects.findIndex(
      (project) => project.id === projectId && project.userId === userId,
    );
    if (index < 0) return false;
    data.snsProjects.splice(index, 1);
    data.cards = data.cards.filter(
      (card) => !(card.projectId === projectId && card.userId === userId),
    );
    return true;
  });
}

export function saveLocalSnsFlow(
  database: LocalDatabase,
  userId: string,
  id: string,
  flow: SnsFlowState,
  status: SnsProjectRecord["status"],
): Promise<SnsProjectRecord> {
  return database.update((data) => {
    const project = data.snsProjects.find((entry) => entry.id === id && entry.userId === userId);
    if (!project) throw notFound("SNS 프로젝트");
    project.data.flow = flow;
    project.status = status;
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

export interface LocalSnsGenerationRequest {
  id: string;
  userId: string;
  projectId: string;
  cardIndex: number;
  modelId: string;
  mode: GenerationRequestCreate["mode"];
  size: GenerationRequestCreate["size"];
  requestedImages: 1;
  unitCostUsd: number;
  falRequestId: string | null;
  returnedImages: number;
  costUsd: number | null;
  createdAt: string;
}

export function createLocalSnsGenerationRequestStore(
  database: LocalDatabase,
  userId: string,
): GenerationRequestStore {
  return {
    async create(row) {
      return database.update((data) => {
        if (!data.snsProjects.some((project) => project.id === row.projectId && project.userId === userId)) {
          throw notFound("SNS 프로젝트");
        }
        const request: LocalSnsGenerationRequest = {
          id: randomUUID(), userId, projectId: row.projectId, cardIndex: row.cardIndex,
          modelId: row.modelId, mode: row.mode, size: row.size,
          requestedImages: 1, unitCostUsd: row.unitCostUsd,
          falRequestId: null, returnedImages: 0, costUsd: null,
          createdAt: new Date().toISOString(),
        };
        data.generationRequests.push(request);
        return { ...row, id: request.id };
      });
    },
    async complete(id: string, patch: GenerationRequestComplete) {
      await database.update((data) => {
        const request = data.generationRequests.find((entry) => entry.id === id && entry.userId === userId);
        if (!request) throw notFound("SNS 비용 요청");
        request.falRequestId = patch.falRequestId ?? null;
        request.returnedImages = patch.returnedImages;
        request.costUsd = patch.costUsd;
      });
    },
  };
}

export function createLocalSubmittedGenerationRequestStore(
  database: LocalDatabase,
  userId: string,
): SubmittedGenerationRequestStore {
  return {
    async createSubmitted(row) {
      return database.update((data) => {
        if (!data.snsProjects.some((project) => project.id === row.projectId && project.userId === userId)) {
          throw notFound("SNS 프로젝트");
        }
        const request: LocalSnsGenerationRequest = {
          id: randomUUID(), userId, projectId: row.projectId, cardIndex: row.cardIndex,
          modelId: row.modelId, mode: row.mode, size: row.size,
          requestedImages: 1, unitCostUsd: row.unitCostUsd,
          falRequestId: row.falRequestId, returnedImages: 0, costUsd: null,
          createdAt: new Date().toISOString(),
        };
        data.generationRequests.push(request);
        return { id: request.id };
      });
    },
    async complete(id, patch) {
      await database.update((data) => {
        const request = data.generationRequests.find((entry) => entry.id === id && entry.userId === userId);
        if (!request) throw notFound("SNS 비용 요청");
        request.falRequestId = patch.falRequestId ?? request.falRequestId;
        request.returnedImages = patch.returnedImages;
        request.costUsd = patch.costUsd;
      });
    },
  };
}

export function listLocalSnsGenerationRequests(
  database: LocalDatabase,
  userId: string,
  projectId?: string,
): Promise<LocalSnsGenerationRequest[]> {
  return database.read((data) => data.generationRequests
    .filter((request) => request.userId === userId && (!projectId || request.projectId === projectId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

export interface LocalSnsCardRow {
  id: string;
  userId: string;
  projectId: string;
  index: number;
  kind: SnsFlowCard["kind"];
  role: SnsFlowCard["role"];
  copy: SnsFlowCard["copy"];
  prompt: string | null;
  assetPath: string | null;
  /** 결과판에 거는 미리보기. 없으면 화면이 원본으로 떨어진다. */
  thumbPath?: string | null;
  status: SnsFlowCard["status"];
  review: unknown | null;
  error: string | null;
}

export async function replaceLocalSnsCards(
  database: LocalDatabase,
  userId: string,
  projectId: string,
  flow: SnsFlowState,
): Promise<void> {
  await database.update((data) => {
    if (!data.snsProjects.some((project) => project.id === projectId && project.userId === userId)) {
      throw notFound("SNS 프로젝트");
    }
    data.cards = data.cards.filter((card) => card.projectId !== projectId || card.userId !== userId);
    data.cards.push(...flow.cards.map((card) => ({
      id: randomUUID(), userId, projectId, index: card.index,
      kind: card.kind, role: card.role, copy: card.copy,
      prompt: null, assetPath: null, status: card.status,
      review: null, error: null,
    })));
  });
}

export function updateLocalSnsCard(
  database: LocalDatabase,
  userId: string,
  projectId: string,
  cardIndex: number,
  patch: Partial<Pick<LocalSnsCardRow, "copy" | "prompt" | "assetPath" | "thumbPath" | "status" | "review" | "error">>,
): Promise<LocalSnsCardRow> {
  return database.update((data) => {
    const card = data.cards.find((entry) => entry.projectId === projectId && entry.index === cardIndex && entry.userId === userId);
    if (!card) throw notFound("SNS 카드");
    Object.assign(card, patch);
    return card;
  });
}

export function listLocalSnsCards(
  database: LocalDatabase,
  userId: string,
  projectId: string,
): Promise<LocalSnsCardRow[]> {
  return database.read((data) => data.cards
    .filter((card) => card.userId === userId && card.projectId === projectId)
    .sort((a, b) => a.index - b.index));
}

function localFilePath(root: string, storagePath: string): string {
  const parts = storagePath.split("/");
  const validReference = parts.length === 3 && parts[1] === "references";
  const validSnsResult = parts.length === 4 && parts[1] === "sns";
  if ((!validReference && !validSnsResult) || parts.some((part) => !part || part === "." || part === "..")) {
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

function assertLocalSegment(value: string, label: string): void {
  if (!value || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
}

export async function writeLocalSnsResultFile(
  root: string,
  userId: string,
  projectId: string,
  cardIndex: number,
  bytes: Buffer,
): Promise<string> {
  assertLocalSegment(userId, "사용자");
  assertLocalSegment(projectId, "프로젝트");
  if (!Number.isInteger(cardIndex) || cardIndex < 1) throw new Error("카드 번호가 올바르지 않습니다.");
  const storagePath = `${userId}/sns/${projectId}/${cardIndex}.png`;
  const target = localFilePath(root, storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return storagePath;
}

/**
 * 미리보기 파일. 원본과 **별개 파일**이라 원본 이름 규칙을 건드리지 않는다.
 */
export async function writeLocalSnsPreviewFile(
  root: string,
  userId: string,
  projectId: string,
  cardIndex: number,
  bytes: Buffer,
): Promise<string> {
  assertLocalSegment(userId, "사용자");
  assertLocalSegment(projectId, "프로젝트");
  if (!Number.isInteger(cardIndex) || cardIndex < 1) throw new Error("카드 번호가 올바르지 않습니다.");
  // 규칙은 `lib/sns/thumbnail.ts` 한 곳에서만 만든다. 두 곳에서 따로 자라면
  // 미리보기가 두 종류로 갈리고 삭제가 한쪽만 잡는다.
  const storagePath = snsPreviewPath(userId, projectId, cardIndex);
  const target = localFilePath(root, storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return storagePath;
}

export async function readLocalSnsResultFile(root: string, storagePath: string): Promise<Buffer> {
  const parts = storagePath.split("/");
  if (parts.length !== 4 || parts[1] !== "sns") throw new Error("SNS 결과 경로가 올바르지 않습니다.");
  const target = localFilePath(root, storagePath);
  await access(target);
  return readFile(target);
}
