import "server-only";

import { isLocalAuthBypass } from "../dev-auth";
import { verifiedLogin } from "../auth/verified-login";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * 지금 요청이 로그인한 회원이면 그 번호, 아니면 null. **막지 않는다** — 손님 방문도 센다.
 * 토큰 서명만 본다(서버 왕복 없음, 설계 2026-09-29 §3.2). 정지·탈퇴 여부는 통계에 상관없다.
 */
export async function currentUserId(): Promise<string | null> {
  if (isLocalAuthBypass) return null;
  try {
    const supabase = await createSupabaseServerClient();
    return (await verifiedLogin(supabase.auth))?.userId ?? null;
  } catch {
    return null;
  }
}
