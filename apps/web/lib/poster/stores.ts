import "server-only";

import { isLocalStoreEnabled } from "../local-store";
import { localPosterStores } from "./local-store";
import { supabasePosterStores } from "./supabase-store";

/**
 * 저장소를 고른다.
 *
 * 로컬 파일과 운영 Supabase 는 같은 인터페이스를 채운다. 어느 쪽이든 화면과
 * 흐름은 같은 코드를 탄다 — 두 모드가 다르게 동작하면 로컬에서 확인한 것이
 * 운영에서 확인한 것이 아니게 된다.
 */
export function posterStoresForUser(userId: string) {
  return isLocalStoreEnabled() ? localPosterStores(userId) : supabasePosterStores(userId);
}
