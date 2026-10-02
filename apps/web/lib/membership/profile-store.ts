import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import { cleanProfileText, missingProfileColumns, PROFILE_LIMITS, profileInputError, type ProfileExtras } from "./profile-extras";
import { normalizePhone, phoneInputError } from "./phone";

/**
 * 이름·추천인 읽기. 칸이 아직 없는 서버(202609220005 전)에서는 빈 값으로 둔다 —
 * 화면이 통째로 죽는 것보다 빈 칸이 낫다.
 */
export async function readProfileExtras(ids: readonly string[]): Promise<Map<string, ProfileExtras>> {
  const result = new Map<string, ProfileExtras>();
  // 로컬 확인 모드에는 Supabase 가 없다(일부러 비워 둔다, CLAUDE.md). 빈 값으로 둔다.
  if (!ids.length || isLocalStoreEnabled()) return result;
  const db = createSupabaseAdminClient();
  const withPhone = await db.from("profiles").select("id,display_name,referrer_input,phone").in("id", [...ids]);
  // 전화번호 칸(202610020001)이 아직 없는 서버면 이름·추천인만 다시 읽는다.
  const { data, error } = withPhone.error && missingProfileColumns(withPhone.error)
    ? await db.from("profiles").select("id,display_name,referrer_input").in("id", [...ids])
    : withPhone;
  if (error) {
    if (missingProfileColumns(error)) return result;
    throw new Error(`회원 정보를 읽지 못했습니다: ${error.message}`);
  }
  for (const row of (data ?? []) as { id: string; display_name: string | null; referrer_input: string | null; phone?: string | null }[]) {
    result.set(row.id, { displayName: row.display_name, referrer: row.referrer_input, phone: row.phone ?? null });
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

/**
 * 전화번호(선택) 고치기. **누구의 것인지는 부르는 쪽이 이미 확인했다**(위와 같다).
 *
 * - 회원: 동의와 함께 적으면 저장하고 동의 시각을 새로 남긴다. 비우면 번호와 동의 기록을
 *   함께 지운다(동의 철회).
 * - 관리자: **이미 동의한 번호만** 고치거나 지운다. 동의한 적 없는 회원에게 번호를 넣으면
 *   선택 동의 없는 수집이 된다(DB 제약 `profiles_phone_valid` 도 막는다).
 */
export async function updateProfilePhone(userId: string, input: { phone: string; consent: boolean; expected?: string | null }, actor: "member" | "admin"): Promise<{ ok: boolean; message: string }> {
  const phone = String(input?.phone ?? "");
  const clearing = !phone.trim();
  // 형식부터 본다. 동의는 번호가 바뀔 때만 묻는다(아래).
  const formatProblem = clearing ? null : phoneInputError(phone, true);
  if (formatProblem) return { ok: false, message: formatProblem };
  if (isLocalStoreEnabled()) return { ok: false, message: "로컬 확인 모드에는 회원 저장소가 없습니다." };
  const db = createSupabaseAdminClient();
  const { data, error: readError } = await db.from("profiles").select("phone,phone_consented_at").eq("id", userId).maybeSingle();
  if (readError) return phoneSaveFailure(readError);
  const saved = data as { phone: string | null; phone_consented_at: string | null } | null;
  // 이름만 고쳐 저장해도 번호가 함께 온다. 같으면 쓰지 않는다 — 동의 시각을 새로 찍지 않는다.
  if ((clearing ? null : normalizePhone(phone)) === (saved?.phone ?? null)) return { ok: true, message: "저장했습니다." };
  if (actor === "member" && !clearing) {
    const consentProblem = phoneInputError(phone, input?.consent === true);
    if (consentProblem) return { ok: false, message: consentProblem };
  }
  // 관리자 화면을 연 사이 회원이 번호를 바꿨으면 보던 값으로 덮지 않는다(독립 리뷰 M2).
  if (actor === "admin" && (input?.expected ?? null) !== (saved?.phone ?? null)) {
    return { ok: false, message: "그 사이 회원이 전화번호를 바꿨습니다. 새로고침한 뒤 다시 확인해 주세요." };
  }
  if (actor === "admin" && !clearing && !saved?.phone_consented_at) {
    return { ok: false, message: "전화번호는 회원이 직접 입력하고 동의해야 저장할 수 있습니다. 관리자는 이미 동의한 번호만 고칠 수 있습니다." };
  }
  const now = new Date().toISOString();
  const values = clearing
    ? { phone: null, phone_consented_at: null, updated_at: now }
    : actor === "member"
      ? { phone: normalizePhone(phone), phone_consented_at: now, updated_at: now }
      : { phone: normalizePhone(phone), updated_at: now };
  const { error } = await db.from("profiles").update(values).eq("id", userId);
  if (error) return phoneSaveFailure(error);
  return { ok: true, message: clearing ? "전화번호를 지웠습니다." : "전화번호를 저장했습니다." };
}

function phoneSaveFailure(error: { code?: string; message?: string }): { ok: false; message: string } {
  if (missingProfileColumns(error)) {
    console.error("[profile] 전화번호 칸이 없습니다. 마이그레이션 202610020001 을 실행하세요.");
    return { ok: false, message: "지금은 전화번호를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  }
  // 오류 객체 통째로 남기지 않는다 — 제약 위반의 details 에 회원 행 전체가 실린다(독립 리뷰 L2).
  console.error("[profile] 전화번호 저장 실패", error.code, error.message);
  return { ok: false, message: "전화번호를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
