import { createClient } from "@supabase/supabase-js";
import {
  CommunityPageAdapter,
  IngestAdapterRegistry,
  NaverNewsAdapter,
  OfficialAiSourceAdapter,
  RssSourceAdapter,
  YoutubeChannelAdapter,
  ingestYoutube,
  parseYoutubeVideoId,
  type IngestAdapter,
  type IngestSource,
  type IngestSourceKind,
  type RawCandidate,
} from "@fixup/ingest-core";
import {
  DEFAULT_MAX_POLLS_PER_USER_PER_HOUR,
  claimDueSources,
  pollOnce,
  type PollSource,
} from "./poll";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DUE_PER_CYCLE = 50;

function required(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 가 없어 수집 워커를 시작할 수 없습니다.`);
  return value;
}

function configuredRateLimit(): number {
  const parsed = Number(process.env.INGEST_MAX_POLLS_PER_USER_PER_HOUR ?? DEFAULT_MAX_POLLS_PER_USER_PER_HOUR);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_POLLS_PER_USER_PER_HOUR;
}

const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const youtubeVideoAdapter: IngestAdapter = {
  kind: "youtube_video",
  async fetch(source) {
    const document = await ingestYoutube({ id: `candidate_${crypto.randomUUID()}`, url: source.url });
    return [{
      externalId: `yt:video:${parseYoutubeVideoId(source.url)}`,
      title: document.title,
      url: source.url,
      body: document.segments.map((segment) => segment.text).join("\n"),
      author: document.author,
      publishedAt: document.publishedAt,
      thumbnailUrl: document.thumbnailUrl,
      metadata: { extractionChannels: document.extractionChannels ?? [] },
    }];
  },
};

const registry = new IngestAdapterRegistry([
  youtubeVideoAdapter,
  new YoutubeChannelAdapter(),
  new RssSourceAdapter(),
  new CommunityPageAdapter(),
  new NaverNewsAdapter(),
  new OfficialAiSourceAdapter(),
]);

type SourceRow = {
  id: string;
  user_id: string;
  kind: string;
  name: string;
  url: string;
  config: Record<string, unknown>;
  interval_hours: number;
  enabled: boolean;
  last_checked_at: string | null;
  next_poll_at: string;
  lease_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function toPollSource(row: SourceRow): PollSource {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as IngestSourceKind,
    name: row.name,
    url: row.url,
    intervalHours: row.interval_hours,
    enabled: row.enabled,
    config: row.config ?? {},
    lastCheckedAt: row.last_checked_at,
    nextPollAt: row.next_poll_at,
    leaseUntil: row.lease_until,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toIngestSource(source: PollSource): IngestSource {
  const timestamp = new Date().toISOString();
  return {
    id: source.id,
    userId: source.userId,
    kind: source.kind,
    name: source.name,
    url: source.url,
    intervalHours: source.intervalHours,
    enabled: source.enabled ?? true,
    config: source.config,
    lastCheckedAt: source.lastCheckedAt ?? undefined,
    nextPollAt: source.nextPollAt ?? timestamp,
    leaseUntil: source.leaseUntil ?? undefined,
    lastError: source.lastError ?? undefined,
    createdAt: source.createdAt ?? timestamp,
    updatedAt: source.updatedAt ?? timestamp,
  };
}

async function listDue(now: Date): Promise<PollSource[]> {
  const iso = now.toISOString();
  const { data, error } = await client
    .from("ingest_sources")
    .select("*")
    .eq("enabled", true)
    .lte("next_poll_at", iso)
    .or(`lease_until.is.null,lease_until.lt.${iso}`)
    .order("next_poll_at", { ascending: true })
    .limit(MAX_DUE_PER_CYCLE);
  if (error) throw new Error(error.message);
  return (data as SourceRow[] | null ?? []).map(toPollSource);
}

async function claimLease(source: PollSource, now: Date, leaseUntil: Date): Promise<PollSource | undefined> {
  const iso = now.toISOString();
  const { data, error } = await client
    .from("ingest_sources")
    .update({ lease_until: leaseUntil.toISOString() })
    .eq("id", source.id)
    .eq("enabled", true)
    .lte("next_poll_at", iso)
    .or(`lease_until.is.null,lease_until.lt.${iso}`)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPollSource(data as SourceRow) : undefined;
}

async function claimUserSlot(userId: string, now: Date, limit: number): Promise<boolean> {
  const { data, error } = await client.rpc("claim_ingest_poll_slot", {
    p_user_id: userId,
    p_now: now.toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function fetchFor(source: PollSource): Promise<RawCandidate[]> {
  const adapter = registry.get(source.kind);
  const ingestSource = toIngestSource(source);
  const discovered = await adapter.fetch(ingestSource);
  if (!adapter.hydrate) return discovered;

  const hydrated: RawCandidate[] = [];
  for (const item of discovered) hydrated.push(await adapter.hydrate(item, ingestSource));
  return hydrated;
}

async function saveCandidates(rows: Array<RawCandidate & { userId: string; sourceId: string }>): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((row) => ({
    user_id: row.userId,
    source_id: row.sourceId,
    external_id: row.externalId,
    title: row.title,
    url: row.url,
    body: row.body ?? null,
    summary: row.summary ?? null,
    thumbnail_url: row.thumbnailUrl ?? null,
    published_at: row.publishedAt ?? null,
  }));
  const { data, error } = await client
    .from("ingest_candidates")
    .upsert(payload, { onConflict: "source_id,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

async function updateSource(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await client.from("ingest_sources").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

async function runCycle(now = new Date()): Promise<void> {
  const result = await pollOnce({
    now,
    claimDue: (at) => claimDueSources(at, { listDue, claimLease }),
    claimUserSlot,
    maxPollsPerUserPerHour: configuredRateLimit(),
    fetchFor,
    saveCandidates,
    markChecked: (id, next) => updateSource(id, {
      last_checked_at: now.toISOString(),
      next_poll_at: next.toISOString(),
      lease_until: null,
      last_error: null,
      updated_at: now.toISOString(),
    }),
    markFailed: (id, message, next) => updateSource(id, {
      last_checked_at: now.toISOString(),
      next_poll_at: next.toISOString(),
      lease_until: null,
      last_error: message,
      updated_at: now.toISOString(),
    }),
    reportError: (message) => console.error(`[worker] ${message}`),
  });
  console.info(`[worker] checked=${result.checked} collected=${result.collected} failed=${result.failed}`);
}

let running = false;
async function guardedCycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runCycle();
  } catch (error) {
    console.error("[worker] 수집 회차 실패", error instanceof Error ? error.message : String(error));
  } finally {
    running = false;
  }
}

void guardedCycle();
const timer = setInterval(() => void guardedCycle(), POLL_INTERVAL_MS);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
