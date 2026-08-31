import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceCreateRecord, SourceRecord, SourceRepository, SourceUpdateRecord } from "./source-service";

type SourceRow = {
  id: string;
  user_id: string;
  kind: SourceRecord["kind"];
  name: string;
  url: string;
  interval_hours: number;
  enabled: boolean;
  config: Record<string, unknown> | null;
  last_checked_at: string | null;
  next_poll_at: string;
  last_error: string | null;
};

function checked<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

function toRecord(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    intervalHours: row.interval_hours,
    enabled: row.enabled,
    config: row.config ?? {},
    lastCheckedAt: row.last_checked_at,
    nextPollAt: row.next_poll_at,
    lastError: row.last_error,
  };
}

export function createSupabaseSourceRepository(client: SupabaseClient): SourceRepository {
  return {
    async list() {
      const { data, error } = await client
        .from("ingest_sources")
        .select("id,user_id,kind,name,url,interval_hours,enabled,config,last_checked_at,next_poll_at,last_error")
        .order("created_at", { ascending: false });
      return checked((data ?? []) as SourceRow[], error).map(toRecord);
    },
    async insert(row: SourceCreateRecord) {
      const { data, error } = await client.from("ingest_sources").insert({
        user_id: row.userId,
        kind: row.kind,
        name: row.name,
        url: row.url,
        interval_hours: row.intervalHours,
        enabled: row.enabled,
        config: row.config,
      }).select("id,user_id,kind,name,url,interval_hours,enabled,config,last_checked_at,next_poll_at,last_error").single();
      return toRecord(checked(data as SourceRow, error));
    },
    async update(id: string, patch: SourceUpdateRecord) {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) payload.name = patch.name;
      if (patch.url !== undefined) payload.url = patch.url;
      if (patch.intervalHours !== undefined) payload.interval_hours = patch.intervalHours;
      if (patch.enabled !== undefined) payload.enabled = patch.enabled;
      if (patch.config !== undefined) payload.config = patch.config;
      const { data, error } = await client.from("ingest_sources").update(payload).eq("id", id)
        .select("id,user_id,kind,name,url,interval_hours,enabled,config,last_checked_at,next_poll_at,last_error").single();
      return toRecord(checked(data as SourceRow, error));
    },
    async remove(id: string) {
      const { error } = await client.from("ingest_sources").delete().eq("id", id);
      checked(undefined, error);
    },
  };
}
