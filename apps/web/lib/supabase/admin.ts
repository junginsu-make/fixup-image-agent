import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretEnv } from "./secret-env";

let adminClient: SupabaseClient<any> | undefined;

export function createSupabaseAdminClient(): SupabaseClient<any> {
  if (!adminClient) {
    const { url, secretKey } = getSupabaseSecretEnv();
    adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
