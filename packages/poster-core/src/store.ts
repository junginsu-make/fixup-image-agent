import type { PosterSlots, PosterStatus } from "./schemas";

/**
 * 저장소는 **인터페이스만** 여기 둔다.
 *
 * 실제 구현(Supabase·로컬 파일)은 웹 앱에 둔다. 그래야 이 패키지가 DB 없이
 * 테스트되고, 로컬과 운영을 갈아 끼울 수 있다. 카드뉴스에서 쓴 방식과 같다.
 */

export interface PosterReferenceRecord {
  id: string;
  storagePath: string;
  fileName: string;
  title: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** 조회 시점에 만들어 넣는다. 저장하지 않는다. */
  url?: string;
}

export interface PosterProjectRecord {
  id: string;
  title: string;
  status: PosterStatus;
  ratio: string;
  modelId: string;
  data: {
    instruction: string;
    variants: number;
    referenceIds: string[];
    preservedIds: string[];
    /** preservedIds 중 사람인 것. 옛 작업에는 없다. */
    personIds?: string[];
    slots: PosterSlots;
    /** 레퍼런스에서 읽어낸 문법. 실패하면 비어 있다. */
    grammarIssues?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

/** fal 호출 한 건. 과금이 이미지가 아니라 요청에 붙는다. */
export interface PosterGenerationRequestRecord {
  id: string;
  projectId: string | null;
  falRequestId: string | null;
  parentImageId: string | null;
  editInstruction: string | null;
  modelId: string;
  ratioId: string;
  mode: "t2i" | "i2i";
  size: { width?: number; height?: number; aspectRatio?: string; resolution?: string };
  requestedImages: number;
  returnedImages: number;
  unitCostUsd: number | null;
  costUsd: number | null;
  /** 공표 가격표에 없는 크기라 가장 비싼 값으로 잡았다. */
  costApproximate: boolean;
  createdAt: string;
}

export interface PosterImageRecord {
  id: string;
  projectId: string;
  generationRequestId: string;
  variantIndex: number;
  selected: boolean;
  assetPath: string;
  width: number | null;
  height: number | null;
  review: unknown | null;
  createdAt: string;
  url?: string;
}

export interface PosterProjectStore {
  list(): Promise<PosterProjectRecord[]>;
  get(id: string): Promise<PosterProjectRecord | undefined>;
  create(input: Omit<PosterProjectRecord, "id" | "createdAt" | "updatedAt">): Promise<PosterProjectRecord>;
  update(id: string, patch: Partial<Pick<PosterProjectRecord, "title" | "status" | "ratio" | "modelId" | "data">>): Promise<PosterProjectRecord>;
  remove(id: string): Promise<void>;
}

export interface PosterReferenceStore {
  list(): Promise<PosterReferenceRecord[]>;
  byIds(ids: string[]): Promise<PosterReferenceRecord[]>;
}

/**
 * 비용 장부. **회원 권한으로는 쓸 수 없다.** 서버가 admin 으로 쓴다.
 *
 * `create` 입력에 `userId` 칸이 없는 것이 중요하다. 로그인 세션에 미리 묶어서
 * 만들기 때문에 요청 본문의 값이 들어올 자리가 아예 없다.
 */
export interface PosterRequestStore {
  create(row: Omit<PosterGenerationRequestRecord,
    "id" | "createdAt" | "returnedImages" | "costUsd" | "falRequestId">): Promise<{ id: string }>;
  /** fal 응답 직후 확정한다. 결과 저장보다 먼저 — 돈은 이미 나갔다. */
  complete(id: string, patch: { falRequestId: string | null; returnedImages: number; costUsd: number }): Promise<void>;
}

export interface PosterImageStore {
  byProject(projectId: string): Promise<PosterImageRecord[]>;
  /**
   * 목록 화면이 대표 그림을 세울 때 쓴다.
   *
   * 작업마다 한 번씩 물어보면 작업 수만큼 질의가 나간다. 한 번에 가져온다.
   */
  byProjects(projectIds: string[]): Promise<PosterImageRecord[]>;
  add(rows: Array<Omit<PosterImageRecord, "id" | "createdAt" | "selected">>): Promise<PosterImageRecord[]>;
  /**
   * 하나만 고른다.
   *
   * **먼저 풀고 나서 건다.** DB 의 부분 유니크 인덱스가 지연 검사를 못 하므로
   * 새로 걸면서 기존 것을 푸는 식이면 순서에 따라 실패한다.
   */
  select(projectId: string, imageId: string): Promise<void>;
  saveReview(imageId: string, review: unknown): Promise<void>;
}
