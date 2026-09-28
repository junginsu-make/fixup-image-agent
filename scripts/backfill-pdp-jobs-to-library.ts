/**
 * 서버에 남은 상세페이지 결과를 **라이브러리 작업으로 등록**한다(2026-09-28).
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 *
 * 상세페이지는 만든 그림을 서버(`pdp_generation_items`, 저장소 `library` 버킷의
 * `<user>/pdp-jobs/...`)에 남긴다. 그런데 **라이브러리 작업(`library_items`)으로
 * 등록하는 일은 화면이 했다.** 2026-09-23 이전에는
 *   - 등록은 「라이브러리에 저장」 단추뿐이었고
 *   - 그 단추가 10MB 한도에 걸려 실패했다(운영 로그 09-23 01:23)
 * 그 뒤 자동 저장이 생겼지만 **새로 만드는 것에만** 걸린다. 그래서 그 전에 만든
 * 페이지는 그림이 서버에 있는데도 라이브러리에 안 보였다.
 *
 * ── 무엇을 하나 ─────────────────────────────────────────────
 *
 * 문서마다 페이지 차례로 그림을 모아(`storedPagesByDocument`) **앱이 쓰는 저장
 * 함수 그대로**(`saveOrAppendLibraryItem` — 「AI 이미지」 표기·저장 인코딩·작은
 * 사본) 한 작업으로 등록한다. 작업 열쇠는 문서 id 다(uuid 칸).
 *
 * **두 번 돌려도 안전하다.** 같은 문서가 이미 그 장수만큼 있으면 서버가
 * 「이미 있음」으로 넘긴다(`appendDecision`). 원본 파일은 **읽기만** 한다.
 *
 * ── 사용법 (운영 서버에서) ──────────────────────────────────
 *
 *   node backfill.cjs                       미리보기 — 아무것도 안 바꾼다
 *   node backfill.cjs --apply               등록
 *   node backfill.cjs --apply --document <id>   한 문서만
 */
import { createSupabaseAdminClient } from "../apps/web/lib/supabase/admin";
import { findLibraryItemBySource, saveOrAppendLibraryItem } from "../apps/web/lib/server-library";
import { storedPagesByDocument, type StoredItemRow, type StoredJobRow } from "../apps/web/lib/pdp/jobs/library-backfill";

const BUCKET = "library";

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

/** 목록에서 알아볼 이름. 기획 글은 브라우저에만 있어 서버는 날짜로 이름 짓는다. */
function titleFor(createdAt: string): string {
  const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(createdAt));
  return `상세페이지 작업 (${day} 생성)`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlyDocument = option("--document");
  const admin = createSupabaseAdminClient();

  const jobsQuery = admin
    .from("pdp_generation_jobs")
    .select("id,user_id,document_id,section_ids,created_at")
    .eq("persistence", "stored");
  const { data: jobs, error: jobsError } = onlyDocument ? await jobsQuery.eq("document_id", onlyDocument) : await jobsQuery;
  if (jobsError) throw new Error(`작업 목록을 읽지 못했습니다: ${jobsError.message}`);

  const jobIds = (jobs ?? []).map((job) => job.id as string);
  const { data: items, error: itemsError } = jobIds.length
    ? await admin.from("pdp_generation_items").select("job_id,section_id,attempt,output_path,created_at").in("job_id", jobIds)
    : { data: [], error: null };
  if (itemsError) throw new Error(`결과 목록을 읽지 못했습니다: ${itemsError.message}`);

  const pages = storedPagesByDocument((jobs ?? []) as StoredJobRow[], (items ?? []) as StoredItemRow[]);
  console.log(`${apply ? "[등록]" : "[미리보기]"} 서버에 남은 상세페이지 ${pages.length}개`);

  for (const page of pages) {
    const existing = await findLibraryItemBySource(page.userId, "create", page.documentId);
    const have = existing?.imageCount ?? 0;
    const label = `문서 ${page.documentId} · 회원 ${page.userId.slice(0, 8)} · ${page.paths.length}장 · ${titleFor(page.firstCreatedAt)}`;
    if (have >= page.paths.length) {
      console.log(`  건너뜀(이미 라이브러리에 ${have}장): ${label}`);
      continue;
    }
    if (!apply) {
      console.log(`  등록 예정: ${label}${have ? ` (이미 ${have}장 — 이어서)` : ""}`);
      continue;
    }

    // 한 장씩 받아 한 장씩 올린다. 서버 메모리(911MB)에 여러 장을 쥐지 않는다.
    let saved = have;
    for (const [position, path] of page.paths.entries()) {
      if (position < have) continue;
      const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !blob) throw new Error(`그림을 읽지 못했습니다(${path}): ${error?.message ?? "빈 응답"}`);
      const bytes = Buffer.from(await blob.arrayBuffer());
      const result = await saveOrAppendLibraryItem({
        userId: page.userId,
        title: titleFor(page.firstCreatedAt),
        tool: "create",
        origin: "ai",
        sourceId: page.documentId,
        startPosition: position,
        process: null,
        images: [{ base64: bytes.toString("base64"), mimeType: blob.type || "image/png" }],
      });
      if (!result.ok) throw new Error(`라이브러리에 등록하지 못했습니다(${position + 1}번째): ${"message" in result ? result.message : ""}`);
      saved = position + 1;
    }
    console.log(`  등록함: ${label} → 라이브러리 ${saved}장`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
