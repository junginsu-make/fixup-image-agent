import { OFFICIAL_AI_PRESETS, type SourceInput, type SourcePatch } from "./schema";

export type SourceKind = SourceInput["kind"];

export interface SourceRecord {
  id: string;
  userId: string;
  kind: SourceKind;
  name: string;
  url: string;
  intervalHours: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastCheckedAt: string | null;
  nextPollAt: string;
  lastError: string | null;
}

export type SourceCreateRecord = Omit<SourceRecord, "id" | "lastCheckedAt" | "nextPollAt" | "lastError">;
export type SourceUpdateRecord = Partial<Pick<SourceRecord, "name" | "url" | "intervalHours" | "enabled" | "config">>;

export interface SourceRepository {
  list(): Promise<SourceRecord[]>;
  insert(row: SourceCreateRecord): Promise<SourceRecord>;
  update(id: string, patch: SourceUpdateRecord): Promise<SourceRecord>;
  remove(id: string): Promise<void>;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
}

export function sourceConfig(input: SourceInput): Record<string, unknown> {
  switch (input.kind) {
    case "youtube_channel": return { maxItems: input.maxItems };
    case "rss": return { maxItems: input.maxItems };
    case "community": return compact({
      itemSelector: input.itemSelector,
      linkSelector: input.linkSelector,
      titleSelector: input.titleSelector,
      excerptSelector: input.excerptSelector,
      authorSelector: input.authorSelector,
      dateSelector: input.dateSelector,
      thumbnailSelector: input.thumbnailSelector,
      maxItems: input.maxItems,
    });
    case "naver_news": return { queries: input.queries, display: input.display, maxItems: input.maxItems };
    case "official_ai": return { provider: input.provider };
    default: return {};
  }
}

export function sourceUrl(input: SourceInput): string {
  if (input.kind === "naver_news") return "https://openapi.naver.com/v1/search/news.json";
  if (input.kind === "official_ai") return OFFICIAL_AI_PRESETS[input.provider].url;
  return input.url;
}

export function createSourceService(repository: SourceRepository) {
  return {
    list: () => repository.list(),
    create: (userId: string, input: SourceInput) => repository.insert({
      userId,
      kind: input.kind,
      name: input.name,
      url: sourceUrl(input),
      intervalHours: input.intervalHours,
      enabled: true,
      config: sourceConfig(input),
    }),
    update: (id: string, patch: SourcePatch) => repository.update(id, patch),
    remove: (id: string) => repository.remove(id),
  };
}
