import { boundedJson } from "../../../../lib/generation/request-body";
import { sanitizedCspReport } from "../../../../lib/security/csp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let windowStart = 0;
let count = 0;
export async function POST(request: Request) {
  const now = Date.now();
  if (now - windowStart >= 60000) { windowStart = now; count = 0; }
  // A single global bound also prevents spoofed client addresses from growing a map.
  if (++count > 60) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  try {
    const input = await boundedJson(request, 16384);
    for (const raw of (Array.isArray(input) ? input.slice(0, 5) : [input])) {
      const report = sanitizedCspReport(raw);
      if (report) console.info("[csp-report]", JSON.stringify(report));
    }
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 400 }); }
}
