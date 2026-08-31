import { z } from "zod";
import type { YoutubeMetadata } from "./youtube-worker";
import type { TranscriptLine } from "./youtube";

/**
 * 유튜브 자막을 apify 액터로 받아 온다.
 *
 * 왜 필요한가: 유튜브는 클라우드 IP 에서 오는 자막 요청을 막는다. 같은 영상이 집에서는
 * 한국어 자막 2726줄을 주는데 EC2 에서는 "자막이 꺼져 있다"고 답한다. apify 는 자기네
 * 인프라에서 받아 주므로 이 차단을 우회한다.
 *
 * 그래서 직접 받기를 **먼저** 시도하고, 실패했을 때만 여기로 온다. 집에서 돌릴 때는
 * 공짜로 빠르게 끝나고, 막힌 환경에서만 비용이 든다.
 */

/** 액터를 바꿔 끼울 수 있게 둔다. 하나가 망가지거나 비싸지면 환경변수만 고치면 된다. */
const DEFAULT_ACTOR = "automation-lab~youtube-transcript";

/** 액터가 8초쯤 걸린다. 길이가 두 시간짜리 영상도 있어 넉넉히 두되 무한정 기다리지는 않는다. */
const TIMEOUT_SECONDS = 300;

const SegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  duration: z.number(),
});

const ItemSchema = z.object({
  segments: z.array(SegmentSchema).optional(),
  videoTitle: z.string().optional(),
  description: z.string().optional(),
  durationSeconds: z.number().optional(),
  channelName: z.string().optional(),
  language: z.string().optional(),
});

export interface ApifyTranscriptResult {
  lines: TranscriptLine[];
  metadata: YoutubeMetadata;
}

export function isApifyConfigured(environment: Record<string, string | undefined> = process.env): boolean {
  return Boolean(environment.APIFY_TOKEN?.trim());
}

export function apifyActorId(environment: Record<string, string | undefined> = process.env): string {
  return environment.APIFY_YOUTUBE_ACTOR?.trim() || DEFAULT_ACTOR;
}

/**
 * `fetch` 를 주입받는 이유는 테스트 때문이다. 실제 액터를 부르면 돈이 나가고 느리다.
 */
export async function fetchApifyTranscript(
  url: string,
  deps: { fetchImpl?: typeof fetch; environment?: Record<string, string | undefined> } = {},
): Promise<ApifyTranscriptResult> {
  const environment = deps.environment ?? process.env;
  const token = environment.APIFY_TOKEN?.trim();
  if (!token) throw new Error("APIFY_TOKEN가 없어 apify 자막을 쓸 수 없습니다.");

  // 토큰은 헤더로 보낸다. 주소에 실으면 프록시 로그·오류 추적·브라우저 기록에 그대로 남는다.
  const endpoint = `https://api.apify.com/v2/acts/${apifyActorId(environment)}/run-sync-get-dataset-items?timeout=${TIMEOUT_SECONDS}`;
  const response = await (deps.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ urls: [url] }),
    signal: AbortSignal.timeout((TIMEOUT_SECONDS + 30) * 1000),
  });

  // 응답 본문에 계정 정보가 섞일 수 있어 상태 코드만 알린다.
  if (!response.ok) throw new Error(`apify 자막 요청이 실패했습니다 (${response.status}).`);

  const parsed = z.array(ItemSchema).safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new Error("apify 자막 응답 형식을 알아보지 못했습니다.");

  const item = parsed.data[0];
  const segments = item?.segments ?? [];
  if (segments.length === 0) throw new Error("apify 가 이 영상의 자막을 찾지 못했습니다.");

  return {
    lines: segments.map((segment) => ({
      text: segment.text,
      offset: segment.start,
      duration: segment.duration,
      lang: item?.language,
    })),
    metadata: {
      title: item?.videoTitle,
      description: item?.description,
      duration: item?.durationSeconds,
      uploader: item?.channelName,
    },
  };
}
