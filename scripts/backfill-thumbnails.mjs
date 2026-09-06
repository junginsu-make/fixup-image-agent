import { createRequire } from "node:module";

// 이 스크립트는 어느 꾸러미에도 속하지 않는다. 웹 앱이 이미 가진 것을 빌려 쓴다.
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

/**
 * 이미 쌓인 그림에 목록용 작은 사본을 만들어 준다.
 *
 * 라이브러리·갤러리·포스터·카드뉴스·참고 이미지·캐릭터를 함께 채운다.
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
/**
 * 포스터 목록. 원본은 비율마다 가로 1024~2400 이고 절반 이상이 1088 이라 거의
 * 줄지 않는다 — 압축 자국이 1:1 에 가깝게 보여 품질을 높게 잡는다.
 * `apps/web/lib/poster/thumbnail.ts` 와 같은 값이어야 한다.
 */
const POSTER_WIDTH = 1024;
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

/**
 * 포스터 결과.
 *
 * 원본 이름 규칙(`.png`)은 건드리지 않는다 — 사본은 별개 파일이다.
 * 값은 `apps/web/lib/poster/thumbnail.ts` 와 같아야 한다(1024 가로만 / q88).
 */
async function backfillPoster() {
  const after = process.argv.indexOf("--after-poster");
  const cursor = after > 0 ? process.argv[after + 1] : "";

  let listing = supabase
    .from("poster_images")
    .select("id,user_id,project_id,variant_index,asset_path")
    .is("thumb_path", null)
    .order("id", { ascending: true })
    .limit(LIMIT);
  if (cursor) listing = listing.gt("id", cursor);

  const { data: rows, error } = await listing;
  if (error) { console.error(`포스터를 읽지 못했습니다: ${error.message}`); return; }
  if (!rows.length) { console.log("포스터: 채울 것이 없습니다."); return; }

  console.log(`
포스터 ${rows.length}건`);
  let made = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const file = await supabase.storage.from(BUCKET).download(row.asset_path);
    if (file.error || !file.data) { failed += 1; continue; }

    const bytes = Buffer.from(await file.data.arrayBuffer());
    const thumb = await thumbnailFor(bytes, POSTER_WIDTH, 88, true);
    if (!thumb) { skipped += 1; continue; }

    const thumbPath = `${row.user_id}/poster/${row.project_id}/${row.variant_index}.thumb.webp`;
    const uploaded = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
    if (uploaded.error) { failed += 1; continue; }

    const { error: updateError } = await supabase
      .from("poster_images").update({ thumb_path: thumbPath }).eq("id", row.id);
    if (updateError) {
      await supabase.storage.from(BUCKET).remove([thumbPath]);
      failed += 1;
      continue;
    }
    made += 1;
  }
  console.log(`포스터 — 만듦 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
  if (rows.length === LIMIT) {
    console.log(`  이어서: --apply --after-poster ${rows[rows.length - 1].id}`);
  }
}

/**
 * 카드뉴스.
 *
 * **줄이지 않고 형식만 바꾼다** — 카드는 이미 화면에 뜨는 크기로 만들어지므로
 * 줄일 이유가 없고, 그래야 흐려질 위험이 0 이다.
 * 값은 `apps/web/lib/sns/thumbnail.ts` 와 같아야 한다(줄이지 않음 / q88).
 *
 * 카드는 흐름 JSON 안에도 자리가 있어 표와 함께 고쳐야 한다.
 */
/**
 * 카드뉴스.
 *
 * **작업 단위로 돈다.** SNS 는 읽는 쪽이 전부 흐름 JSON(`sns_projects.data`)
 * 이라, 표(`sns_cards`)에만 적으면 화면이 미리보기를 못 쓰고 지울 때도 못 찾아
 * 고아 파일만 쌓인다. 그래서 **둘을 함께** 고친다.
 *
 * 값은 `apps/web/lib/sns/thumbnail.ts` 와 같아야 한다 — **줄이지 않고** q88.
 * 카드는 이미 화면에 뜨는 크기라 줄일 이유가 없고, 그래야 흐려질 위험이 0 이다.
 *
 * 경로 규칙도 같아야 한다: `{user}/sns/{project}/{index}.thumb.webp`
 *
 * 이 스크립트는 다른 작업이 없을 때 돌린다 — 흐름 JSON 을 읽고 고쳐 쓰므로,
 * 같은 작업을 누가 동시에 저장하면 그쪽이 덮는다.
 */
async function backfillSns() {
  const after = process.argv.indexOf("--after-sns");
  const cursor = after > 0 ? process.argv[after + 1] : "";

  let listing = supabase
    .from("sns_projects")
    .select("id,user_id,data")
    .order("id", { ascending: true })
    .limit(LIMIT);
  if (cursor) listing = listing.gt("id", cursor);

  const { data: projects, error } = await listing;
  if (error) { console.error(`카드뉴스를 읽지 못했습니다: ${error.message}`); return; }
  if (!projects.length) { console.log("카드뉴스: 채울 것이 없습니다."); return; }

  let made = 0, skipped = 0, failed = 0, touched = 0;

  for (const project of projects) {
    const cards = project.data?.flow?.cards ?? [];
    const todo = cards.filter((card) => card.assetPath && !card.thumbPath);
    if (!todo.length) continue;

    let changed = false;
    for (const card of todo) {
      const file = await supabase.storage.from(BUCKET).download(card.assetPath);
      if (file.error || !file.data) { failed += 1; continue; }

      const bytes = Buffer.from(await file.data.arrayBuffer());
      let preview;
      try {
        preview = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
          .keepMetadata().webp({ quality: 88 }).toBuffer();
      } catch { failed += 1; continue; }
      if (preview.length >= bytes.length) { skipped += 1; continue; }

      const thumbPath = `${project.user_id}/sns/${project.id}/${card.index}.thumb.webp`;
      const uploaded = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, preview, { contentType: "image/webp", upsert: true });
      if (uploaded.error) { failed += 1; continue; }

      card.thumbPath = thumbPath;
      changed = true;
      made += 1;
    }

    if (!changed) continue;

    // **흐름 JSON 이 읽는 쪽의 유일한 근거다.** 여기 못 적으면 방금 올린
    // 파일들이 전부 아무도 못 찾는 파일이 된다 — 지울 때도 안 지워진다.
    const { error: updateError } = await supabase
      .from("sns_projects").update({ data: project.data }).eq("id", project.id);
    if (updateError) {
      const orphans = todo.filter((card) => card.thumbPath).map((card) => card.thumbPath);
      if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
      failed += orphans.length;
      made -= orphans.length;
      console.error(`  흐름에 못 적음(되돌림): ${project.id}`);
      continue;
    }

    // 표도 함께 맞춘다. 화면은 흐름을 보지만, 표가 어긋난 채 남으면 나중에
    // 표를 보는 코드가 생겼을 때 두 값이 다르다.
    for (const card of todo) {
      if (!card.thumbPath) continue;
      await supabase.from("sns_cards")
        .update({ thumb_path: card.thumbPath })
        .eq("project_id", project.id).eq("index", card.index);
    }
    touched += 1;
  }

  console.log(`
카드뉴스 — 작업 ${touched}건 · 만듦 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
  if (projects.length === LIMIT) {
    console.log(`  이어서: --apply --after-sns ${projects[projects.length - 1].id}`);
  }
}

/**
 * 참고 이미지와 캐릭터 각도.
 *
 * 값은 `apps/web/lib/grid-thumbnail.ts` 와 같아야 한다 — 가로 512 / q78.
 * 경로는 원본에 `.thumb.webp` 를 덧붙인다(`grid-thumbnail-path.ts`).
 *
 * 참고 이미지는 **공용 창고**라 한 화면에 400장까지 뜬다. 남은 것 중 전송량이
 * 가장 크다.
 */
async function backfillGrid(table, pathColumn, label, cursorFlag, bucket = BUCKET) {
  const after = process.argv.indexOf(cursorFlag);
  const cursor = after > 0 ? process.argv[after + 1] : "";

  let listing = supabase
    .from(table)
    .select(`id,${pathColumn}`)
    .is("thumb_path", null)
    .order("id", { ascending: true })
    .limit(LIMIT);
  if (cursor) listing = listing.gt("id", cursor);

  const { data: rows, error } = await listing;
  if (error) { console.error(`${label}을 읽지 못했습니다: ${error.message}`); return; }
  if (!rows.length) { console.log(`${label}: 채울 것이 없습니다.`); return; }

  console.log(`
${label} ${rows.length}건`);
  let made = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const originalPath = row[pathColumn];
    if (!originalPath) { skipped += 1; continue; }

    const file = await supabase.storage.from(bucket).download(originalPath);
    if (file.error || !file.data) { failed += 1; continue; }

    const bytes = Buffer.from(await file.data.arrayBuffer());
    const thumb = await thumbnailFor(bytes, 512, 78, true);
    if (!thumb) { skipped += 1; continue; }

    const dot = originalPath.lastIndexOf("."), slash = originalPath.lastIndexOf("/");
    const thumbPath = `${dot > slash ? originalPath.slice(0, dot) : originalPath}.thumb.webp`;

    const uploaded = await supabase.storage
      .from(bucket)
      .upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
    if (uploaded.error) { failed += 1; continue; }

    const { error: updateError } = await supabase
      .from(table).update({ thumb_path: thumbPath }).eq("id", row.id);
    if (updateError) {
      await supabase.storage.from(bucket).remove([thumbPath]);
      failed += 1;
      continue;
    }
    made += 1;
  }

  console.log(`${label} — 만듦 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
  if (rows.length === LIMIT) {
    console.log(`  이어서: --apply ${cursorFlag} ${rows[rows.length - 1].id}`);
  }
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
  await backfillPoster();
  await backfillSns();
  await backfillGrid("reference_images", "storage_path", "참고 이미지", "--after-reference");
  // **캐릭터는 버킷이 다르다.** 경로 모양이 라이브러리와 똑같아 눈으로는
  // 안 걸리는데, 틀리면 전 건 실패한다.
  await backfillGrid("character_views", "path", "캐릭터", "--after-character", "characters");
  if (rows.length === LIMIT) {
    // 커서를 하나만 넘기면 다른 갈래가 처음부터 다시 돈다 — 건너뛴 건을
    // 매번 다시 내려받게 되어 커서를 둔 이유가 사라진다. 함께 안내한다.
    console.log("상한에 걸렸습니다. 이어서 하려면 다섯 커서를 함께 넘기세요:");
    console.log(`  --apply --after ${rows[rows.length - 1].id} --after-poster <끝 id> --after-sns <끝 id> --after-reference <끝 id> --after-character <끝 id>`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
