"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkFalKey } from "../../../lib/fal/http";
import { refreshFalPool } from "../../../lib/fal/pool/default";
import { lastFourOf, normalizeFalKey, openFalKey, readMasterKey, sealFalKey } from "../../../lib/fal/pool/key-crypto";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { failureUrl } from "../../../lib/teams/failure";

/**
 * **관리자 화면 「fal 계정」의 문**(보충 2026-10-01).
 *
 * - 관리자 두 명 모두(`requireAdmin`, DB 함수도 `credit_require_admin` 으로 다시 본다). 서버 액션은 주소만 알면
 *   직접 부를 수 있다
 * - 키 원문은 **이 함수 안에서만** 산다: 다듬기 → fal 에 무료로 한 번 물어 확인 → 계정 id 를 추가 인증 데이터로
 *   잠가 DB 로. 화면·기록·오류 문구로 되돌아가지 않는다
 * - 던지지 않는다 — 실패는 `?error=` 로(`ai-control-actions.ts` 와 같은 판단)
 * - 바꾼 뒤 `refreshFalPool()` — 같은 프로세스의 생성이 다음 제출부터 새 목록을 쓴다
 */

const BACK = "/admin/system";

const NameSchema = z.string().trim().min(1).max(80);
const LimitSchema = z.coerce.number().int().min(1).max(200);
const IdSchema = z.string().uuid();

function failed(message: string): void {
  revalidatePath(BACK);
  redirect(failureUrl(BACK, message));
}

function done(notice: string): void {
  refreshFalPool();
  revalidatePath(BACK);
  redirect(`${BACK}?notice=${notice}`);
}

/** DB 오류를 사람 말로. 표·제약 이름은 화면에 내지 않는다. */
function dbFailure(error: { message: string; code?: string }): string {
  if (error.message.includes("fal_account_in_flight")) {
    return "진행 중인 생성이 끝난 뒤에 할 수 있습니다. 먼저 「사용」을 끄고, 진행 중이 0 이 되면 다시 눌러 주세요.";
  }
  if (error.message.includes("fal_accounts_name_live") || error.code === "23505") return "같은 이름의 계정이 이미 있습니다.";
  if (error.message.includes("credit_admin_required")) return "관리자만 바꿀 수 있습니다.";
  if (error.message.includes("fal_account_not_found")) return "이 계정을 찾지 못했습니다. 새로고침해 주세요.";
  console.error("[fal-pool] 관리자 변경 실패", { message: error.message });
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 서버 열쇠. 없거나 값이 틀리면 등록·키 바꾸기·다시 확인을 하지 않는다(잠그거나 풀 수 없다).
 *
 * `purpose`로 문구를 가른다 — 다시 확인은 아무것도 저장하지 않으니 「저장할 수 없다」라고 하면
 * 틀린 말이 된다.
 */
function masterKeyOrFail(purpose: "저장" | "다시 확인"): Buffer | null {
  const master = readMasterKey(process.env.FAL_KEY_ENCRYPTION_SECRET);
  if (master.ok) return master.key;
  const cause = master.reason === "missing"
    ? "서버 열쇠(FAL_KEY_ENCRYPTION_SECRET)가 없습니다."
    : "서버 열쇠(FAL_KEY_ENCRYPTION_SECRET) 값이 올바르지 않습니다.";
  failed(`${cause} ${purpose}할 수 없으니 운영 설정을 확인해 주세요.`);
  return null;
}

/** 붙여 넣은 키를 다듬고 fal 에 한 번 물어 본다. 통과하면 다듬은 키, 아니면 null(이미 돌려보냄). */
async function verifiedKeyOrFail(raw: FormDataEntryValue | null): Promise<string | null> {
  const key = normalizeFalKey(String(raw ?? ""));
  if (!key) {
    failed("키 모양이 올바르지 않습니다. fal 에서 복사한 키를 그대로 붙여 넣어 주세요.");
    return null;
  }
  const check = await checkFalKey(key);
  if (check.ok) return key;
  failed(check.reason === "invalid"
    ? `fal 이 이 키를 거절했습니다(${check.status ?? "?"}). 키를 다시 확인해 주세요.`
    : "지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  return null;
}

export async function addFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const name = NameSchema.safeParse(formData.get("name"));
  const limit = LimitSchema.safeParse(formData.get("limit") || 20);
  if (!name.success) return failed("이름을 1~80자로 넣어 주세요.");
  if (!limit.success) return failed("동시 한도는 1~200 사이로 넣어 주세요.");
  const master = masterKeyOrFail("저장");
  if (!master) return;
  const key = await verifiedKeyOrFail(formData.get("key"));
  if (!key) return;

  const id = randomUUID();
  const sealed = sealFalKey(master, id, key);
  const { error } = await createSupabaseAdminClient().rpc("fal_account_add", {
    p_actor: membership.user.id,
    p_id: id,
    p_name: name.data,
    p_ciphertext: sealed.ciphertext,
    p_iv: sealed.iv,
    p_tag: sealed.tag,
    p_last4: lastFourOf(key),
    p_limit: limit.data,
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_added");
}

export async function updateFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  const name = NameSchema.safeParse(formData.get("name"));
  const limit = LimitSchema.safeParse(formData.get("limit"));
  const enabled = formData.get("enabled");
  if (!id.success || (enabled !== "1" && enabled !== "0")) return failed("올바르지 않은 값입니다.");
  if (!name.success) return failed("이름을 1~80자로 넣어 주세요.");
  if (!limit.success) return failed("동시 한도는 1~200 사이로 넣어 주세요.");

  const { error } = await createSupabaseAdminClient().rpc("fal_account_update", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_name: name.data,
    p_limit: limit.data,
    p_enabled: enabled === "1",
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_saved");
}

export async function replaceFalKeyAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const master = masterKeyOrFail("저장");
  if (!master) return;
  const key = await verifiedKeyOrFail(formData.get("key"));
  if (!key) return;

  const sealed = sealFalKey(master, id.data, key);
  const { error } = await createSupabaseAdminClient().rpc("fal_account_set_key", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_ciphertext: sealed.ciphertext,
    p_iv: sealed.iv,
    p_tag: sealed.tag,
    p_last4: lastFourOf(key),
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_key");
}

/** 「다시 확인」 — 잔액을 채웠거나 fal 쪽 문제가 풀렸을 때. 저장된 키를 풀어 fal 에 무료로 한 번 묻는다. */
export async function recheckFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const master = masterKeyOrFail("다시 확인");
  if (!master) return;

  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin
    .from("fal_accounts")
    .select("key_ciphertext,key_iv,key_tag")
    .eq("id", id.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !data) return failed("이 계정을 찾지 못했습니다. 새로고침해 주세요.");

  let key: string;
  try {
    const row = data as { key_ciphertext: string; key_iv: string; key_tag: string };
    key = openFalKey(master, id.data, { ciphertext: row.key_ciphertext, iv: row.key_iv, tag: row.key_tag });
  } catch {
    return failed("서버 열쇠로 이 키를 풀 수 없습니다. 「키 바꾸기」로 키를 다시 넣어 주세요.");
  }

  const check = await checkFalKey(key);
  if (!check.ok && check.reason === "unavailable") return failed("지금 fal 에 키를 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
  const { error } = await admin.rpc("fal_account_recheck", {
    p_actor: membership.user.id,
    p_id: id.data,
    p_ok: check.ok,
    p_detail: check.ok ? null : check.detail,
  });
  if (error) return failed(dbFailure(error));
  if (!check.ok) {
    /*
      DB 는 이미 이 계정을 `invalid` 로 적었다 — 라우터가 최대 30초 뒤에나 그 상태를 다시 읽기 전에
      곧바로 이 계정을 그만 쓰게 한다(같은 프로세스).
    */
    refreshFalPool();
    return failed(`fal 이 이 키를 거절했습니다(${check.status ?? "?"}). 「키 바꾸기」로 새 키를 넣어 주세요.`);
  }
  done("fal_account_checked");
}

export async function deleteFalAccountAction(formData: FormData) {
  const membership = await requireAdmin();
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return failed("올바르지 않은 값입니다.");
  const { error } = await createSupabaseAdminClient().rpc("fal_account_delete", {
    p_actor: membership.user.id,
    p_id: id.data,
  });
  if (error) return failed(dbFailure(error));
  done("fal_account_deleted");
}
