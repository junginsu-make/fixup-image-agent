import { describe, expect, it, vi } from "vitest";
import { apifyActorId, fetchApifyTranscript, isApifyConfigured } from "../adapters/youtube-apify";
import { ingestYoutube } from "../adapters/youtube";

/**
 * 유튜브는 클라우드 IP 에서 오는 자막 요청을 막는다. 같은 영상이 집에서는 한국어 자막을
 * 주는데 EC2 에서는 "자막이 꺼져 있다"고 답한다. apify 는 그 차단을 우회하는 우회로다.
 *
 * 실제 액터를 부르면 돈이 나가고 느리므로 fetch 를 주입해 검증한다.
 */

const URL = "https://www.youtube.com/watch?v=iP5RUzXhWoc";

/** 실제 automation-lab~youtube-transcript 응답에서 옮겨 온 모양. */
const ACTOR_RESPONSE = [{
  videoId: "iP5RUzXhWoc",
  videoTitle: "IT뉴스 - ox-alpha",
  channelName: "조코딩 JoCoding",
  description: "영상 설명입니다.",
  durationSeconds: 7087,
  language: "ko",
  segments: [
    { text: "안녕하세요.", start: 11.32, duration: 3, end: 14.32 },
    { text: "오진성 님.", start: 15.559, duration: 5.201, end: 20.76 },
  ],
  segmentCount: 2,
}];

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? status : status }));
}

describe("apify 자막 받기", () => {
  it("키가 있어야 쓴다", () => {
    expect(isApifyConfigured({})).toBe(false);
    expect(isApifyConfigured({ APIFY_TOKEN: "  " })).toBe(false);
    expect(isApifyConfigured({ APIFY_TOKEN: "k" })).toBe(true);
  });

  it("액터를 환경변수로 바꿀 수 있다", () => {
    expect(apifyActorId({})).toBe("automation-lab~youtube-transcript");
    expect(apifyActorId({ APIFY_YOUTUBE_ACTOR: "other~actor" })).toBe("other~actor");
  });

  it("자막 줄과 메타데이터로 바꾼다", async () => {
    const result = await fetchApifyTranscript(URL, {
      fetchImpl: fakeFetch(ACTOR_RESPONSE) as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "k" },
    });
    expect(result.lines).toEqual([
      { text: "안녕하세요.", offset: 11.32, duration: 3, lang: "ko" },
      { text: "오진성 님.", offset: 15.559, duration: 5.201, lang: "ko" },
    ]);
    expect(result.metadata.title).toBe("IT뉴스 - ox-alpha");
    expect(result.metadata.duration).toBe(7087);
  });

  it("토큰을 주소가 아니라 헤더로 보낸다", async () => {
    // 주소에 실으면 프록시 로그·오류 추적·브라우저 기록에 토큰이 그대로 남는다.
    const spy = vi.fn(async () => new Response(JSON.stringify(ACTOR_RESPONSE), { status: 200 }));
    await fetchApifyTranscript(URL, {
      fetchImpl: spy as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "secret-token-value" },
    });
    const [endpoint, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).not.toContain("secret-token-value");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token-value");
  });

  it("토큰을 오류 메시지에 싣지 않는다", async () => {
    const failing = vi.fn(async () => new Response("자세한 내용에 토큰이 섞일 수 있음", { status: 401 }));
    await expect(fetchApifyTranscript(URL, {
      fetchImpl: failing as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "secret-token-value" },
    })).rejects.toThrow(/401/);
    await expect(fetchApifyTranscript(URL, {
      fetchImpl: failing as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "secret-token-value" },
    })).rejects.not.toThrow(/secret-token-value/);
  });

  it("자막이 없으면 실패로 알린다", async () => {
    await expect(fetchApifyTranscript(URL, {
      fetchImpl: fakeFetch([{ videoId: "x", segments: [] }]) as unknown as typeof fetch,
      environment: { APIFY_TOKEN: "k" },
    })).rejects.toThrow(/자막을 찾지 못했습니다/);
  });
});

describe("자막 → apify → 음성 인식 순서", () => {
  const blocked = async () => { throw new Error("Transcript is disabled on this video"); };

  it("직접 자막이 막히면 apify 로 넘어간다", async () => {
    const document = await ingestYoutube({
      id: "src_1",
      url: URL,
      fetchTranscript: blocked,
      fetchMetadata: async () => ({}),
      fetchApify: async () => ({
        lines: [{ text: "안녕하세요.", offset: 11.32, duration: 3 }],
        metadata: { title: "IT뉴스 - ox-alpha" },
      }),
    });
    expect(document.title).toBe("IT뉴스 - ox-alpha");
    expect(document.segments.some((segment) => segment.text === "안녕하세요.")).toBe(true);
    // apify 도 자막이므로 음성이 아니라 captions 로 표시돼야 한다.
    expect(document.extractionChannels).toContain("captions");
    expect(document.extractionChannels).not.toContain("audio");
  });

  it("직접 자막이 되면 apify 를 부르지 않는다", async () => {
    const apify = vi.fn();
    await ingestYoutube({
      id: "src_2",
      url: URL,
      fetchTranscript: async () => [{ text: "직접 받은 자막입니다.", offset: 0, duration: 2 }],
      fetchMetadata: async () => ({ title: "직접" }),
      fetchApify: apify as never,
    });
    expect(apify).not.toHaveBeenCalled();
  });

  it("모두 실패하면 단계별 이유를 다 알려 준다", async () => {
    // 예전에는 마지막 오류 하나만 실어서 배포 환경에서 늘 "fetch failed"(음성 인식 연결
    // 실패) 만 보였다. 정작 자막이 왜 안 됐는지가 가려져 원인 파악이 늦어졌다.
    await expect(ingestYoutube({
      id: "src_4",
      url: URL,
      fetchTranscript: blocked,
      fetchMetadata: async () => ({}),
      fetchApify: async () => { throw new Error("apify 가 이 영상의 자막을 찾지 못했습니다."); },
      transcribeAudio: async () => { throw new Error("fetch failed"); },
    })).rejects.toThrow(/직접 자막.*apify.*음성 인식/s);
  });

  it("apify 도 실패하면 음성 인식으로 넘어간다", async () => {
    const document = await ingestYoutube({
      id: "src_3",
      url: URL,
      fetchTranscript: blocked,
      fetchMetadata: async () => ({}),
      fetchApify: async () => { throw new Error("apify 도 실패"); },
      transcribeAudio: async () => [{ text: "음성에서 뽑은 내용입니다.", offset: 0, duration: 4 }],
    });
    expect(document.extractionChannels).toContain("audio");
  });
});
