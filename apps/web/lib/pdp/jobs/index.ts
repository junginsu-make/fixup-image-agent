import path from "node:path";
import { isLocalStoreEnabled, localStoreRoot } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { createLocalJobRepository } from "./local-repository";
import { createSupabaseJobRepository } from "./supabase-repository";
import type { PdpJobRepository } from "./repository";

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

/**
 * 작업 경로를 켰는가.
 *
 * **기본은 꺼짐이다**(설계 §15). 표가 없거나 워커가 안 떠 있는 상태에서 켜지면
 * 사용자는 만들기를 아예 못 한다. 운영에 표와 실행기가 모두 준비된 것을 확인한
 * 뒤에 켠다.
 */
export function isPdpJobsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.PDP_JOBS_ENABLED === "1";
}
