import { describe, expect, it } from "vitest";
import { ingestYoutube, parseYoutubeVideoId, TranscriptUnavailableError, YoutubeUrlError } from "../adapters/youtube";

const longTranscript = Array.from({ length: 20 }, (_, index) => ({
  text: `자막 ${index} ` + "카드뉴스 원고를 검증 가능한 데이터 계약으로 만들면 렌더링 단계의 오류를 줄일 수 있습니다. ".repeat(2),
  offset: index * 5,
  duration: 5,
}));

describe("YouTube ingest", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=12", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("parses %s", (input, expected) => {
    expect(parseYoutubeVideoId(input)).toBe(expected);
  });

  it("tries Korean first and assigns time-coded source references", async () => {
    const languages: string[] = [];
    const source = await ingestYoutube({
      id: "video_01",
      url: "https://youtu.be/dQw4w9WgXcQ",
      fetchTranscript: async (_id, language) => {
        languages.push(language);
        return longTranscript;
      },
    });
    expect(languages).toEqual(["ko"]);
    expect(source.segments[0]?.id).toBe("src_video_01#t=0");
    expect(source.segments).toHaveLength(20);
  });

  it("surfaces a direct-input fallback when transcripts are unavailable", async () => {
    await expect(ingestYoutube({
      id: "video_01",
      url: "dQw4w9WgXcQ",
      fetchTranscript: async () => { throw new Error("disabled"); },
    })).rejects.toBeInstanceOf(TranscriptUnavailableError);
  });

  it("500자 미만 영상 자막도 별도 예외 설정 없이 보존한다", async () => {
    const source = await ingestYoutube({
      id: "short_01",
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      fetchTranscript: async () => [{ text: "짧지만 수집함에서 검토할 수 있는 쇼츠 자막입니다.", offset: 0, duration: 20 }],
    });

    expect(source.segments[0]?.text).toContain("쇼츠 자막");
  });

  it("uses free local audio transcription and combines video context when captions are unavailable", async () => {
    const source = await ingestYoutube({
      id: "video_audio",
      url: "https://youtu.be/dQw4w9WgXcQ",
      fetchTranscript: async () => { throw new Error("no captions"); },
      fetchMetadata: async () => ({ title: "음성으로 읽은 영상", description: "영상 설명 ".repeat(30), duration: 90, chapters: [{ title: "핵심 내용", start_time: 10, end_time: 40 }] }),
      transcribeAudio: async () => longTranscript,
    });
    expect(source.title).toBe("음성으로 읽은 영상");
    expect(source.segments.some((segment) => segment.text.includes("자막 0"))).toBe(true);
    expect(source.segments.some((segment) => segment.id.includes("description"))).toBe(true);
    expect(source.segments.some((segment) => segment.id.includes("chapter"))).toBe(true);
    expect(source.segments.some((segment) => segment.startSeconds === 0)).toBe(true);
    expect(source.extractionChannels).toEqual(["audio", "description", "chapters"]);
  });

  it("rejects non-YouTube URLs", () => {
    expect(() => parseYoutubeVideoId("https://example.com/video")).toThrow(YoutubeUrlError);
  });
});
