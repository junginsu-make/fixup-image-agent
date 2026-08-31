export type RedesignStrip = {
  base64: string;
  mimeType: string;
  yStartRatio: number;
  yEndRatio: number;
};

const DEFAULT_MAX_PER_BATCH = 8;
const DEFAULT_MAX_BASE64_CHARS = 10_000_000; // ~10MB; EC2엔 413 한도 없음(스펙 §4.2)

export function planTranscribeBatches(
  strips: RedesignStrip[],
  opts: { maxPerBatch?: number; maxBase64Chars?: number } = {}
): RedesignStrip[][] {
  const maxPerBatch = opts.maxPerBatch ?? DEFAULT_MAX_PER_BATCH;
  const maxBase64Chars = opts.maxBase64Chars ?? DEFAULT_MAX_BASE64_CHARS;
  const batches: RedesignStrip[][] = [];
  let current: RedesignStrip[] = [];
  let currentChars = 0;

  for (const strip of strips) {
    const chars = strip.base64.length;
    const full = current.length >= maxPerBatch || (current.length > 0 && currentChars + chars > maxBase64Chars);
    if (full) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(strip);
    currentChars += chars;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function stitchTranscripts(parts: { transcript: string | null; batchIndex: number }[]): string {
  return parts
    .slice()
    .sort((a, b) => a.batchIndex - b.batchIndex)
    .map((part) =>
      part.transcript && part.transcript.trim()
        ? part.transcript.trim()
        : `[구간 전사 실패 — ${part.batchIndex + 1}번째 배치]`
    )
    .join("\n\n");
}
