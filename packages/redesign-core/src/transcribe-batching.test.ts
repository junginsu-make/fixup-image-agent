import { describe, it, expect } from "vitest";
import { planTranscribeBatches, stitchTranscripts, type RedesignStrip } from "./transcribe-batching.js";

const strip = (n: number, chars = 10): RedesignStrip => ({
  base64: "a".repeat(chars), mimeType: "image/jpeg",
  yStartRatio: n / 10, yEndRatio: (n + 1) / 10,
});

describe("planTranscribeBatches", () => {
  it("closes a batch at maxPerBatch", () => {
    const batches = planTranscribeBatches(Array.from({ length: 5 }, (_, i) => strip(i)), { maxPerBatch: 2, maxBase64Chars: 1e9 });
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });
  it("closes a batch when the byte cap would be exceeded", () => {
    const batches = planTranscribeBatches([strip(0, 100), strip(1, 100), strip(2, 100)], { maxPerBatch: 8, maxBase64Chars: 150 });
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
  });
  it("keeps an over-cap single strip as its own batch", () => {
    const batches = planTranscribeBatches([strip(0, 500)], { maxPerBatch: 8, maxBase64Chars: 100 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });
  it("returns [] for empty input", () => {
    expect(planTranscribeBatches([])).toEqual([]);
  });
});

describe("stitchTranscripts", () => {
  it("joins in order", () => {
    const out = stitchTranscripts([{ transcript: "A", batchIndex: 0 }, { transcript: "B", batchIndex: 1 }]);
    expect(out.indexOf("A")).toBeLessThan(out.indexOf("B"));
  });
  it("inserts a visible marker for a failed batch", () => {
    const out = stitchTranscripts([{ transcript: "A", batchIndex: 0 }, { transcript: null, batchIndex: 1 }]);
    expect(out).toContain("전사 실패");
    expect(out).toContain("2");
  });
});
