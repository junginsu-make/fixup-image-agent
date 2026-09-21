import { isLocalStoreEnabled } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";

/**
 * 저장해 둔 그림을 **잠깐 볼 수 있는 주소**로 바꾼다.
 *
 * 버킷은 비공개다(`202607280001_server_library.sql`). 상세페이지는 출시 전
 * 기획물이라 주소만 알면 누구나 보는 상태가 되면 안 된다. 그래서 짧게 사는
 * 서명 주소를 그때그때 만든다.
 */

const BUCKET = "library";
/** 한 시간. 화면을 열어 두고 보는 동안은 끊기지 않고, 흘러도 곧 죽는다. */
const TTL_SECONDS = 3600;

export async function signJobArtifacts(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  // 로컬은 파일로만 두므로 서명할 것이 없다.
  if (isLocalStoreEnabled()) return {};

  const { data } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(paths, TTL_SECONDS);

  const signed: Record<string, string> = {};
  for (const entry of data ?? []) {
    /*
      **항목마다 실패할 수 있다.** 하나가 없다고 나머지를 버리면, 여덟 장 중
      한 장이 잘못됐을 때 일곱 장을 함께 잃는다. 못 만든 것만 빠진다.
    */
    if (entry.path && entry.signedUrl) signed[entry.path] = entry.signedUrl;
  }
  return signed;
}
