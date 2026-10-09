import { CHARACTER_ANGLES, CHARACTER_SHEET } from "@fixup/pdp-core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { characterReferenceTitle } from "./character-library";
import { softDeleteReferenceImagesByTitle } from "./reference-soft-delete";

/**
 * **회원이 지운 캐릭터는 보관한다**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 캐릭터 줄·각도 줄·그림 파일을 지우지 않고 지운 때·지운 사람만 적는다. 라이브러리에 들어간 각도 사본도 **같은
 * 때**로 보관한다 — 관리자가 그 캐릭터를 완전히 지울 때 이 값으로 그 캐릭터의 사본만 골라 지운다
 * (`deleteCharacter`). 회원 화면·만들기 재료에서는 사라지고(읽는 길마다 `deleted_at is null`), 관리자가
 * 「회원이 삭제한 자료」에서 보고 완전히 지운다. 6개월 뒤 자동 파기(3단계).
 *
 * 회원은 이 칸을 쓸 권한이 없어 서버 권한으로 쓰되, **주인·살아 있는 것만** 고른다. 고친 줄을 세어 본다.
 *
 * **다시 불러도 된다.** 사본을 보관하다 중간에 실패하면 500 이 나가고, 다시 누르면 캐릭터는 이미 지운 상태다.
 * 그때 404 로 끝내면 남은 사본이 회원 화면에 영영 남는다(2026-10-08 리뷰) — 처음 지운 때로 사본 보관을 마저 한다.
 */
export async function softDeleteCharacter(
  userId: string,
  characterId: string,
): Promise<{ ok: true } | { ok: false; notFound?: true; message: string }> {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("characters")
    .update({ deleted_at: now, deleted_by: userId })
    .eq("id", characterId).eq("user_id", userId).is("deleted_at", null)
    .select("id,name,deleted_at");
  if (error) return failed(error.message);

  let row = ((data ?? []) as Array<{ name: string | null; deleted_at: string }>)[0];
  let retry = false;
  if (!row) {
    // 이미 지운 내 캐릭터인가 — 그렇다면 처음 지운 때로 사본 보관을 마저 한다.
    const earlier = await supabase.from("characters").select("id,name,deleted_at")
      .eq("id", characterId).eq("user_id", userId).not("deleted_at", "is", null);
    if (earlier.error) return failed(earlier.error.message);
    row = ((earlier.data ?? []) as Array<{ name: string | null; deleted_at: string }>)[0];
    if (!row) return { ok: false, notFound: true, message: "캐릭터를 찾지 못했습니다." };
    retry = true;
  }

  // 다각도 한 장도 라이브러리에 한 줄로 들어가 있다 — 각도와 함께 보관한다(`deleteCharacter` 와 같은 목록).
  const titles = [...CHARACTER_ANGLES.map((angle) => angle.id as string), CHARACTER_SHEET.id]
    .map((angle) => characterReferenceTitle(String(row.name ?? ""), angle));
  // 다시 지울 때는 처음 지운 때보다 먼저 생긴 사본만 — 그 사이 같은 이름으로 만든 새 캐릭터 사본은 그대로 둔다.
  await softDeleteReferenceImagesByTitle(userId, titles, row.deleted_at, retry ? row.deleted_at : undefined);
  return { ok: true };
}

function failed(message: string) {
  // DB 원문(표·칸 이름)은 화면에 보내지 않는다.
  console.error("[characters:delete]", message);
  return { ok: false as const, message: "삭제하지 못했습니다." };
}
