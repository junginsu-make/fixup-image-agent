import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * 저장소 파일을 볼 수 있는 주소로 바꾼다.
 *
 * ── 왜 서버 권한으로 서명하나 ─────────────────────────────────────
 *
 * Storage 정책이 경로의 **첫 칸을 소유자로 본다**(`foldername(name)[1] =
 * auth.uid()`). 경로가 `{user_id}/{item_id}/0.png` 모양이라, 회원 세션으로는
 * 남의 파일에 서명할 수 없다.
 *
 * 팀이 생기면 그 자리가 막힌다 — 같은 팀 사람의 그림을 목록에 걸 수 없다.
 * 고치는 길이 둘인데 하나는 안 한다.
 *
 *   파일을 `{team_id}/…` 로 옮긴다   객체를 전부 복사하고 표의 경로를 다시
 *                                    쓰고, 옮기는 도중에 만들어진 것을 또
 *                                    쫓아가야 한다. 팀이 바뀔 때마다 반복이고
 *                                    되돌리기가 거의 불가능하다.
 *
 *   서명을 서버 권한으로 한다        파일을 한 개도 안 옮긴다. 라이브러리·
 *                                    참고 이미지·캐릭터가 **이미 그렇게 하고
 *                                    있다** — 나머지 둘을 맞추는 것이라 오히려
 *                                    코드가 한 모양이 된다.
 *
 * ── 그럼 무엇이 막아 주나 ─────────────────────────────────────────
 *
 * **경로를 고르는 쪽이 막는다.** 여기 들어오는 경로는 전부
 *
 *   · RLS 를 지나 읽어 온 행에서 꺼낸 것이거나
 *   · 방금 그 회원 id 로 만들어 올린 것
 *
 * 이다. 이 함수는 「이 경로를 볼 자격이 있나」를 묻지 않는다 — 그 판단은 행을
 * 읽을 때 이미 끝났다. **바깥에서 받은 경로를 그대로 넘기면 안 된다.**
 *
 * Storage 정책은 그대로 둔다. 세션 권한으로 새는 길이 생기면 거기서 막힌다.
 */

/** 여러 장을 한 번에. 실패한 것은 지도에서 빠진다 — 한 장 때문에 목록이 죽지 않게. */
export async function signPaths(
  bucket: string,
  paths: readonly string[],
  ttlSeconds: number,
): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const admin = createSupabaseAdminClient();
  const signed = await admin.storage.from(bucket).createSignedUrls([...paths], ttlSeconds);
  if (signed.error) throw new Error(signed.error.message);
  return new Map(
    (signed.data ?? []).flatMap((entry) => (
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
    )),
  );
}

/** 한 장. 못 만들면 던진다 — 부르는 쪽이 그 주소 없이는 할 일이 없다. */
export async function signPath(
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const result = await admin.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "이미지 주소를 만들지 못했습니다.");
  }
  return result.data.signedUrl;
}
