import path from "node:path";
import { isLocalStoreEnabled, localStoreRoot } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { createLocalJobRepository } from "./local-repository";
import { createSupabaseJobRepository } from "./supabase-repository";
import type { PdpJobRepository } from "./repository";

/** 깃발은 잎 모듈에 있다. 한 줄 읽으려고 저장소 구현을 끌어오지 않게. */
export { isPdpJobsEnabled } from "./flags";
export * from "./state";
export * from "./claim";
export type { CreateJobInput, CreateJobResult, JobItemRecord, JobRecord, PdpJobRepository } from "./repository";

/**
 * 어느 저장소를 쓸 것인가.
 *
 * **로컬은 파일, 운영은 Supabase.** 판정은 기존 `isLocalStoreEnabled` 하나를
 * 그대로 쓴다 — 여기서 `process.env` 를 다시 읽으면 판정이 두 벌이 되고,
 * 그중 하나만 고치는 날 로컬이 운영 DB 를 건드린다.
 *
 * 그 함수는 `NODE_ENV === "production"` 이면 무조건 거짓이다. 운영에 로컬
 * 저장소가 켜질 길이 없다.
 */
export function createPdpJobRepository(
  environment: NodeJS.ProcessEnv = process.env,
): PdpJobRepository {
  if (isLocalStoreEnabled(environment)) {
    return createLocalJobRepository(path.join(localStoreRoot(environment), "pdp-jobs"));
  }
  return createSupabaseJobRepository(createSupabaseAdminClient());
}
