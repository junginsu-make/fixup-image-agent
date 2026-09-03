import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// 이 스크립트는 어느 꾸러미에도 속하지 않는다. 웹 앱이 이미 가진 것을 빌려 쓴다.
const { createClient } = createRequire(new URL("../apps/web/package.json", import.meta.url))(
  "@supabase/supabase-js",
);

/**
 * 로컬 파일 저장소에 쌓인 것을 운영 Supabase 로 옮긴다.
 *
 * 로컬은 로그인 없이 쓰는 개발용 사용자(00000000-…-0001)로 모든 것을 저장했다.
 * 운영에는 그런 사람이 없으므로 **실제 계정으로 주인을 바꿔서** 넣는다.
 * 파일 경로에도 사용자 id 가 들어가고 표에 그 모양을 검사하는 제약이 걸려
 * 있어, 경로까지 함께 바꾼다.
 *
 *   library/{옛id}/references/{그림id}.png  →  {새id}/references/{그림id}.png
 *   library/{옛id}/sns/{작업}/{장}.png       →  {새id}/sns/{작업}/{장}.png
 *
 * 표에 넣는 순서는 서로를 가리키는 순서를 따른다. 수집 소스가 먼저 있어야
 * 후보가 붙고, 후보가 있어야 카드뉴스가 그걸 가리킬 수 있다.
 *
 * 사용법:
 *   node scripts/migrate-local-to-supabase.mjs --user <uuid>          (미리보기)
 *   node scripts/migrate-local-to-supabase.mjs --user <uuid> --apply  (실제 이전)
 */

const BUCKET = "library";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const targetUser = args[args.indexOf("--user") + 1];

if (!/^[0-9a-f-]{36}$/i.test(targetUser ?? "")) {
  console.error("사용법: node scripts/migrate-local-to-supabase.mjs --user <uuid> [--apply]");
  process.exit(1);
}

/** 값은 파일에서만 읽는다. 화면에 찍지 않는다. */
function envFrom(file, names) {
  const found = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && names.includes(match[1]) && match[2].trim()) found[match[1]] = match[2].trim();
  }
  return found;
}

const ENV_FILE = process.env.MIGRATE_ENV_FILE
  ?? "C:/Users/PC/Desktop/coding/Detail Page/apps/web/.env.local";
const env = envFrom(ENV_FILE, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!env[name]) { console.error(`${ENV_FILE} 에 ${name} 이 없습니다.`); process.exit(1); }
}

const ROOT = process.env.MIGRATE_STORE_ROOT
  ?? "C:/Users/PC/Desktop/coding/fixup-image-agent/data/local/verification";
const store = JSON.parse(readFileSync(path.join(ROOT, "store.json"), "utf8"));

const OLD_USER = store.referenceImages?.[0]?.userId
  ?? store.snsProjects?.[0]?.userId
  ?? "00000000-0000-4000-8000-000000000001";

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

/** 옛 주인이 박힌 저장 경로를 새 주인 것으로 바꾼다. */
function repath(storagePath) {
  return storagePath?.startsWith(`${OLD_USER}/`)
    ? `${targetUser}/${storagePath.slice(OLD_USER.length + 1)}`
    : storagePath;
}

const report = [];
let uploaded = 0;
let missing = 0;

async function upload(storagePath) {
  const source = path.join(ROOT, BUCKET, ...storagePath.split("/"));
  if (!existsSync(source)) { missing += 1; return null; }
  const target = repath(storagePath);
  if (!apply) { uploaded += 1; return target; }
  const extension = path.extname(source).toLowerCase();
  const contentType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const result = await supabase.storage.from(BUCKET)
    .upload(target, readFileSync(source), { contentType, upsert: true });
  if (result.error) throw new Error(`${target}: ${result.error.message}`);
  uploaded += 1;
  return target;
}

async function insert(table, rows) {
  if (!rows.length) { report.push([table, 0]); return; }
  if (apply) {
    const result = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }
  report.push([table, rows.length]);
}

// ── 수집 소스와 후보 ────────────────────────────────────────────────
await insert("ingest_sources", (store.sources ?? []).map((row) => ({
  id: row.id, user_id: targetUser, kind: row.kind, name: row.name, url: row.url,
  config: row.config ?? {}, interval_hours: row.intervalHours ?? 12,
  enabled: row.enabled ?? true, last_checked_at: row.lastCheckedAt ?? null,
  next_poll_at: row.nextPollAt ?? new Date().toISOString(),
  last_error: row.lastError ?? null, created_at: row.createdAt,
})));

await insert("ingest_candidates", (store.candidates ?? []).map((row) => ({
  id: row.id, user_id: targetUser, source_id: row.sourceId ?? null,
  external_id: row.externalId, title: row.title, url: row.url ?? null,
  author: row.author ?? null, body: row.body ?? null, summary: row.summary ?? null,
  key_points: row.keyPoints ?? [], thumbnail_url: row.thumbnailUrl ?? null,
  published_at: row.publishedAt ?? null, collected_at: row.collectedAt,
  status: row.status ?? "new",
})));

// ── 참고 이미지와 묶음 세트 ─────────────────────────────────────────
const referenceRows = [];
for (const row of store.referenceImages ?? []) {
  const target = await upload(row.storagePath);
  if (!target) continue;
  referenceRows.push({
    id: row.id, user_id: targetUser, storage_path: target, title: row.title ?? null,
    purpose: row.purpose ?? "cardnews", width: row.width ?? null, height: row.height ?? null,
    created_at: row.createdAt,
  });
}
await insert("reference_images", referenceRows);

await insert("reference_sets", (store.referenceSets ?? []).map((row) => ({
  id: row.id, user_id: targetUser, name: row.name, purpose: row.purpose ?? "cardnews",
  created_at: row.createdAt, updated_at: row.updatedAt,
})));

await insert("reference_set_items", (store.referenceSets ?? []).flatMap((set) =>
  (set.items ?? []).map((item, index) => ({
    id: item.id, set_id: set.id, reference_image_id: item.referenceImageId,
    role: item.role, position: item.position ?? index,
  }))));

// ── 카드뉴스 작업물 ─────────────────────────────────────────────────
const projectRows = [];
for (const project of store.snsProjects ?? []) {
  const data = structuredClone(project.data ?? {});

  for (const attachment of data.attachments ?? []) {
    const target = await upload(attachment.assetPath);
    attachment.assetPath = target ?? attachment.assetPath;
    // 화면을 열 때 서명 URL 로 다시 만든다. 옛 주소를 남기면 깨진 그림이 뜬다.
    delete attachment.url;
  }
  for (const card of data.flow?.cards ?? []) {
    if (!card.assetPath) continue;
    const target = await upload(card.assetPath);
    card.assetPath = target ?? card.assetPath;
    delete card.assetUrl;
  }

  projectRows.push({
    id: project.id, user_id: targetUser, candidate_id: project.candidateId ?? null,
    title: project.title, status: project.status, ratio: project.ratio,
    language: project.language ?? "ko", model_id: project.modelId,
    card_count_mode: project.cardCountMode ?? "auto", card_count: project.cardCount ?? null,
    tone_note: project.toneNote ?? null,
    data: { ...data, slotPlan: project.slotPlan },
    created_at: project.createdAt, updated_at: project.updatedAt,
  });
}
await insert("sns_projects", projectRows);

await insert("sns_cards", (store.cards ?? []).map((row) => ({
  id: row.id, user_id: targetUser, project_id: row.projectId, index: row.index,
  kind: row.kind ?? "generated", role: row.role, copy: row.copy ?? {},
  prompt: row.prompt ?? null, asset_path: row.assetPath ? repath(row.assetPath) : null,
  status: row.status ?? "pending", review: row.review ?? null, error: row.error ?? null,
})));

await insert("sns_generation_requests", (store.generationRequests ?? []).map((row) => ({
  id: row.id, user_id: targetUser, project_id: row.projectId ?? null,
  card_index: row.cardIndex, fal_request_id: row.falRequestId ?? null,
  model_id: row.modelId, mode: row.mode, size: row.size ?? {},
  requested_images: row.requestedImages ?? 1, returned_images: row.returnedImages ?? 0,
  unit_cost_usd: row.unitCostUsd ?? null, cost_usd: row.costUsd ?? null,
  created_at: row.createdAt,
})));

console.log(apply ? "── 이전 완료 ──" : "── 미리보기 (아무것도 바꾸지 않았습니다) ──");
console.log(`주인: ${OLD_USER}\n  →  ${targetUser}\n`);
for (const [table, count] of report) console.log(`  ${table.padEnd(26)} ${count}건`);
console.log(`\n  올린 파일 ${uploaded}개${missing ? ` · 디스크에 없어 건너뜀 ${missing}개` : ""}`);
if (!apply) console.log("\n실제로 옮기려면 --apply 를 붙이세요.");
