/** Enforce the byte cap while reading, including requests without Content-Length. */
export async function boundedBytes(request: Request, maximumBytes: number): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("request_too_large");
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) { await reader.cancel(); throw new Error("request_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}
export async function boundedJson(request: Request, maximumBytes = 32 * 1024 * 1024): Promise<unknown> {
  const bytes = await boundedBytes(request, maximumBytes);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("invalid_json"); }
}
export async function boundedFormData(request: Request, maximumBytes = 64 * 1024 * 1024): Promise<FormData> {
  const bytes = await boundedBytes(request, maximumBytes);
  return new Request(request.url, { method: "POST", headers: request.headers, body: new Uint8Array(bytes) }).formData();
}
