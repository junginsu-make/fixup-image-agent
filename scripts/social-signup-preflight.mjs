// Read-only. Run with node --env-file=<protected-env-file> scripts/social-signup-preflight.mjs.
// Never prints credentials, URLs, member records or raw provider responses.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !publicKey) {
  console.log(JSON.stringify({ configured: false, missing: ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].filter(name => !process.env[name]) }));
  process.exitCode = 1;
} else {
  async function get(path, secret = true) {
    const apiKey = secret ? key : publicKey;
    try {
      const response = await fetch(new URL(path, url), { headers: { apikey: apiKey, ...(apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${apiKey}` } : {}) }, signal: AbortSignal.timeout(10000) });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
    } catch { return { ok: false, status: null, body: null }; }
  }
  const [auth, profile, accounts, rpc] = await Promise.all([
    get('/auth/v1/settings', false),
    get('/rest/v1/profiles?select=signup_provider,onboarding_required,onboarding_completed_at&limit=0'),
    get('/rest/v1/credit_accounts?select=user_id&limit=0'),
    get('/rest/v1/'),
  ]);
  console.log(JSON.stringify({
    configured: true,
    input_environment: { ledger_enabled: process.env.CREDIT_LEDGER === '1', google_button: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === '1', kakao_button: process.env.NEXT_PUBLIC_AUTH_KAKAO_ENABLED === '1' },
    auth: { readable: auth.ok, google_enabled: auth.body?.external?.google ?? null, kakao_enabled: auth.body?.external?.kakao ?? null },
    database: { onboarding_columns: profile.ok, credit_accounts: accounts.ok, completion_rpc: rpc.ok ? Boolean(rpc.body?.paths?.['/rpc/complete_social_onboarding']) : null },
    limitation: 'Does not verify deployed app flags, trigger bodies, RLS or real OAuth. Use the deployment checklist.',
  }, null, 2));
}
