/**
 * 기존 시스템(CardForge)의 수집 데이터를 새 로컬 저장소로 옮긴다.
 *
 * 수집 미디어와 수집함은 예전 시스템에서 잘 돌던 기능이다. 새로 만들면서
 * 모아 둔 것을 잃을 이유가 없다.
 *
 * 실행: pnpm tsx scripts/import-legacy-ingest.mts <원본.json> [대상 루트]
 *
 * **여러 번 돌려도 안전하다.** 같은 것은 다시 넣지 않는다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const [sourceFile, targetRoot = "data/local"] = process.argv.slice(2);
if (!sourceFile) {
  console.error("원본 파일을 알려 주세요: pnpm tsx scripts/import-legacy-ingest.mts <원본.json>");
  process.exit(1);
}

/** 새 저장소가 아는 종류만 옮긴다. 모르는 종류는 그대로 두고 건너뛴다. */
const KINDS = new Set(["youtube_video", "youtube_channel", "rss", "community", "naver_news", "official_ai"]);
const STATUSES = new Set(["new", "picked", "archived"]);

interface LegacySubscription {
  id: string; name: string; kind: string; url: string; enabled?: boolean;
  pollingMinutes?: number; config?: unknown; lastCheckedAt?: string; lastError?: string;
  createdAt?: string; updatedAt?: string;
}
interface LegacyCandidate {
  id: string; subscriptionId?: string; externalId: string; title: string; url?: string;
  author?: string; keyPoints?: string[];
  excerpt?: string; summary?: string; sourceText?: string; thumbnailUrl?: string;
  publishedAt?: string; collectedAt?: string; status?: string;
}

const legacy = JSON.parse(await readFile(sourceFile, "utf8")) as {
  subscriptions?: LegacySubscription[];
  candidates?: LegacyCandidate[];
};

const storePath = path.join(targetRoot, "store.json");
let store: Record<string, unknown[]> = {};
try {
  store = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown[]>;
} catch {
  store = { version: 1 } as never;
}
for (const key of ["sources", "candidates", "referenceImages", "referenceSets", "snsProjects"]) {
  if (!Array.isArray(store[key])) store[key] = [];
}

const userId = process.env.LOCAL_AUTH_USER_ID?.trim()
  || "00000000-0000-4000-8000-000000000001";

// 예전 id 를 새 id 에 대응시켜 후보가 소스를 잃지 않게 한다.
const sourceIdByLegacy = new Map<string, string>();
const existingSources = store.sources as Array<{ userId: string; url: string; name: string; id: string }>;
const existingCandidates = store.candidates as Array<{ userId: string; externalId: string }>;
const seenExternal = new Set(existingCandidates.filter((row) => row.userId === userId).map((row) => row.externalId));

let addedSources = 0;
let skippedSources = 0;
for (const legacySource of legacy.subscriptions ?? []) {
  if (!KINDS.has(legacySource.kind)) { skippedSources += 1; continue; }
  const already = existingSources.find(
    (row) => row.userId === userId && row.url === legacySource.url && row.name === legacySource.name,
  );
  if (already) { sourceIdByLegacy.set(legacySource.id, already.id); continue; }

  const id = randomUUID();
  sourceIdByLegacy.set(legacySource.id, id);
  const now = new Date().toISOString();
  existingSources.push({
    id, userId,
    kind: legacySource.kind,
    name: legacySource.name,
    url: legacySource.url,
    // 분 단위였던 주기를 시간으로 바꾼다. 새 스키마는 1~168시간이다.
    intervalHours: Math.min(168, Math.max(1, Math.round((legacySource.pollingMinutes ?? 60) / 60))),
    // **꺼진 채로 들여온다.** 켜진 채로 들어오면 옮기자마자 수집이 돌아
    // 예상 못 한 비용이 나갈 수 있다. 사람이 보고 켠다.
    enabled: false,
    config: legacySource.config ?? {},
    lastCheckedAt: legacySource.lastCheckedAt ?? null,
    nextPollAt: now,
    leaseUntil: null,
    lastError: legacySource.lastError ?? null,
    createdAt: legacySource.createdAt ?? now,
    updatedAt: now,
  } as never);
  addedSources += 1;
}

let addedCandidates = 0;
let skippedCandidates = 0;
for (const candidate of legacy.candidates ?? []) {
  if (seenExternal.has(candidate.externalId)) { skippedCandidates += 1; continue; }
  seenExternal.add(candidate.externalId);
  existingCandidates.push({
    id: randomUUID(), userId,
    sourceId: candidate.subscriptionId ? sourceIdByLegacy.get(candidate.subscriptionId) ?? null : null,
    externalId: candidate.externalId,
    title: candidate.title,
    url: candidate.url ?? null,
    author: candidate.author ?? null,
    keyPoints: candidate.keyPoints ?? [],
    body: candidate.sourceText ?? null,
    summary: candidate.summary ?? candidate.excerpt ?? null,
    thumbnailUrl: candidate.thumbnailUrl ?? null,
    publishedAt: candidate.publishedAt ?? null,
    collectedAt: candidate.collectedAt ?? new Date().toISOString(),
    // requested 는 새 시스템에 없다. 프로젝트 관계로 판정한다.
    status: STATUSES.has(candidate.status ?? "") ? candidate.status : "new",
  } as never);
  addedCandidates += 1;
}

await mkdir(path.dirname(storePath), { recursive: true });
await writeFile(storePath, JSON.stringify(store, null, 2));

console.log("옮겼습니다");
console.log(`  수집 소스   ${addedSources}건 추가, ${skippedSources}건 건너뜀(모르는 종류)`);
console.log(`  수집한 글   ${addedCandidates}건 추가, ${skippedCandidates}건 건너뜀(이미 있음)`);
console.log(`  대상        ${storePath}`);
console.log("");
console.log("소스는 모두 꺼진 채로 들어갔습니다. 수집 미디어 화면에서 켜세요.");
