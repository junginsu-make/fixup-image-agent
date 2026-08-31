"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient() {
  if (!client) {
    const { url, publishableKey } = getSupabasePublicEnv();
    client = createBrowserClient(url, publishableKey);
  }
  return client;
}
