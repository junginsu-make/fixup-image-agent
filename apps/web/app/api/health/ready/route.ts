export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const membershipReady = Boolean(
    process.env.NEXT_PUBLIC_SITE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    && process.env.SUPABASE_SECRET_KEY,
  );
  const botProtectionReady = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );
  // 상세페이지 이미지는 fal 로 만든다. GOOGLE_API_KEY 만 보면 FAL_KEY 가 빠져도
  // "준비됨"이 나오는데, 그 상태로는 이미지가 한 장도 안 만들어진다.
  const generationReady = Boolean(process.env.GOOGLE_API_KEY && process.env.FAL_KEY);
  const emailReady = Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && process.env.SMTP_FROM,
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
