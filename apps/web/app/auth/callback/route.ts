import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { authOrigin, socialNext } from "../../../lib/auth/social-auth";
import { needsOnboarding, ONBOARDING_COLUMNS, ONBOARDING_PATH } from "../../../lib/membership/onboarding";

export async function GET(request: Request) {
  let origin: string;
  try { origin = authOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV); }
  catch { return NextResponse.json({ error: "로그인 주소 설정을 확인해야 합니다." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const send = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return send(`/login?error=${url.searchParams.get("error") === "access_denied" ? "oauth_cancelled" : "oauth_failed"}`);
  const code = url.searchParams.get("code");
  if (!code) return send("/login?error=oauth_invalid");
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return send("/login?error=oauth_invalid");
    const fail = async (reason: string) => {
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* Retry remains available. */ }
      return send(`/login?error=${reason}`);
    };
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return fail("oauth_invalid");
    if (!user.email || !user.email_confirmed_at) return fail("oauth_email_required");
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select(`status,email_confirmed_at,${ONBOARDING_COLUMNS}`).eq("id", user.id).single();
    if (profileError || !profile) return fail("profile_unavailable");
    if (profile.status !== "active" || !profile.email_confirmed_at) return send("/access");
    if (profile.onboarding_required) {
      if (process.env.CREDIT_LEDGER !== "1") return fail("credits_unavailable");
      const { data: wallet, error: walletError } = await createSupabaseAdminClient().from("credit_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
      if (walletError || !wallet) return fail("credits_unavailable");
    }
    return send(needsOnboarding(profile) ? ONBOARDING_PATH : socialNext(url.searchParams.get("next")));
  } catch { return send("/login?error=oauth_failed"); }
}
