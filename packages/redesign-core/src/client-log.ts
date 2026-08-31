/**
 * Ported from `.refs/redesign-maker-10/src/app/api/client-log/route.ts` (POST).
 * Logs a sanitized telemetry event; never throws to the caller.
 *
 * Original route runtime config (re-declare on the adapter):
 *   export const runtime = "nodejs";
 *
 * Original always returned 200:
 *   - success -> { ok: true }
 *   - failure -> { ok: false } (logged a warning, swallowed the error)
 * This function mirrors that: it returns { ok: true } / { ok: false } and
 * never throws, so the adapter can always respond 200.
 *
 * Secret-stripping (`sanitizePayload`) is byte-for-byte identical.
 */
export type LogClientEventInput = {
  event?: unknown;
  payload?: unknown;
};

export function logClientEvent(input: LogClientEventInput) {
  try {
    const event = String(input.event || "client:event").slice(0, 120);
    const payload = sanitizePayload(input.payload);
    console.info(`[client] ${event}`, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    console.warn("[client] log failed", error instanceof Error ? error.message : "unknown");
    return { ok: false };
  }
}

function sanitizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const blocked = new Set(["openaiKey", "googleKey", "apiKey", "knowledgeAccessKey", "knowledgeAdminKey", "imageUrl"]);
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>)
      .filter(([key]) => !blocked.has(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 300) : value])
  );
}
