"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sessionAuthCookieNames } from "../../lib/auth/session-window";
import { requireActiveMember } from "../../lib/membership/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { updateProfileExtras, updateProfilePhone } from "../../lib/membership/profile-store";
import { normalizePhone, phoneInputError } from "../../lib/membership/phone";
import { withdrawAccount } from "../../lib/membership/withdraw-account";
import { confirmsWithdrawal } from "../../lib/membership/withdrawal";

/**
 * 내 이름·추천인·전화번호(선택) 고치기.
 *
 * **대상은 로그인한 본인뿐이다.** 폼에서 회원 ID 를 받지 않는다 — 받으면 남의 ID 를
 * 적어 보내는 것으로 남의 이름을 바꿀 수 있다.
 */
export async function updateMyProfile(input: { name: string; referrer: string; phone?: string; phoneConsent?: boolean }): Promise<{ ok: boolean; message: string }> {
  const member = await requireActiveMember();
  const phone = input?.phone === undefined ? undefined : String(input.phone);
  // 번호 형식부터 본다 — 이름만 저장되고 번호가 거절되는 일을 줄인다. 동의는 번호가 바뀔 때 저장소가 묻는다.
  if (phone?.trim() && !normalizePhone(phone)) return { ok: false, message: phoneInputError(phone, true) ?? "전화번호를 확인해 주세요." };
  const result = await updateProfileExtras(member.user.id, { name: String(input?.name ?? ""), referrer: String(input?.referrer ?? "") });
  if (!result.ok) return result;
  if (phone !== undefined) {
    const saved = await updateProfilePhone(member.user.id, { phone, consent: input?.phoneConsent === true }, "member");
    if (!saved.ok) {
      revalidatePath("/settings");
      return { ok: false, message: `이름·추천코드는 저장했습니다. ${saved.message}` };
    }
  }
  revalidatePath("/settings");
  return result;
}

/**
 * **내 계정을 닫거나 지운다**(2026-09-23 사용자 요청).
 *
 * 「모든 사용자는 계정(개인페이지)에서 탈퇴 할 수 있어야 합니다.」
 *
 * **대상은 로그인한 본인뿐이다.** 위 `updateMyProfile` 과 같은 규칙이다 —
 * 폼에서 회원 ID 를 받지 않는다. 받으면 남의 ID 를 적어 보내는 것으로 **남의
 * 계정을 지울 수 있다.**
 *
 * **이메일을 그대로 치게 한다.** 관리자가 회원을 지울 때 이미 그렇게 한다.
 * 같은 무게의 일이니 같은 문턱을 둔다.
 */
export async function withdrawMyAccount(input: { confirmEmail: string }): Promise<{ ok: boolean; message: string }> {
  const member = await requireActiveMember();

  if (!confirmsWithdrawal(input?.confirmEmail, member.profile.email)) {
    return { ok: false, message: "확인을 위해 계정 이메일을 그대로 입력해 주세요." };
  }

  const result = await withdrawAccount(member.user.id, member.profile.email);
  if (result.ok) {
    revalidatePath("/settings");
    await endThisBrowserSession();
  }
  return { ok: result.ok, message: result.message };
}

/**
 * **탈퇴가 끝나면 이 브라우저의 로그인도 끝낸다**(2026-09-29).
 *
 * 전에는 계정만 처리하고 로그인 쿠키를 두었다. 기록이 있어 「닫힌」 계정은
 * 인증 계정이 남으므로, 로그인 화면이 「이미 로그인되어 있습니다」를 띄웠다.
 *
 * 두 겹으로 끝낸다 — 서버 쪽 로그인을 끊고(다른 기기의 갱신 토큰까지),
 * **이 브라우저의 로그인 쿠키를 직접 지운다.** 서버 쪽 요청이 실패해도 쿠키는
 * 지운다. 계정은 이미 처리됐으므로 여기서의 실패를 탈퇴 실패라 하지 않는다.
 */
async function endThisBrowserSession() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // 아래에서 쿠키를 지운다. 탈퇴 결과는 바꾸지 않는다.
  }

  const store = await cookies();
  for (const name of sessionAuthCookieNames(store.getAll().map((cookie) => cookie.name))) {
    store.delete(name);
  }
}
