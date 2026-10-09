import { createSupabaseAdminClient } from "./supabase/admin";
import { gridPathsToRemove } from "./grid-thumbnail-path";
import { onlyInOwnerFolder } from "./storage/owner-folder";

/**
 * **회원이 지운 참고 이미지는 보관한다**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 줄·파일을 지우지 않고 지운 때·지운 사람만 적는다. 회원 화면과 만들기 재료에서는 사라지고(읽는 길마다
 * `deleted_at is null`, 회원 세션은 RLS 가 감춘다), 관리자가 「회원이 삭제한 자료」에서 보고 완전히 지운다.
 * 6개월이 지나면 자동으로 완전 삭제한다(3단계).
 *
 * 회원은 이 칸을 쓸 권한이 없어 서버 권한으로 쓰되, **주인·살아 있는 것만** 고른다. 고친 줄을 세어 본다 —
 * 0줄을 성공으로 읽으면 「지웠습니다」 뒤에 그대로 남는다.
 */

/** 회원이 자기 그림 한 장을 지운다. 고친 줄이 없으면(남의 것·이미 지운 것·없는 것) false. */
export async function softDeleteReferenceImage(userId: string, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await createSupabaseAdminClient().from("reference_images")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("id", id).eq("user_id", userId).is("deleted_at", null)
    .select("id");
  if (error) {
    // DB 원문(표·칸 이름)은 화면에 보내지 않는다.
    console.error("[reference] 지우기 실패", error.message);
    throw new Error("참고 이미지를 지우지 못했습니다.");
  }
  return (data ?? []).length > 0;
}

/**
 * 캐릭터를 지울 때 라이브러리에 들어간 각도 사본도 함께 보관한다. `deletedAt` 은 캐릭터에 적은 것과 **같은 값**
 * 이다 — 관리자가 그 캐릭터를 완전히 지울 때 이 값으로 그 캐릭터의 사본만 골라 지운다(같은 이름의 새 캐릭터
 * 사본을 건드리지 않게).
 */
export async function softDeleteReferenceImagesByTitle(
  userId: string,
  titles: readonly string[],
  deletedAt: string,
  /**
   * 이 때보다 **먼저 생긴** 사본만. 이미 지운 캐릭터를 다시 지울 때(처음 지운 때를 준다) — 그 사이 같은 이름으로
   * 만든 새 캐릭터의 사본을 옛 캐릭터와 함께 보관하지 않게(2026-10-08 재리뷰).
   */
  createdBefore?: string,
): Promise<void> {
  if (!titles.length) return;
  const supabase = createSupabaseAdminClient();
  /*
    **제목마다 따로 쓴다.** `in()` 은 값 안의 따옴표·역슬래시를 거르지 않아, 이름에 `"` 가 있으면 조회가
    깨진다(`referenceTitlesOf` 와 같은 이유). 각도는 많아야 일곱이다.
  */
  for (const title of titles) {
    const live = supabase.from("reference_images")
      .update({ deleted_at: deletedAt, deleted_by: userId })
      .eq("user_id", userId).eq("title", title).is("deleted_at", null);
    const { error } = await (createdBefore ? live.lt("created_at", createdBefore) : live);
    if (error) {
      console.error("[reference] 캐릭터 사본 보관 실패", error.message);
      throw new Error("캐릭터의 라이브러리 그림을 지우지 못했습니다.");
    }
  }
}

/**
 * 보관 기간(6개월)이 지난 참고 이미지를 **완전히 지운다**(3단계 자동 파기). 관리자 지우기
 * (`app/api/reference-images/[id]/route.ts`)와 같은 순서다 — 줄을 먼저, 파일·사본을 나중에. 묶음 항목은 FK 가 지운다.
 *
 * 사람이 보지 않고 도는 일이라 **줄이 정말 지워졌을 때만** 파일을 지우고, **주인 폴더 밖의 파일은 안 지운다** —
 * 회원이 경로를 직접 넣을 수 있던 때(2026-08-31~09-16)의 줄에 남의 경로가 들어 있을 수 있다(리뷰).
 */
export async function purgeReferenceImage(row: {
  id: string; owner: string; storagePath: string; thumbPath: string | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const removed = await supabase.from("reference_images")
    .delete().eq("id", row.id).not("deleted_at", "is", null).select("id");
  if (removed.error) throw new Error(removed.error.message);
  if (!(removed.data ?? []).length) return;
  const paths = onlyInOwnerFolder(gridPathsToRemove([{ path: row.storagePath, thumbPath: row.thumbPath }]), row.owner);
  if (paths.length) await supabase.storage.from("library").remove(paths);
}
