export type SourceKind = "youtube" | "web" | "topic" | "upload" | "text";

export interface SourceSegment {
  id: string;
  text: string;
  sourceUrl?: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface SourceDocument {
  id: string;
  kind: SourceKind;
  title: string;
  originalInput: string;
  segments: SourceSegment[];
  author?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  extractionChannels?: Array<"captions" | "audio" | "description" | "chapters">;
}

export class SourceInsufficientContentError extends Error {
  constructor() {
    super("소스에서 카드뉴스에 사용할 내용을 찾지 못했습니다. 내용이 있는 원문을 제공해 주세요.");
    this.name = "SourceInsufficientContentError";
  }
}

export function createTextSource(input: { id: string; title?: string; text: string; sourceUrl?: string }): SourceDocument {
  const text = input.text.trim();
  if (!text) throw new SourceInsufficientContentError();
  return {
    id: input.id,
    kind: "text",
    title: input.title ?? "직접 입력 소스",
    originalInput: text,
    segments: [{ id: `src_${input.id}#offset=0`, text, sourceUrl: input.sourceUrl }],
  };
}

export type IngestSourceKind =
  | "youtube_video"
  | "youtube_channel"
  | "rss"
  | "community"
  | "naver_news"
  | "official_ai";

export interface IngestSource {
  id: string;
  userId: string;
  name: string;
  kind: IngestSourceKind;
  url: string;
  intervalHours: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastCheckedAt?: string;
  nextPollAt: string;
  leaseUntil?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RawCandidate {
  externalId: string;
  title: string;
  url: string;
  body?: string;
  summary?: string;
  author?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestAdapter {
  kind: IngestSourceKind;
  fetch(source: IngestSource): Promise<RawCandidate[]>;
  /** 중복 확인을 통과한 새 항목만 비싼 본문 추출·자막 수집을 한다. */
  hydrate?(item: RawCandidate, source: IngestSource): Promise<RawCandidate>;
}

export class IngestAdapterRegistry {
  private readonly adapters = new Map<IngestSourceKind, IngestAdapter>();

  constructor(adapters: IngestAdapter[] = []) {
    for (const adapter of adapters) this.adapters.set(adapter.kind, adapter);
  }

  register(adapter: IngestAdapter): void {
    this.adapters.set(adapter.kind, adapter);
  }

  get(kind: IngestSourceKind): IngestAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) throw new Error(`${kind} 수집 어댑터가 설치되지 않았습니다.`);
    return adapter;
  }

  kinds(): IngestSourceKind[] {
    return [...this.adapters.keys()];
  }
}
