import { createRequire } from "node:module";

// 이 스크립트는 어느 꾸러미에도 속하지 않는다. 웹 앱이 이미 가진 것을 빌려 쓴다.
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

/**
 * 이미 쌓인 그림에 목록용 작은 사본을 만들어 준다.
 *
 * 라이브러리(512px)와 첫 화면 갤러리(1024px)를 함께 채운다.
 *
 * 새로 저장하는 것은 저장할 때 사본이 함께 만들어진다. 그런데 그것만으로는
 * **옛 계정일수록 이득이 0** 이다 — 목록에 뜨는 것이 대부분 옛 그림이기 때문이다.
 *
 * 사본은 파생본이라 잘못 만들어도 지우고 다시 만들면 그만이고, 원본과 표의
 * `path` 는 **읽기만 한다.** 그래서 되돌릴 것이 없다.
 *
 * 사용법:
 *   node scripts/backfill-thumbnails.mjs               (미리보기 — 아무것도 안 바꾼다)
 *   node scripts/backfill-thumbnails.mjs --apply       (실제 생성)
 *   node scripts/backfill-thumbnails.mjs --apply --limit 100
 *   node scripts/backfill-thumbnails.mjs --apply --after <마지막 id>   (이어서)
 */

const BUCKET = "library";
const THUMBNAIL_EDGE = 512;
/**
 * 갤러리는 화면에서 크게 뜬다. 512 로 줄이면 첫인상이 흐려진다.
 *
 * **가로만 묶는다** — 갤러리는 열로 흘려 배치하므로 제약이 가로뿐이고, 긴 변을
 * 묶으면 세로로 긴 그림의 가로가 깎여 흐려진다. `store.ts` 의
 * `SHOWCASE_THUMBNAIL_WIDTH` 와 같은 값이어야 한다.
 */
const SHOWCASE_WIDTH = 1024;
const MAX_INPUT_PIXELS = 12_000_000;

const apply = process.argv.includes("--apply");
const limitAt = process.argv.indexOf("--limit");
const LIMIT = limitAt > 0 ? Number(process.argv[limitAt + 1]) : 500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SECRET_KEY 가 필요합니다.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * 저장할 때와 **같은 규칙**을 쓴다. 여기만 달라지면 두 종류의 사본이 섞인다.
 *
 * 값이 `apps/web/lib/image-encoding.ts` 의 `makeThumbnail` 과 일치해야 한다 —
 * 512 / quality 78 / keepMetadata / limitInputPixels / 「작을 때만」.
 * 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
 */
async function thumbnailFor(bytes, edge = THUMBNAIL_EDGE, quality = 78, widthOnly = false) {
  try {
    const thumb = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .keepMetadata()
      .resize(edge, widthOnly ? null : edge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    // 원본보다 작을 때만 둔다. 이미 작은 그림은 줄여도 오히려 커진다.
    return thumb.length < bytes.length ? thumb : null;
  } catch (error) {
    console.error(`  sharp 실패: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * 첫 화면 갤러리.
 *
 * 커서를 두지 않는다. 표에 상한은 없지만 여기 걸리는 것은 **관리자가 직접 고른
 * 것**이라 실전에서 수십 건이다. 사본을 못 만든 건은 다음 실행에서 또 걸리는데,
 * 그 수가 적어 라이브러리처럼 제자리를 돌 위험이 없다. 그래도 한 번에 무한정
 * 읽지는 않게 상한은 건다.
 */
async function backfillShowcase() {
  const { data: rows, error } = await supabase
    .from("showcase_items")
    .select("id,storage_path")
    .is("thumb_path", null)
    .limit(LIMIT);
  if (error) { console.error(`갤러리를 읽지 못했습니다: ${error.message}`); return; }
  if (!rows.length) { console.log("갤러리: 채울 것이 없습니다."); return; }

  console.log(`
갤러리 ${rows.length}건`);
  let made = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const file = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (file.error || !file.data) { failed += 1; continue; }

    const bytes = Buffer.from(await file.data.arrayBuffer());
    const thumb = await thumbnailFor(bytes, SHOWCASE_WIDTH, 82, true);
    if (!thumb) { skipped += 1; continue; }

    const thumbPath = `showcase/${row.id}.thumb.webp`;
    const uploaded = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
    if (uploaded.error) { failed += 1; continue; }

    const { error: updateError } = await supabase
      .from("showcase_items").update({ thumb_path: thumbPath }).eq("id", row.id);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([thumbPath]);
      failed += 1;
      continue;
    }
    made += 1;
  }
  console.log(`갤러리 — 만듦 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
}

async function main() {
  /**
   * **id 로 앞으로만 나아간다.**
   *
   * `thumb_path is null` 만 걸고 매번 처음부터 뒤지면, 건너뛴 건(사본이 원본보다
   * 큼)과 실패한 건이 계속 null 로 남아 **다음 실행에서 또 걸린다.** 그것들이
   * 상한만큼 쌓이면 매 실행이 같은 행만 물어 영영 진전이 없고, 이 작업이
   * 줄이려던 바로 그 전송량을 다시 쓴다.
   */
  const after = process.argv.indexOf("--after");
  const cursor = after > 0 ? process.argv[after + 1] : "";

  let listing = supabase
    .from("library_images")
    .select("id,item_id,position,user_id,path")
    .is("thumb_path", null)
    .order("id", { ascending: true })
    .limit(LIMIT);
  if (cursor) listing = listing.gt("id", cursor);

  const { data: rows, error } = await listing;
  if (error) throw new Error(error.message);

  console.log(`${apply ? "생성" : "미리보기"} — 사본이 없는 그림 ${rows.length}건 (상한 ${LIMIT})`);
  if (!apply) {
    console.log("실제로 만들려면 --apply 를 붙이세요.");
    return;
  }

  let made = 0, skipped = 0, failed = 0, savedBytes = 0;

  for (const row of rows) {
    const file = await supabase.storage.from(BUCKET).download(row.path);
    if (file.error || !file.data) { failed += 1; console.error(`  못 읽음: ${row.path}`); continue; }

    const bytes = Buffer.from(await file.data.arrayBuffer());
    const thumb = await thumbnailFor(bytes);
    if (!thumb) { skipped += 1; continue; }

    const thumbPath = `${row.user_id}/${row.item_id}/${row.position}.thumb.webp`;
    const uploaded = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
    if (uploaded.error) { failed += 1; console.error(`  못 올림: ${thumbPath}`); continue; }

    // 표에 적어야 목록이 쓰고, 지울 때도 같이 지워진다. **적지 못하면 방금
    // 올린 파일을 도로 지운다** — 아무 행도 가리키지 않는 파일은 삭제 때도
    // 안 지워져서 영영 남는다.
    const { error: updateError } = await supabase
      .from("library_images").update({ thumb_path: thumbPath }).eq("id", row.id);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([thumbPath]);
      failed += 1;
      console.error(`  표에 못 적음(사본 되돌림): ${thumbPath}`);
      continue;
    }
    if (row.position === 0) {
      await supabase.from("library_items").update({ cover_thumb_path: thumbPath }).eq("id", row.item_id);
    }

    made += 1;
    savedBytes += bytes.length - thumb.length;
  }

  console.log(`\n만듦 ${made} · 건너뜀(원본이 더 작음) ${skipped} · 실패 ${failed}`);
  console.log(`목록 한 번당 아끼는 양: 약 ${(savedBytes / 1048576).toFixed(1)}MB`);

  await backfillShowcase();
  if (rows.length === LIMIT) {
    console.log(`상한에 걸렸습니다. 이어서 하려면: --apply --after ${rows[rows.length - 1].id}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
