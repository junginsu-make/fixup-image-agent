import type { TranscriptLine } from "./youtube";

export interface YoutubeMetadata {
  title?: string;
  description?: string;
  duration?: number;
  uploader?: string;
  chapters?: Array<{ title: string; start_time: number; end_time?: number }>;
}

interface WorkerResponse extends YoutubeMetadata {
  segments?: Array<{ text: string; start: number; end: number }>;
}

function workerUrl(path: string): string {
  const base = process.env.YOUTUBE_STT_SERVICE_URL?.trim();
  if (!base) throw new Error("유튜브 음성 처리 서비스가 연결되지 않았습니다. 배포 환경에 YOUTUBE_STT_SERVICE_URL을 설정해 주세요.");
  return new URL(path, `${base.replace(/\/$/, "")}/`).toString();
}

async function callWorker(path: string, body: Record<string, unknown>): Promise<WorkerResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.YOUTUBE_STT_SERVICE_SECRET) headers["x-worker-secret"] = process.env.YOUTUBE_STT_SERVICE_SECRET;
  const response = await fetch(workerUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60 * 60_000),
  });
  const payload = await response.json().catch(() => ({})) as WorkerResponse & { detail?: string };
  if (!response.ok) throw new Error(payload.detail || `유튜브 음성 처리 서비스 오류 (${response.status})`);
  return payload;
}

export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  return callWorker("metadata", { url });
}

export async function transcribeYoutubeAudio(input: { id: string; url: string; duration?: number }): Promise<TranscriptLine[]> {
  const payload = await callWorker("transcribe", input);
  return (payload.segments ?? []).map((segment) => ({
    text: segment.text,
    offset: segment.start,
    duration: Math.max(0, segment.end - segment.start),
  }));
}
