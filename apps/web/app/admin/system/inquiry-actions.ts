"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { isInquiryStatus } from "../../../lib/cs/inquiry-store";

/**
 * **문의 처리 상태를 바꾼다**(설계 §10.1 「처리 상태: 안 봄 / 보는 중 / 끝」).
 *
 * ── 답장은 여기서 안 한다 ──────────────────────────────────
 *
 * 설계 §10.3 이 못 박았다 — 「**답장은 1차에 안 만든다.** 메일로 답한다」.
 * 그래서 이 액션이 하는 일은 하나다: 누가 보고 있고 무엇이 끝났는지 표시.
 *
 * ── 왜 관리자를 다시 보나 ──────────────────────────────────
 *
 * 서버 액션은 **주소만 알면 직접 부를 수 있다.** 화면에서 단추를 감추는
 * 것으로는 못 막는다(`actions.ts` 의 같은 판단).
 */
export async function setInquiryStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("올바르지 않은 문의입니다.");

  const status = String(formData.get("status") || "");
  if (!isInquiryStatus(status)) throw new Error("올바르지 않은 상태입니다.");

  const db = createSupabaseAdminClient();
  const { error } = await db.from("cs_inquiries").update({ status }).eq("id", id);
  if (error) throw new Error(`상태를 바꾸지 못했습니다: ${error.message}`);

  revalidatePath("/admin/system");
}
