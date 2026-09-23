"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "../../lib/membership/server";
import { updateProfileExtras } from "../../lib/membership/profile-store";
import { withdrawAccount } from "../../lib/membership/withdraw-account";
import { confirmsWithdrawal } from "../../lib/membership/withdrawal";

/**
 * 내 이름·추천인 고치기.
 *
 * **대상은 로그인한 본인뿐이다.** 폼에서 회원 ID 를 받지 않는다 — 받으면 남의 ID 를
 * 적어 보내는 것으로 남의 이름을 바꿀 수 있다.
 */
export async function updateMyProfile(input: { name: string; referrer: string }): Promise<{ ok: boolean; message: string }> {
  const member = await requireActiveMember();
  const result = await updateProfileExtras(member.user.id, { name: String(input?.name ?? ""), referrer: String(input?.referrer ?? "") });
  if (result.ok) revalidatePath("/settings");
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
  if (result.ok) revalidatePath("/settings");
  return { ok: result.ok, message: result.message };
}
