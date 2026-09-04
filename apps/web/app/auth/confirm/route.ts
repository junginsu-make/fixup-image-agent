import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { publicOrigin } from "../../../lib/routes";

/**
 * 메일의 인증 링크가 도착하는 자리.
 *
 * **되돌아갈 주소를 `request.url` 에서 뽑으면 안 된다.** standalone 을 Caddy
 * 뒤에 두면 그 값이 내부 주소(`localhost:3000`)라, 인증은 끝났는데 사용자
 * 브라우저는 열 수 없는 주소로 튕긴다. 가입한 사람 눈에는 그냥 안 되는 것으로
 * 보인다. 프록시가 알려 준 밖에서 보이는 주소를 쓴다.
 */
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
  const origin = publicOrigin(request.headers, url.origin);
  return NextResponse.redirect(new URL(error ? "/login?error=invalid_confirmation" : next, origin));
}
