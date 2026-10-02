export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const present = (...values: Array<string | undefined>) => values.every(value => Boolean(value?.trim()));

export async function GET() {
  const membershipReady = present(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  );
  const botProtectionReady = present(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  // The shipped tools include Anthropic planning and OpenAI-backed SNS features.
  // Checking only image keys let releases with no working text planner pass.
  // This is a local configuration check; it never creates paid provider requests.
  const generationReady = present(process.env.GOOGLE_API_KEY, process.env.FAL_KEY, process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY);
  const emailReady = present(
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.SMTP_FROM,
  );
  const ready = membershipReady
    && botProtectionReady
    && generationReady
    && emailReady;

  return Response.json(
    {
      ok: ready,
      service: "mcs",
      status: ready ? "ready" : "not_ready",
      checks: {
        membership: membershipReady,
        botProtection: botProtectionReady,
        generation: generationReady,
        approvalEmail: emailReady,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
