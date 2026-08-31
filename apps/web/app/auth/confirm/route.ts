import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = url.searchParams.get("next") || "/access";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/access";
  const supabase = await createSupabaseServerClient();
  let error: unknown;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = new Error("missing token");
  return NextResponse.redirect(new URL(error ? "/login?error=invalid_confirmation" : next, url.origin));
}
