import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { verifiedLogin } from "../../../lib/auth/verified-login";
import { ONBOARDING_COLUMNS } from "../../../lib/membership/onboarding";
import { isUsableAccount } from "../../../lib/membership/usable";

// 정적 랜딩(public/landing.html)이 헤더 표시를 정하려고 호출한다.
// 세션은 요청마다 다르므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    // 토큰 서명으로 확인한다 — `getUser()` 왕복 없음(설계 2026-09-29 §3.2).
    const user = await verifiedLogin(supabase.auth);

    if (!user) {
      return NextResponse.json({ authenticated: false, active: false }, { headers: noStore });
    }

    // middleware.ts 의 승인 판정과 동일한 기준을 쓴다.
    const { data: profile } = await supabase
      .from("profiles")
      .select(`status,email_confirmed_at,${ONBOARDING_COLUMNS}`)
      .eq("id", user.userId)
      .single();

    const active = isUsableAccount(profile);
    return NextResponse.json({ authenticated: true, active }, { headers: noStore });
  } catch (error) {
    console.error("세션 상태 조회 실패:", error);
    return NextResponse.json(
      { authenticated: false, active: false, code: "session_lookup_failed" },
      { status: 503, headers: noStore },
    );
  }
}
