import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { ledgerMissing } from "./usage-row";
import { checkWithdrawal, withdrawalDone, type WithdrawalPath } from "./withdrawal";

/**
 * **본인이 계정을 닫거나 지운다**(2026-09-23 사용자 요청).
 *
 * ── 누구인지는 부르는 쪽이 정한다 ──────────────────────────
 *
 * 이 함수는 `userId` 를 받지만, **그 값은 세션에서 와야 한다.** 폼이나
 * 요청 본문에서 받은 값을 그대로 넘기면 남의 계정을 지우는 길이 된다.
 * 부르는 자리(`app/settings/actions.ts`)가 `requireActiveMember()` 로
 * 정하고 넘긴다.
 *
 * ── 두 갈래 ────────────────────────────────────────────────
 *
 * 판단은 `withdrawal.ts` 가 한다. 여기서는 **실제로 하는 일**만 한다.
 *
 *   delete → 라이브러리를 지우고 인증 계정까지 지운다
 *   close  → 라이브러리를 지우고 계정을 닫는다(돈 기록은 남긴다)
 *
 * ── 라이브러리를 먼저 지운다 ───────────────────────────────
 *
 * `library_items` 는 `profiles` 를 `on delete cascade` 로 참조하므로 행은
 * 함께 사라진다. **그런데 저장소(Storage)의 그림 파일은 안 사라진다** —
 * 표만 비고 파일은 남는다. 여기서 먼저 지운다.
 */

const BUCKET = "library";

export interface WithdrawResult {
  ok: boolean;
  message: string;
  path?: WithdrawalPath;
}

/** 이 회원의 그림 파일을 저장소에서 지운다. 경로 첫 칸이 회원 id 다. */
async function 파일을지운다(db: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const 지울것: string[] = [];
  const 훑기 = async (prefix: string, depth: number) => {
    // 끝없이 파고들지 않는다. 저장 규약은 `{user}/{종류}/{작업}/{파일}` 넷이다.
    if (depth > 4) return;
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error || !data) return;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // 파일에는 메타가 붙고 폴더에는 안 붙는다.
      if (entry.id) 지울것.push(path);
      else await 훑기(path, depth + 1);
    }
  };

  await 훑기(userId, 1);
  // 저장소는 한 번에 받는 수에 한도가 있다. 나눠 보낸다.
  for (let i = 0; i < 지울것.length; i += 100) {
    await db.storage.from(BUCKET).remove(지울것.slice(i, i + 100));
  }
}

export async function withdrawAccount(userId: string, email: string): Promise<WithdrawResult> {
  const db = createSupabaseAdminClient();

  const { data: profile, error: profileError } = await db
    .from("profiles").select("status").eq("id", userId).single();
  if (profileError || !profile) {
    return { ok: false, message: "회원 정보를 읽지 못했습니다." };
  }

  /*
    **돈 기록이 있는지 묻는다.** 없으면 지울 수 있고 있으면 닫는다.
    장부가 아직 없는 서버(202609220003 전)에서는 막을 기록도 없다.
  */
  const { data: kept, error: keptError } = await db.rpc("credit_member_has_records", { p_user: userId });
  if (keptError && !ledgerMissing(keptError)) {
    return { ok: false, message: `탈퇴 가능 여부를 확인하지 못했습니다: ${keptError.message}` };
  }

  /*
    **처리 중인 작업이 있는지 묻는다.** 「처리 중」은 `credit_grants` 의
    `reserved_units` 가 든다 — 화면이 보여 주는 그 값이다.
  */
  const { data: holds } = await db
    .from("credit_grants").select("reserved_units").eq("user_id", userId).gt("reserved_units", 0).limit(1);

  const 판단 = checkWithdrawal({
    hasMoneyRecords: kept === true,
    hasWorkInProgress: Boolean(holds?.length),
    availableCredits: 0, // 문구는 화면이 이미 보여 줬다. 여기서는 길만 고른다.
    status: profile.status as string,
  });
  if (!판단.ok) return { ok: false, message: 판단.reason };

  // 내 것이다. 어느 길로 가든 지운다.
  await 파일을지운다(db, userId);

  if (판단.path === "close") {
    const { error } = await db.rpc("member_withdraw", { p_user: userId });
    if (error) {
      // 마이그레이션 전이면 함수가 없다. 그때는 그렇다고 말한다.
      return { ok: false, message: `탈퇴하지 못했습니다: ${error.message}` };
    }
    return { ok: true, message: withdrawalDone("close"), path: "close" };
  }

  /*
    **인증 계정을 지운다.** `profiles` 는 `auth.users` 를 `on delete cascade`
    로 참조하므로 함께 사라지고, `library_items` 도 그 뒤를 따른다.
  */
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: `탈퇴하지 못했습니다: ${error.message}` };

  // 이메일은 지운 뒤에도 기록에 남기지 않는다. 받은 까닭은 확인 글자 비교뿐이다.
  void email;
  return { ok: true, message: withdrawalDone("delete"), path: "delete" };
}
