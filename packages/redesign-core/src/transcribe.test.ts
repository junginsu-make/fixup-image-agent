import { describe, it, expect } from "vitest";
import { buildTranscribeStripsPrompt, parseTranscriptPayload } from "./transcribe.js";
import type { RedesignStrip } from "./transcribe-batching.js";

const strip = (a: number, b: number): RedesignStrip => ({ base64: "x", mimeType: "image/jpeg", yStartRatio: a, yEndRatio: b });

describe("buildTranscribeStripsPrompt", () => {
  it("includes strip position lines and the fine-print instruction", () => {
    const p = buildTranscribeStripsPrompt([strip(0, 0.1), strip(0.1, 0.2)], 0, 2);
    expect(p).toContain("0.0%");
    expect(p).toContain("성분표");
    expect(p).toContain("(판독불가)");
  });
  it("includes the previous-section hint when provided", () => {
    const p = buildTranscribeStripsPrompt([strip(0, 0.1)], 1, 2, "신뢰요소");
    expect(p).toContain("신뢰요소");
  });
});

describe("parseTranscriptPayload", () => {
  it("parses valid JSON", () => {
    const r = parseTranscriptPayload(JSON.stringify({ transcript: "hello", lastSectionType: "CTA" }));
    expect(r).toEqual({ transcript: "hello", lastSectionType: "CTA" });
  });
  it("throws on invalid JSON", () => {
    expect(() => parseTranscriptPayload("not json")).toThrow();
  });
  it("throws on empty transcript", () => {
    expect(() => parseTranscriptPayload(JSON.stringify({ transcript: "  " }))).toThrow();
  });
  it("trims to 60,000 chars", () => {
    const r = parseTranscriptPayload(JSON.stringify({ transcript: "a".repeat(70_000) }));
    expect(r.transcript.length).toBe(60_000);
  });
  it("parses the first JSON object even when the model appends trailing junk", () => {
    const raw = '{\n  "transcript": "성분: 나이아신아마이드 2%",\n  "lastSectionType": "신뢰요소"\n}\n} section"\n}';
    const r = parseTranscriptPayload(raw);
    expect(r.transcript).toBe("성분: 나이아신아마이드 2%");
    expect(r.lastSectionType).toBe("신뢰요소");
  });
  it("still handles nested braces inside the transcript", () => {
    const raw = '{"transcript":"용량 {500mg}","lastSectionType":"스펙"}';
    expect(parseTranscriptPayload(raw).transcript).toBe("용량 {500mg}");
  });
});
