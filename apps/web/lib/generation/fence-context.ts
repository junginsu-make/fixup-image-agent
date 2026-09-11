import { AsyncLocalStorage } from "node:async_hooks";
import type { GenerationRun } from "./types";
const context = new AsyncLocalStorage<GenerationRun>();
export function withGenerationFence<T>(run: GenerationRun, call: () => Promise<T>): Promise<T> { return context.run(run, call); }
export function generationFence() { return context.getStore(); }
export function assertLocalGenerationFence(data: unknown) {
  const fence = generationFence();
  if (!fence) return;
  const run = (data as { generationRuns?: GenerationRun[] }).generationRuns?.find(r => r.id === fence.id);
  if (!run || run.user_id !== fence.user_id || run.lease_token !== fence.lease_token || !run.lease_until || Date.parse(run.lease_until) <= Date.now()
    || ["succeeded", "failed", "cancelled", "needs_reconciliation"].includes(run.state)) throw new Error("lease_lost");
}
