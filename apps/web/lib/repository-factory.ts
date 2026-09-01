import "server-only";

import { createCandidateService } from "../app/api/candidates/candidate-service";
import { createSupabaseCandidateRepository } from "../app/api/candidates/candidate-store";
import { createReferenceSetStore } from "../app/api/reference-sets/reference-set-store";
import { createSourceService } from "../app/api/sources/source-service";
import { createSupabaseSourceRepository } from "../app/api/sources/source-store";
import { createProjectService } from "../app/api/sns/projects/project-service";
import { createSupabaseSnsProjectRepository } from "../app/api/sns/projects/project-store";
import {
  createLocalCandidateRepository,
  createLocalReferenceSetStore,
  createLocalSourceRepository,
  createLocalSnsProjectRepository,
  getLocalDatabase,
  isLocalStoreEnabled,
} from "./local-store";
import { createSupabaseServerClient } from "./supabase/server";

export async function sourceServiceForUser(userId: string) {
  if (isLocalStoreEnabled()) {
    return createSourceService(createLocalSourceRepository(getLocalDatabase(), userId));
  }
  return createSourceService(createSupabaseSourceRepository(await createSupabaseServerClient()));
}

export async function candidateServiceForUser(userId: string) {
  if (isLocalStoreEnabled()) {
    return createCandidateService(createLocalCandidateRepository(getLocalDatabase(), userId));
  }
  return createCandidateService(createSupabaseCandidateRepository(await createSupabaseServerClient()));
}

export async function referenceSetStoreForUser(userId: string) {
  if (isLocalStoreEnabled()) return createLocalReferenceSetStore(getLocalDatabase(), userId);
  return createReferenceSetStore(await createSupabaseServerClient());
}

export async function snsProjectServiceForUser(userId: string) {
  if (isLocalStoreEnabled()) {
    return createProjectService(createLocalSnsProjectRepository(getLocalDatabase(), userId));
  }
  return createProjectService(createSupabaseSnsProjectRepository(await createSupabaseServerClient()));
}
