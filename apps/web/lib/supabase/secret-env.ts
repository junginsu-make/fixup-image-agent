import "server-only";

import { getSupabasePublicEnv } from "./env";

export function getSupabaseSecretEnv() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY가 설정되지 않았습니다.");
  }
  return { url, secretKey };
}
