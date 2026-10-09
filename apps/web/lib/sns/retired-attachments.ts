import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **회원이 지운 그림의 첨부 위치**(2026-10-08 코드 리뷰 — 계획 2단계).
 *
 * 카드뉴스 첨부는 참고 이미지 id 가 아니라 **저장 위치**로 적힌다(`refreshProjectAssetUrls`). 예전에는 회원이 그림을
 * 지우면 파일도 지워져 서명이 실패했고 「쓸 수 없는 첨부」로 막혔다. 이제 파일이 남으므로 이 위치들을 회원이 지운
 * 참고 이미지·라이브러리 결과물과 대조해, 걸린 것은 서명하지 않는다 — 지우던 때와 같은 결과다.
 *
 * **확인을 못 하면 모두 쓸 수 없는 것으로 본다** — 지운 그림을 생성 재료로 보내는 쪽으로 틀리지 않는다.
 */
const SAFE_PATH = /^[A-Za-z0-9/_.-]+$/;

export async function retiredAttachmentPaths(userId: string, paths: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(paths)];
  // `in()` 은 값 안의 따옴표·쉼표를 거르지 않는다 — 그런 위치는 묻지 않고 쓸 수 없는 것으로 본다.
  const odd = unique.filter((path) => !SAFE_PATH.test(path));
  const asked = unique.filter((path) => SAFE_PATH.test(path));
  if (!asked.length) return new Set(odd);
  try {
    const supabase = createSupabaseAdminClient();
    const [references, images] = await Promise.all([
      supabase.from("reference_images").select("storage_path")
        .eq("user_id", userId).in("storage_path", asked).not("deleted_at", "is", null),
      supabase.from("library_images").select("path,item_id").eq("user_id", userId).in("path", asked),
    ]);
    if (references.error) throw new Error(references.error.message);
    if (images.error) throw new Error(images.error.message);
    const imageRows = (images.data ?? []) as Array<{ path: string; item_id: string }>;
    const itemIds = [...new Set(imageRows.map((row) => row.item_id))];
    const gone = itemIds.length
      ? await supabase.from("library_items").select("id").in("id", itemIds).not("deleted_at", "is", null)
      : { data: [], error: null };
    if (gone.error) throw new Error(gone.error.message);
    const goneItems = new Set(((gone.data ?? []) as Array<{ id: string }>).map((row) => row.id));
    return new Set([
      ...odd,
      ...((references.data ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path),
      ...imageRows.filter((row) => goneItems.has(row.item_id)).map((row) => row.path),
    ]);
  } catch (error) {
    console.error("[sns] 지운 첨부를 확인하지 못했습니다", error instanceof Error ? error.message : error);
    return new Set(unique);
  }
}
