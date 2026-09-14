import "server-only";
import { recordedImageRun } from "./recorded-image";
import { readCachedResult, writeCachedResult } from "./result-cache";
import { haltRecordedCalls } from "../llm/recorded-call";

/** Freeze resolved character bytes / knowledge before downstream paid calls. */
export async function rememberGenerationInput<T>(name: string, prepare: () => Promise<T>): Promise<T> {
  const run = recordedImageRun();
  if (!run) return prepare();
  const key = `input-${name}`;
  try {
    const existing = await readCachedResult<T>(run, key);
    if (existing !== undefined) return existing;
    const value = await prepare();
    try { await writeCachedResult(run, value, key); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "result_conflict") throw error;
      const committed = await readCachedResult<T>(run, key);
      if (committed === undefined) throw error;
      return committed;
    }
    return value;
  } catch { throw haltRecordedCalls("storage_unavailable"); }
}
