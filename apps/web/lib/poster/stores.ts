import "server-only";

import { isLocalStoreEnabled } from "../local-store";
import { localPosterStores } from "./local-store";

/**
 * 저장소를 고른다.
 *
 * 지금은 로컬 파일만 있다. 운영 Supabase 구현은 계획 4(배포)에서 붙인다 —
 * 그때 마이그레이션을 처음 적용한다. 없는 것을 있는 척하지 않고 여기서
 * 이유를 남기고 멈춘다.
 */
export function posterStoresForUser(userId: string) {
  if (isLocalStoreEnabled()) return localPosterStores(userId);
  throw new Error(
    "포스터 저장소가 아직 운영 DB 에 연결되지 않았습니다. 배포 단계에서 설정합니다.",
  );
}
