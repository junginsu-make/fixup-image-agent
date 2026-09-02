import type { CandidateStatus } from "./schema";

export interface CandidateSource {
  id: string;
  name: string;
  kind: string;
}

export interface CandidateRecord {
  id: string;
  sourceId: string | null;
  title: string;
  url: string | null;
  /** 작성자·채널. 어디서 온 글인지 사람이 판단할 때 쓴다. */
  author: string | null;
  /** 수집기가 뽑아 둔 핵심 문장들. 훑어보고 고를 때 쓴다. */
  keyPoints: string[];
  body: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  collectedAt: string;
  status: CandidateStatus;
  source: CandidateSource | null;
}

export interface CandidateRepository {
  list(): Promise<CandidateRecord[]>;
  updateStatus(id: string, status: CandidateStatus): Promise<CandidateRecord>;
}

export function createCandidateService(repository: CandidateRepository) {
  return {
    list: () => repository.list(),
    updateStatus: (id: string, status: CandidateStatus) => repository.updateStatus(id, status),
  };
}
