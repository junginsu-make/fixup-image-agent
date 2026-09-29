import { cookies } from "next/headers";
import { SESSION_START_COOKIE } from "../../../lib/auth/session-window";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // 로그인 시각 쿠키도 지운다 — 까닭은 `__tests__/route.test.ts` 머리에 있다.
  (await cookies()).delete(SESSION_START_COOKIE);
  return Response.json({ ok: true });
}
