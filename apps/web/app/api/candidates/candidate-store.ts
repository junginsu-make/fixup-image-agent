import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateRecord, CandidateRepository, CandidateSource } from "./candidate-service";
import type { CandidateStatus } from "./schema";

type CandidateRow = {
  id: string;
  source_id: string | null;
  title: string;
  url: string | null;
  body: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string;
  status: CandidateStatus;
  ingest_sources: CandidateSource | CandidateSource[] | null;
};

const SELECT = "id,source_id,title,url,body,summary,thumbnail_url,published_at,collected_at,status,ingest_sources(id,name,kind)";

function checked<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

function toRecord(row: CandidateRow): CandidateRecord {
  const source = Array.isArray(row.ingest_sources) ? row.ingest_sources[0] ?? null : row.ingest_sources;
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    body: row.body,
    summary: row.summary,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
    status: row.status,
    source,
  };
}

export function createSupabaseCandidateRepository(client: SupabaseClient): CandidateRepository {
  return {
    async list() {
      const { data, error } = await client.from("ingest_candidates").select(SELECT).order("collected_at", { ascending: false });
      return checked((data ?? []) as unknown as CandidateRow[], error).map(toRecord);
    },
    async updateStatus(id: string, status: CandidateStatus) {
      const { data, error } = await client.from("ingest_candidates").update({ status }).eq("id", id).select(SELECT).single();
      return toRecord(checked(data as unknown as CandidateRow, error));
    },
  };
}
