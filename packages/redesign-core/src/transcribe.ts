import { RedesignError } from "./errors.js";
import type { RedesignStrip } from "./transcribe-batching.js";

const OPENAI_ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.5";
export const GOOGLE_READING_MODEL = process.env.GOOGLE_READING_MODEL || "gemini-3.1-pro-preview";
const MAX_TRANSCRIBE_STRIPS_PER_BATCH = 8;
const MAX_LONG_PAGE_TRANSCRIPT_CHARS = 60_000;

export type TranscribeStripsInput = {
  strips: RedesignStrip[];
  batchIndex: number;
  batchCount: number;
  previousSectionHint?: string;
  provider?: string;
  openaiKey?: string;
  googleKey?: string;
  signal?: AbortSignal;
};
export type TranscribeStripsResult = { transcript: string; lastSectionType?: string };

export async function transcribeStrips(input: TranscribeStripsInput): Promise<TranscribeStripsResult> {
  const strips = (input.strips || []).slice(0, MAX_TRANSCRIBE_STRIPS_PER_BATCH);
  if (strips.length === 0) {
    throw new RedesignError("전사할 스트립 이미지가 없습니다.", 400);
  }
  const provider = String(input.provider || "openai") === "google" ? "google" : "openai";
  const apiKey = provider === "google" ? String(input.googleKey || "") : String(input.openaiKey || "");
  if (!apiKey) {
    throw new RedesignError(provider === "google" ? "Google 읽기 모델 API 키가 필요합니다." : "OpenAI API 키가 필요합니다.", 400);
  }
  const batchIndex = Number.isFinite(input.batchIndex) ? Math.max(0, Math.floor(input.batchIndex)) : 0;
  const batchCount = Number.isFinite(input.batchCount) ? Math.max(batchIndex + 1, Math.floor(input.batchCount)) : batchIndex + 1;
  const prompt = buildTranscribeStripsPrompt(strips, batchIndex, batchCount, input.previousSectionHint);

  const raw = provider === "google"
    ? await callGoogleReading({ apiKey, prompt, strips, signal: input.signal })
    : await callOpenAiReading({ apiKey, prompt, strips, signal: input.signal });
  return parseTranscriptPayload(raw);
}

export function buildTranscribeStripsPrompt(
  strips: RedesignStrip[], batchIndex: number, batchCount: number, previousSectionHint?: string
): string {
  const stripLines = strips
    .map((s, i) => `- ${i + 1}번째 이미지 = 페이지 세로 ${(s.yStartRatio * 100).toFixed(1)}%~${(s.yEndRatio * 100).toFixed(1)}% 구간`)
    .join("\n");
  const hint = previousSectionHint?.trim()
    ? `이전 배치의 마지막 섹션 유형: ${previousSectionHint.trim().slice(0, 80)} (이 흐름이 첫 구간으로 이어질 수 있습니다.)`
    : "";
  return `당신은 한국 이커머스 상세페이지 전사 전문가입니다. 지금 전달되는 이미지들은 하나의 상품 상세페이지를 위에서 아래로 자른 연속 구간이며, 이번 배치는 전체 ${batchCount}개 중 ${batchIndex + 1}번째입니다.

[구간 위치]
${stripLines}
${hint}

각 구간에 대해 transcript 필드에 아래 형식의 마크다운을 작성하세요.

### 구간 N (세로 X%~Y%)
[전사] 이미지 안의 모든 한국어/영어 텍스트를 빠짐없이 그대로 받아쓰세요. 요약·의역 금지. 작은 글씨(성분표, 주의사항, 인증번호, 시험 수치, 고시정보)도 모두 포함하고, 읽을 수 없는 글자는 (판독불가)로 표시하세요. 구간 경계에서 잘린 문장은 보이는 부분까지만 적고 끝에 (절단)을 붙이세요. 텍스트가 없으면 "(텍스트 없음 — 이미지 연출만)"으로 표시하세요.
[섹션 유형] 후킹 / 문제제기 / 혜택·약속 / 신뢰요소 / 스펙·상세정보 / 비교 / FAQ / CTA·프로모션 / 배송·교환·법정정보 / 기타 중 판정.

규칙:
1. 전사의 완전성이 최우선입니다. 분석·평가보다 받아쓰기가 중요합니다.
2. 가격, 수치, 단위, 브랜드명, 제품명은 보이는 표기 그대로 적으세요. 추측 금지.
3. lastSectionType 필드에는 이번 배치 마지막 구간의 섹션 유형 하나만 적으세요.
반드시 { "transcript": string, "lastSectionType": string } 형태의 JSON만 반환하세요.`;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i += 1) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}

export function parseTranscriptPayload(raw: string): TranscribeStripsResult {
  let parsed: unknown;
  const jsonText = extractFirstJsonObject(String(raw || "")) ?? raw;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new RedesignError(`상세페이지 전사 응답을 해석하지 못했습니다. (${error instanceof Error ? error.message : "invalid json"})`, 502);
  }
  const obj = (parsed || {}) as Record<string, unknown>;
  const transcript = String(obj.transcript ?? "").trim();
  if (!transcript) throw new RedesignError("상세페이지 전사 결과가 비어 있습니다.", 502);
  const lastSectionType = String(obj.lastSectionType ?? "").trim().slice(0, 80);
  return { transcript: transcript.slice(0, MAX_LONG_PAGE_TRANSCRIPT_CHARS), lastSectionType: lastSectionType || undefined };
}

async function callOpenAiReading({ apiKey, prompt, strips, signal }: { apiKey: string; prompt: string; strips: RedesignStrip[]; signal?: AbortSignal }): Promise<string> {
  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [{ type: "input_text", text: prompt }];
  for (const s of strips) content.push({ type: "input_image", image_url: `data:${s.mimeType};base64,${s.base64}` });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: OPENAI_ANALYSIS_MODEL,
      input: [
        { role: "system", content: "You are a meticulous Korean ecommerce detail-page transcriber. Return only valid JSON { transcript, lastSectionType }." },
        { role: "user", content },
      ],
    }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new RedesignError(data?.error?.message || "OpenAI 전사 요청 실패", 502);
  return data.output_text || (data.output?.flatMap((i: any) => i.content || []).map((c: any) => c.text || "").join("\n") ?? "");
}

async function callGoogleReading({ apiKey, prompt, strips, signal }: { apiKey: string; prompt: string; strips: RedesignStrip[]; signal?: AbortSignal }): Promise<string> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const s of strips) parts.push({ inlineData: { mimeType: s.mimeType, data: s.base64 } });
  parts.push({ text: prompt });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_READING_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
  });
  const data = await readJson(response);
  if (!response.ok) throw new RedesignError(data?.error?.message || "Google 전사 요청 실패", 502);
  return data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
}

async function readJson(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: { message: text || response.statusText } }; }
}
