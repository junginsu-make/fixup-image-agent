"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember } from "../../lib/membership/server";
import { updateProfileExtras } from "../../lib/membership/profile-store";

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
