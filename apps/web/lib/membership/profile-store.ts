import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { cleanProfileText, missingProfileColumns, PROFILE_LIMITS, profileInputError, type ProfileExtras } from "./profile-extras";

/**
 * 이름·추천인 읽기. 칸이 아직 없는 서버(202609220005 전)에서는 빈 값으로 둔다 —
 * 화면이 통째로 죽는 것보다 빈 칸이 낫다.
 */
export async function readProfileExtras(ids: readonly string[]): Promise<Map<string, ProfileExtras>> {
  const result = new Map<string, ProfileExtras>();
  // 로컬 확인 모드에는 Supabase 가 없다(일부러 비워 둔다, CLAUDE.md). 빈 값으로 둔다.
  if (!ids.length || isLocalStoreEnabled()) return result;
  const { data, error } = await createSupabaseAdminClient()
    .from("profiles").select("id,display_name,referrer_input").in("id", [...ids]);
  if (error) {
    if (missingProfileColumns(error)) return result;
    throw new Error(`회원 정보를 읽지 못했습니다: ${error.message}`);
  }
  for (const row of (data ?? []) as { id: string; display_name: string | null; referrer_input: string | null }[]) {
    result.set(row.id, { displayName: row.display_name, referrer: row.referrer_input });
  }
  return result;
}

/**
 * 이름·추천인 고치기. **누구의 것인지는 부르는 쪽이 이미 확인했다** — 계정 화면은
 * 로그인한 본인, 관리자 화면은 `requireAdminFor` 를 거친 대상이다.
 *
 * 브라우저는 `profiles` 를 고칠 권한이 없다(읽기만, 그것도 제 것만). 그래서 서버의 관리
 * 키로 쓴다. 이름·추천인 두 칸만 쓴다 — 역할·상태 같은 칸이 섞여 들어갈 길을 안 둔다.
 */
export async function updateProfileExtras(userId: string, input: { name: string; referrer: string }): Promise<{ ok: boolean; message: string }> {
  const problem = profileInputError(input);
  if (problem) return { ok: false, message: problem };
  if (isLocalStoreEnabled()) return { ok: false, message: "로컬 확인 모드에는 회원 저장소가 없습니다." };
  const { error } = await createSupabaseAdminClient().from("profiles").update({
    display_name: cleanProfileText(input.name, PROFILE_LIMITS.name),
    referrer_input: cleanProfileText(input.referrer, PROFILE_LIMITS.referrer),
    updated_at: new Date().toISOString(),
  }).eq("id", userId);
  if (error) {
    if (missingProfileColumns(error)) {
      // 회원에게 마이그레이션 파일 이름을 보이지 않는다. 운영자는 서버 기록에서 본다.
      console.error("[profile] 이름·추천인 칸이 없습니다. 마이그레이션 202609220005 를 실행하세요.");
      return { ok: false, message: "지금은 저장할 수 없습니다. 잠시 후 다시 시도해 주세요." };
    }
    console.error("[profile] 저장 실패", error);
    return { ok: false, message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true, message: "저장했습니다." };
}
