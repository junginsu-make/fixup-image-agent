import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretEnv } from "./secret-env";
import { assertStoragePath } from "../storage/safe-path";
import { generationFence } from "../generation/fence-context";
import { boundedExecutorDatabaseFetch } from "../generation/deadline";

let adminClient: SupabaseClient<any> | undefined;

export function createSupabaseAdminClient(): SupabaseClient<any> {
  if (!adminClient) {
    const { url, secretKey } = getSupabaseSecretEnv();
    adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const fence = generationFence();
        if (!fence || target.origin !== new URL(url).origin || !target.pathname.startsWith("/rest/v1/")) return boundedExecutorDatabaseFetch(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("x-generation-run", fence.id); headers.set("x-generation-lease", fence.lease_token ?? "");
        return boundedExecutorDatabaseFetch(input, { ...init, headers });
      } },
    });
    // All privileged Storage calls share a canonical key check. A user-owned
    // metadata row must not turn ../ into access to another private bucket.
    const from = adminClient.storage.from.bind(adminClient.storage);
    adminClient.storage.from = (bucket: string) => new Proxy(from(bucket), {
      get(target, property) {
        const value = Reflect.get(target, property);
        if(typeof value!=="function")return value;
        return (...args: unknown[]) => {
          if(["download","upload","update","createSignedUrl","createSignedUploadUrl","uploadToSignedUrl","getPublicUrl"].includes(String(property)))assertStoragePath(args[0]);
          if(["move","copy"].includes(String(property))){assertStoragePath(args[0]);assertStoragePath(args[1]);}
          if(["remove","createSignedUrls"].includes(String(property))){if(!Array.isArray(args[0]))throw new Error("invalid_storage_paths");args[0].forEach(p=>assertStoragePath(p));}
          if(property==="list"&&args[0]!==undefined)assertStoragePath(args[0],true);
          return Reflect.apply(value,target,args);
        };
      },
    });
  }
  return adminClient;
}
