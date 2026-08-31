import { z } from "zod";

const common = {
  name: z.string().trim().min(1).max(60),
  intervalHours: z.number().int().min(1).max(168),
};

const url = z.string().url();
const maxItems = z.number().int().min(1).max(50).default(20);

export const OFFICIAL_AI_PRESETS = {
  openai: { label: "OpenAI", url: "https://openai.com/news/rss.xml" },
  anthropic: { label: "Anthropic Claude", url: "https://platform.claude.com/docs/en/release-notes/feed.xml" },
  google: { label: "Google Gemini", url: "https://ai.google.dev/gemini-api/docs/changelog?hl=en" },
  meta: { label: "Meta AI", url: "https://ai.meta.com/blog/" },
  xai: { label: "xAI Grok", url: "https://x.ai/news?category=all" },
  deepseek: { label: "DeepSeek", url: "https://api-docs.deepseek.com/updates/" },
} as const;

const OfficialProviderSchema = z.enum(["openai", "anthropic", "google", "meta", "xai", "deepseek"]);

export const SourceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("youtube_video"), ...common, url }).strict(),
  z.object({ kind: z.literal("youtube_channel"), ...common, url, maxItems }).strict(),
  z.object({ kind: z.literal("rss"), ...common, url, maxItems }).strict(),
  z.object({
    kind: z.literal("community"), ...common, url,
    itemSelector: z.string().trim().min(1).max(200),
    linkSelector: z.string().trim().max(200).optional(),
    titleSelector: z.string().trim().max(200).optional(),
    excerptSelector: z.string().trim().max(200).optional(),
    authorSelector: z.string().trim().max(200).optional(),
    dateSelector: z.string().trim().max(200).optional(),
    thumbnailSelector: z.string().trim().max(200).optional(),
    maxItems,
  }).strict(),
  z.object({
    kind: z.literal("naver_news"), ...common,
    queries: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
    display: z.number().int().min(1).max(100).default(10),
    maxItems: z.number().int().min(1).max(100).default(20),
  }).strict(),
  z.object({ kind: z.literal("official_ai"), ...common, provider: OfficialProviderSchema }).strict(),
]);

export const SourcePatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  url: z.string().url().optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "바꿀 값을 하나 이상 보내 주세요.");

export type SourceInput = z.infer<typeof SourceInputSchema>;
export type SourcePatch = z.infer<typeof SourcePatchSchema>;
