import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretEnv } from "./secret-env";
import { assertStoragePath } from "../storage/safe-path";

let adminClient: SupabaseClient<any> | undefined;

export function createSupabaseAdminClient(): SupabaseClient<any> {
  if (!adminClient) {
    const { url, secretKey } = getSupabaseSecretEnv();
    adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
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
