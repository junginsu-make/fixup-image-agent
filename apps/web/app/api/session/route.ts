import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

// 정적 랜딩(public/landing.html)이 헤더 표시를 정하려고 호출한다.
// 세션은 요청마다 다르므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false, active: false }, { headers: noStore });
    }

    // middleware.ts 의 승인 판정과 동일한 기준을 쓴다.
    const { data: profile } = await supabase
      .from("profiles")
      .select("status,email_confirmed_at")
      .eq("id", user.id)
      .single();

    const active = Boolean(profile?.email_confirmed_at && profile?.status === "active");
    return NextResponse.json({ authenticated: true, active }, { headers: noStore });
  } catch (error) {
    console.error("세션 상태 조회 실패:", error);
    return NextResponse.json(
      { authenticated: false, active: false, code: "session_lookup_failed" },
      { status: 503, headers: noStore },
    );
  }
}
