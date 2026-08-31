import { YoutubeTranscript } from "youtube-transcript";
import { type SourceDocument, SourceInsufficientContentError } from "../types";
import { fetchYoutubeMetadata, transcribeYoutubeAudio, type YoutubeMetadata } from "./youtube-worker";
import { fetchApifyTranscript, isApifyConfigured, type ApifyTranscriptResult } from "./youtube-apify";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export class YoutubeUrlError extends Error {
  constructor() {
    super("유효한 YouTube URL 또는 11자리 video ID가 아닙니다.");
    this.name = "YoutubeUrlError";
  }
}

export class TranscriptUnavailableError extends Error {
  /**
   * 단계별 실패 이유를 모두 싣는다.
   *
   * 예전에는 마지막 오류 하나만 실었다. 그러면 배포 환경에서 늘 "fetch failed" 만 보인다 —
   * 그건 마지막 단계인 음성 인식 서비스에 못 붙었다는 뜻일 뿐, 정작 자막이 왜 안 됐는지는
   * 가려진다. 실제로 그 메시지 때문에 유튜브 IP 차단을 한참 뒤에야 알아냈다.
   */
  constructor(public readonly videoId: string, public readonly failures: string[] = []) {
    const detail = failures.length > 0 ? ` (${failures.join(" / ")})` : "";
    super(`YouTube 자막과 음성 내용을 가져오지 못했습니다.${detail}`);
    this.name = "TranscriptUnavailableError";
  }
}

export interface TranscriptLine {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

export type TranscriptFetcher = (videoId: string, language: "ko" | "en") => Promise<TranscriptLine[]>;
export type YoutubeMetadataFetcher = (url: string) => Promise<YoutubeMetadata>;
export type YoutubeAudioTranscriber = (input: { id: string; url: string; duration?: number }) => Promise<TranscriptLine[]>;
export type ApifyTranscriptFetcher = (url: string) => Promise<ApifyTranscriptResult>;

export function parseYoutubeVideoId(input: string): string {
  const trimmed = input.trim();
  if (YOUTUBE_ID.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const candidate = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : host.endsWith("youtube.com")
        ? url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
        : undefined;
    if (candidate && YOUTUBE_ID.test(candidate)) return candidate;
  } catch {
    // A clear domain-specific error is emitted below.
  }
  throw new YoutubeUrlError();
}

async function fetchTranscript(videoId: string, language: "ko" | "en"): Promise<TranscriptLine[]> {
  return YoutubeTranscript.fetchTranscript(videoId, { lang: language });
}

export async function ingestYoutube(input: { id: string; url: string; fetchTranscript?: TranscriptFetcher; fetchMetadata?: YoutubeMetadataFetcher; transcribeAudio?: YoutubeAudioTranscriber; fetchApify?: ApifyTranscriptFetcher }): Promise<SourceDocument> {
  const videoId = parseYoutubeVideoId(input.url);
  const transcriptFetcher = input.fetchTranscript ?? fetchTranscript;
  const metadataFetcher = input.fetchMetadata ?? (input.fetchTranscript ? async () => ({}) : fetchYoutubeMetadata);
  const audioTranscriber = input.transcribeAudio ?? (input.fetchTranscript ? undefined : transcribeYoutubeAudio);
  // 키가 없으면 아예 건너뛴다. 로컬 개발은 직접 자막만으로 지금까지처럼 돌아간다.
  const apifyFetcher = input.fetchApify ?? (isApifyConfigured() ? fetchApifyTranscript : undefined);
  let metadata: YoutubeMetadata = {};
  try { metadata = await metadataFetcher(input.url); } catch { /* 자막이나 음성만으로 계속 진행합니다. */ }
  let lines: TranscriptLine[] | undefined;
  let lastError: unknown;
  let usedAudio = false;
  // 단계마다 왜 실패했는지 따로 남긴다. 하나로 덮어쓰면 마지막 단계의 오류만 보인다.
  const failures: string[] = [];
  const note = (stage: string, error: unknown) => {
    lastError = error;
    failures.push(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
  };
  for (const language of ["ko", "en"] as const) {
    try {
      lines = await transcriptFetcher(videoId, language);
      if (lines.length > 0) break;
    } catch (error) {
      lastError = error;
      if (language === "en") failures.push(`직접 자막: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // 유튜브가 클라우드 IP 를 막으면 위에서 아무것도 못 받는다. 음성 인식으로 넘어가기 전에
  // apify 로 자막을 다시 시도한다. 자막이 음성 인식보다 정확하고 싸다.
  if ((!lines || lines.length === 0) && apifyFetcher) {
    try {
      const result = await apifyFetcher(input.url);
      lines = result.lines;
      // 막힌 환경에서는 메타데이터 조회도 함께 실패해 제목이 "YouTube <id>" 로 남는다.
      // 이미 받은 값이 있으면 그것을 우선하고, 빈 자리만 apify 가 준 값으로 채운다.
      metadata = {
        title: metadata.title ?? result.metadata.title,
        description: metadata.description ?? result.metadata.description,
        duration: metadata.duration ?? result.metadata.duration,
        uploader: metadata.uploader ?? result.metadata.uploader,
        chapters: metadata.chapters,
      };
    } catch (error) { note("apify", error); }
  }
  if ((!lines || lines.length === 0) && audioTranscriber) {
    try {
      lines = await audioTranscriber({ id: input.id, url: input.url, duration: metadata.duration });
      usedAudio = true;
    } catch (error) { note("음성 인식", error); }
  }
  if (!lines || lines.length === 0) {
    if (lastError instanceof Error && lastError.message.includes("npm run setup:stt")) throw lastError;
    throw new TranscriptUnavailableError(videoId, failures);
  }

  const transcriptSegments = lines
    .map((line) => ({
      id: `src_${input.id}#t=${Math.floor(line.offset)}`,
      text: line.text.replace(/\s+/g, " ").trim(),
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      startSeconds: line.offset,
      endSeconds: line.offset + line.duration,
    }))
    .filter((segment) => segment.text.length > 0);
  const contextSegments = [
    metadata.description?.trim() ? { id: `src_${input.id}#description`, text: `영상 설명: ${metadata.description.trim()}`, sourceUrl: `https://www.youtube.com/watch?v=${videoId}` } : undefined,
    ...(metadata.chapters ?? []).filter((chapter) => chapter.title?.trim()).map((chapter) => ({ id: `src_${input.id}#chapter=${Math.floor(chapter.start_time)}`, text: `영상 구간: ${chapter.title.trim()}`, sourceUrl: `https://www.youtube.com/watch?v=${videoId}`, startSeconds: chapter.start_time, endSeconds: chapter.end_time })),
  ].filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  const segments = [...contextSegments, ...transcriptSegments];
  if (segments.length === 0) throw new SourceInsufficientContentError();

  return {
    id: input.id,
    kind: "youtube",
    title: metadata.title?.trim() || `YouTube ${videoId}`,
    originalInput: input.url,
    segments,
    extractionChannels: [
      usedAudio ? "audio" : "captions",
      metadata.description?.trim() ? "description" : undefined,
      metadata.chapters?.length ? "chapters" : undefined,
    ].filter((channel): channel is "captions" | "audio" | "description" | "chapters" => Boolean(channel)),
  };
}
