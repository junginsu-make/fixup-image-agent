import OpenAI from "openai";
import { MAX_SEGMENT_LENGTH, splitIntoReadableChunks, toReadableProse } from "../prose";
import { type SourceDocument, SourceInsufficientContentError } from "../types";

export interface TopicCitation {
  url: string;
  title: string;
  /** 이 인용이 본문 어디에 붙는지. OpenAI 주석의 start_index. 없으면 본문에서 찾는다. */
  startIndex?: number;
}
export interface TopicResearchResult { text: string; citations: TopicCitation[] }
export type TopicResearcher = (topic: string) => Promise<TopicResearchResult>;
export type TopicUsageRecorder = (input: {
  provider: "openai";
  feature: "research";
  model: string;
  usage: unknown;
  toolCalls: number;
  topic: string;
}) => void;

export class TopicResearchNotConfiguredError extends Error {
  constructor() { super("주제 조사를 사용하려면 OPENAI_API_KEY가 필요합니다."); this.name = "TopicResearchNotConfiguredError"; }
}

/**
 * 인용을 뽑되 **본문 어디에 붙는지(start_index)까지** 가져온다.
 *
 * 위치를 버리면 어느 문단이 어느 출처를 근거로 삼았는지 알 수 없게 되고, 그러면 남는
 * 방법은 추측뿐이다. 실제로 예전에는 조각 번호로 돌아가며 붙여서, 카드에 달린 출처가
 * 그 카드의 근거가 아닌 경우가 생겼다.
 *
 * 같은 URL 이 여러 번 인용되면 **각 위치를 모두 남긴다.** 한 번만 남기면 두 번째 문단이
 * 출처를 잃는다.
 */
function outputCitations(response: unknown): TopicCitation[] {
  const output = (response as { output?: Array<{ type?: string; content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string; start_index?: number }> }> }> }).output ?? [];
  const annotations = output.flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? [])
    .filter((item) => item.type === "url_citation" && item.url);

  const seenUrls = new Set<string>();
  const citations: TopicCitation[] = [];
  for (const item of annotations) {
    // 서로 다른 출처는 8개까지만. 같은 출처의 반복 인용은 이 상한과 무관하게 다 남긴다.
    if (!seenUrls.has(item.url!)) {
      if (seenUrls.size >= 8) continue;
      seenUrls.add(item.url!);
    }
    citations.push({
      url: item.url!,
      title: item.title || new URL(item.url!).hostname,
      startIndex: typeof item.start_index === "number" ? item.start_index : undefined,
    });
  }
  return citations;
}

export function createOpenAITopicResearcher(
  environment: { OPENAI_API_KEY?: string; OPENAI_RESEARCH_MODEL?: string; OPENAI_DRAFT_MODEL?: string } = process.env as Record<string, string | undefined>,
  recordUsage: TopicUsageRecorder = () => undefined,
): TopicResearcher {
  if (!environment.OPENAI_API_KEY) throw new TopicResearchNotConfiguredError();
  const client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
  const model = environment.OPENAI_RESEARCH_MODEL ?? environment.OPENAI_DRAFT_MODEL ?? "gpt-5.6-sol";
  return async (topic) => {
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      input: `다음 주제를 카드뉴스 자료로 조사하세요: ${topic}\n\n공식 기관, 논문, 기업 공식 발표, 신뢰할 수 있는 언론을 우선하세요. 최근 자료를 우선하되 날짜를 명시하세요. 서로 독립적인 출처를 최대 6개 사용하고, 숫자와 통계에는 반드시 인라인 출처를 붙이세요. 한국어로 1000자 이상 핵심 사실을 정리하세요. 과장하거나 추측하지 마세요.\n\n마크다운 기호(#, **, ---, 표)를 쓰지 말고 소제목과 문단으로 나눈 한국어 산문으로 쓰세요. 카드 번호를 매기거나 카드 구성을 짜지 마세요. 구성은 다음 단계에서 정합니다.`,
    });
    const toolCalls = response.output.filter((item) => item.type === "web_search_call").length;
    recordUsage({ provider: "openai", feature: "research", model, usage: response.usage, toolCalls, topic });
    return { text: response.output_text, citations: outputCitations(response) };
  };
}

/**
 * 조사 프롬프트가 "숫자와 통계에는 반드시 인라인 출처를 붙이세요"라고 지시하기 때문에,
 * 모델은 본문 중간에 마크다운 링크로 출처를 남긴다. 구조화된 인용은 outputCitations()가
 * 이미 따로 뽑아 segments[].sourceUrl 로 붙여 주므로, 본문에 남은 마크다운/URL 조각은
 * 카드 문구에 섞여 들어가기 전에 걷어낸다.
 */
export function stripInlineCitations(text: string): string {
  return text
    // ![대체텍스트](url) — 이미지 마크업은 통째로 제거한다. 링크보다 먼저 처리해야
    // 뒤 단계에서 "![라벨](url)" 이 "!라벨" 로 잘못 남는 것을 막을 수 있다.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // [라벨](url) — 라벨만 남기고 URL은 버린다.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 본문에 그대로 남은 URL. 끝에 붙은 문장부호·괄호는 URL이 아니므로 남긴다.
    .replace(/https?:\/\/\S*[^\s.,;:!?)\]]/g, "")
    // 위 제거로 생긴 빈 괄호/대괄호.
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    // 위 제거로 생긴 이중 공백.
    .replace(/[ \t]{2,}/g, " ")
    // 위 제거로 생긴, 구두점 앞 공백. ("말했다 ." -> "말했다.")
    .replace(/[ \t]+([.,!?;:])/g, "$1");
}

/** 링크 라벨만 반복된 응답을 실제 조사 내용으로 오인하지 않는다. 글자 수와 무관한 내용 존재 검사다. */
function hasNonCitationContent(text: string): boolean {
  return text
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\s.,;:!?()[\]{}'"`~*_#|<>\-/]+/g, "")
    .length > 0;
}

/**
 * 유니코드 사적 사용 영역. 실제 글에는 나올 수 없고, 정리 단계의 어떤 정규식도
 * (마크다운 기호·공백·구두점만 건드리므로) 이 문자를 지우지 않는다.
 */
const MARK_OPEN = "";
const MARK_CLOSE = "";
const MARK_PATTERN = /(\d+)/g;

/**
 * 인용이 본문 어디에 붙는지를 **표시로 심는다.**
 *
 * 조사 응답은 정리(마크다운 제거)와 분할(문단 경계)을 거치면서 글자 위치가 전부 어긋난다.
 * 그래서 좌표를 계산해 따라가는 대신, 원문에 표시를 박아 두고 표시가 어느 조각에
 * 실려 갔는지를 본다. 표시는 정리·분할을 그대로 통과한다.
 *
 * 위치를 아는 방법은 둘이다.
 *   1) 주석의 start_index — 구조화된 값이라 가장 정확하다
 *   2) 본문에 남은 마크다운 링크 `[라벨](url)` — 프롬프트가 인라인 출처를 요구하므로 흔하다
 * 1이 있으면 1을 쓰고, 없으면 2에서 찾는다. 둘 다 없으면 그 인용은 위치를 모른다.
 */
/**
 * URL 이 `[라벨](url)` 안에 있으면 그 링크가 시작하는 자리를 돌려준다.
 * 링크 밖의 맨 URL 이면 URL 자리를 그대로 돌려준다.
 */
function linkStartBefore(text: string, urlAt: number): number {
  if (text.slice(urlAt - 2, urlAt) !== "](") return urlAt;
  const openBracket = text.lastIndexOf("[", urlAt - 2);
  if (openBracket < 0) return urlAt;
  // 이미지 `![라벨](url)` 이면 `!` 앞까지 물러난다.
  return text[openBracket - 1] === "!" ? openBracket - 1 : openBracket;
}

/** 원문의 문단 경계. 빈 줄로 나뉜다 — 조각을 나누는 기준과 같다. */
function paragraphRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const match of text.matchAll(/\n{2,}/g)) {
    ranges.push({ start, end: match.index! });
    start = match.index! + match[0].length;
  }
  ranges.push({ start, end: text.length });
  return ranges.filter((range) => range.end > range.start);
}

function markCitationPositions(text: string, citations: TopicCitation[]): string {
  const points: Array<{ at: number; index: number }> = [];

  // 같은 URL 을 가리키는 인용들을 묶는다. 대표 번호는 먼저 나온 것.
  const byUrl = new Map<string, { index: number; starts: number[] }>();
  citations.forEach((citation, index) => {
    const entry = byUrl.get(citation.url) ?? { index, starts: [] };
    if (typeof citation.startIndex === "number" && citation.startIndex >= 0 && citation.startIndex <= text.length) {
      entry.starts.push(citation.startIndex);
    }
    byUrl.set(citation.url, entry);
  });

  for (const [url, entry] of byUrl) {
    if (entry.starts.length > 0) {
      // 주석이 위치를 준 경우. 가장 정확하다.
      for (const at of entry.starts) points.push({ at, index: entry.index });
      continue;
    }
    // 위치를 모르면 본문에서 찾는다. **모든 등장**을 표시한다 —
    // 첫 등장만 표시하면 같은 출처를 다시 인용한 문단이 출처를 잃는다.
    for (let from = 0; ; ) {
      const found = text.indexOf(url, from);
      if (found < 0) break;
      // URL 이 `[라벨](url)` 안에 있으면 링크 **앞**에 심는다.
      // URL 자리에 심으면 링크를 걷어낼 때 표시까지 함께 지워진다.
      points.push({ at: linkStartBefore(text, found), index: entry.index });
      from = found + url.length;
    }
  }

  // 문단이 상한보다 길면 여러 조각으로 잘린다. 그때 인용이 없는 뒷조각도 같은 문단이므로
  // 같은 출처가 근거다. 문단 **끝**에 그 문단의 마지막 인용을 한 번 더 심어, 뒷조각이
  // 출처를 잃지 않게 한다. 문단을 넘어서는 물려주지 않는다 — 다른 문단은 다른 주장이다.
  for (const paragraph of paragraphRanges(text)) {
    const inside = points.filter((point) => point.at >= paragraph.start && point.at < paragraph.end);
    if (inside.length === 0) continue;
    const last = inside.reduce((a, b) => (b.at > a.at ? b : a));
    points.push({ at: paragraph.end, index: last.index });
  }

  // 뒤에서부터 넣어야 앞쪽 좌표가 밀리지 않는다.
  points.sort((a, b) => b.at - a.at);
  let marked = text;
  for (const point of points) {
    marked = `${marked.slice(0, point.at)}${MARK_OPEN}${point.index}${MARK_CLOSE}${marked.slice(point.at)}`;
  }
  return marked;
}

/** 조각에서 표시를 떼어 내고, 그 조각이 실제로 인용한 출처를 돌려준다. */
function takeMarks(chunk: string): { text: string; citationIndexes: number[] } {
  const citationIndexes: number[] = [];
  for (const match of chunk.matchAll(MARK_PATTERN)) citationIndexes.push(Number(match[1]));
  const text = chunk
    .replace(MARK_PATTERN, "")
    // 표시를 걷어내며 생긴 이중 공백과 구두점 앞 공백을 정리한다.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .trim();
  return { text, citationIndexes };
}

export async function ingestTopic(input: { id: string; topic: string; researcher?: TopicResearcher }): Promise<SourceDocument> {
  const topic = input.topic.trim();
  if (topic.length < 2 || topic.length > 180) throw new Error("조사할 주제는 2~180자로 적어 주세요.");
  const result = await (input.researcher ?? createOpenAITopicResearcher())(topic);
  if (!hasNonCitationContent(result.text) || result.citations.length === 0) throw new SourceInsufficientContentError();

  const marked = markCitationPositions(result.text, result.citations);
  const clean = toReadableProse(stripInlineCitations(marked));
  if (!takeMarks(clean).text) throw new SourceInsufficientContentError();

  const segments = splitIntoReadableChunks(clean, MAX_SEGMENT_LENGTH).map((chunk, index) => {
    const { text, citationIndexes } = takeMarks(chunk);
    // 한 조각이 여러 출처를 인용하면 먼저 나온 것을 대표로 삼는다.
    // 인용이 없으면 출처를 지어내지 않는다 — 없는 근거를 붙이는 것이 가장 나쁘다.
    const citation = citationIndexes.length ? result.citations[citationIndexes[0]!] : undefined;
    return { id: `src_${input.id}#research=${index + 1}`, text, sourceUrl: citation?.url };
  }).filter((segment) => segment.text.length > 0);

  if (segments.length === 0) throw new SourceInsufficientContentError();
  return { id: input.id, kind: "topic", title: `주제 조사 · ${topic}`, originalInput: topic, segments };
}
