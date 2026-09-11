/** Report-only until the production Auth, inline-script and image flows are verified. */
export function cspReportPolicy(nonce: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const origins: string[] = [];
  try {
    const url = new URL(supabaseUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) origins.push(url.origin);
  } catch { /* no broad fallback */ }
  const storage = origins.join(" ");
  const sockets = origins.map(origin => origin.replace("https:", "wss:")).join(" ");
  return [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
    `img-src 'self' data: blob: ${storage}`,
    "media-src 'self' blob:", `connect-src 'self' ${storage} ${sockets} https://challenges.cloudflare.com`,
    "frame-src 'self' https://challenges.cloudflare.com", "worker-src 'self' blob:",
    "report-uri /api/security/csp-report",
  ].join("; ");
}

/** Never persist document URLs, query strings, cookies, samples or arbitrary report fields. */
export function sanitizedCspReport(value: unknown): { directive: string; blocked: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const body = (raw["csp-report"] ?? raw.body ?? raw) as Record<string, unknown>;
  if (!body || typeof body !== "object") return null;
  const directive = body["effective-directive"] ?? body.effectiveDirective;
  if (typeof directive !== "string" || !/^[a-z-]{1,64}$/.test(directive)) return null;
  const source = body["blocked-uri"] ?? body.blockedURL;
  let blocked = "other";
  if (typeof source === "string") {
    if (["inline", "eval", "data", "blob"].includes(source)) blocked = source;
    else try { const url = new URL(source); if (["https:", "http:", "wss:"].includes(url.protocol)) blocked = url.origin; } catch { /* omit */ }
  }
  return { directive, blocked };
}
