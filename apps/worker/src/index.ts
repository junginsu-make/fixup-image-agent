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
  LEASE_MINUTES,
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

/**
 * 이 소스에 이미 저장된 외부 id 들.
 *
 * **본문을 캐기 전에 물어본다.** 어댑터 계약은 「중복 확인을 통과한 새 항목만
 * 비싼 본문 추출·자막 수집을 한다」인데, 실제로는 `fetch` 가 준 전부를 캐낸 뒤
 * `saveCandidates` 의 `ignoreDuplicates` 가 걸러 냈다. 12시간 주기 채널 하나가
 * 매 회차 영상 15편의 자막(유료) 또는 STT 를 다시 돌리고 그중 14편을 버렸다.
 */
async function knownExternalIds(sourceId: string, externalIds: string[]): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set();
  const { data, error } = await client
    .from("ingest_candidates")
    .select("external_id")
    .eq("source_id", sourceId)
    .in("external_id", externalIds);
  // 못 물어봤으면 「모른다」로 둔다. 지금까지처럼 전부 캐낸다 — 비싸지만 안 빠뜨린다.
  if (error) {
    console.error(`[worker] 중복 확인 실패, 전부 캐냅니다: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((row) => (row as { external_id: string }).external_id));
}

/**
 * 한 소스의 본문 캐기에 쓸 수 있는 시간.
 *
 * 리스는 10분인데 자막 없는 영상의 STT 는 한 편에 최대 60분까지 기다린다
 * (`youtube-worker.ts`). 그동안 `guardedCycle` 의 `running` 가드 때문에 **다른
 * 사용자의 소스까지 전부 폴링이 멈추고**, 리스는 그 사이 만료되어 중복 방지
 * 근거도 사라졌다. 예산이 다하면 남은 항목은 다음 회차로 넘긴다 — 그때는
 * 이미 저장된 것을 건너뛰므로 앞에서부터 다시 캐지 않는다.
 */
const HYDRATE_BUDGET_MS = (LEASE_MINUTES - 2) * 60 * 1000;

async function fetchFor(source: PollSource): Promise<RawCandidate[]> {
  const adapter = registry.get(source.kind);
  const ingestSource = toIngestSource(source);
  const discovered = await adapter.fetch(ingestSource);
  if (!adapter.hydrate) return discovered;

  const seen = await knownExternalIds(source.id, discovered.map((item) => item.externalId));
  const deadline = Date.now() + HYDRATE_BUDGET_MS;
  const hydrated: RawCandidate[] = [];
  for (const item of discovered) {
    // 이미 있는 것은 캐지 않는다. 어차피 upsert 에서 버려진다.
    if (seen.has(item.externalId)) continue;
    if (Date.now() >= deadline) {
      console.error(`[worker] ${source.name}: 시간 예산을 다 써 ${discovered.length - hydrated.length}건을 다음 회차로 넘깁니다.`);
      break;
    }
    /**
     * **한 건이 죽어도 나머지는 산다.**
     *
     * 여기에 갈래가 없어서, 자막이 꺼진 영상 하나가 `TranscriptUnavailableError`
     * 를 던지면 이미 받아 둔 나머지까지 한 건도 저장되지 않은 채 `markFailed`
     * 로 끝났다. 그 영상이 피드 상위에서 밀려날 때까지 **매 회차 같은 자리에서
     * 죽어 그 소스는 영구히 0건**이었다. RSS·네이버 어댑터는 같은 자리를 이미
     * 감싸 `extractionStatus: "insufficient"` 로 떨어뜨린다 — 의도는 명백하다.
     */
    try {
      hydrated.push(await adapter.hydrate(item, ingestSource));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] ${source.name}: ${item.url} 본문을 캐지 못했습니다: ${message}`);
      hydrated.push({
        ...item,
        metadata: { ...item.metadata, extractionStatus: "insufficient", extractionError: message },
      });
    }
  }
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
