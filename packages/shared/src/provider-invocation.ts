/** Optional server instrumentation; pure domain packages do not import the database. */
export interface ProviderInvocation {
  kind: "llm" | "image";
  provider: "openai" | "google" | "anthropic" | "fal";
  model: string;
  request: Record<string, unknown>;
  maxOutputTokens?: number;
}
export type InvokeProvider = <T>(meta: ProviderInvocation, call: () => Promise<T>) => Promise<T>;
