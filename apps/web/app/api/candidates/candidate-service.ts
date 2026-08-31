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
