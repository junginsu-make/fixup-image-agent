import { canonicalOrigin } from "./routes";

/** Presence only; does not claim that provider authentication succeeds. */
export function configurationHealth() {
  let siteOrigin = false;
  try { canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL); siteOrigin = true; } catch { /* closed */ }
  const present = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));
  const checks = {
    siteOrigin,
    membership: present("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"),
    botProtection: present("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    planningPrimary: present("ANTHROPIC_API_KEY"),
    planningFallback: present("OPENAI_API_KEY"),
    imageGeneration: present("GOOGLE_API_KEY", "FAL_KEY"),
    approvalEmail: present("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"),
  };
  return { ok: Object.values(checks).every(Boolean), checks, providerAuthenticationVerified: false };
}
