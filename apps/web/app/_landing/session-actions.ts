"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/**
 * 랜딩에서 바로 로그아웃한다.
 *
 * 스튜디오 안에는 로그아웃이 있었지만 첫 화면에는 없었다. 로그인한 채로 첫
 * 화면에 오면 「로그인」 버튼만 보이고, 눌러도 이미 세션이 있어 스튜디오로
 * 튕겨 들어간다 — 내가 로그인 상태인지 아닌지 알 방법이 없었다.
 *
 * **서버 액션이다.** `/auth/signout` 은 JSON 을 돌려주므로 폼으로 부르면
 * 사용자가 JSON 화면에 남는다. 자바스크립트 없이도 동작해야 하는 자리라
 * 클라이언트 컴포넌트로 만들지 않았다.
 */
export async function signOutFromLanding(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // 첫 화면으로 되돌린다. 이때는 로그아웃 상태라 「로그인」이 보인다.
  redirect("/");
}
