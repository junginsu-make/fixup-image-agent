import { createHash } from "node:crypto";

/**
 * 참고 이미지 **복사본의 id** — 만드는 규칙과 알아보는 규칙을 한 곳에 둔다.
 *
 * 관리자가 다른 회원의 그림을 복사해 오면(`api/admin/works/store.ts` 의
 * `copyReferencesToSelf`), 그 복사본은 관리자 소유이면서 **원본의 팀 범위**를
 * 따른다. 그런데 팀 배정·해제·이동(`lib/teams/store.ts`)은 `user_id` 로 그 사람
 * 그림의 팀을 통째로 바꾼다. 그러면 관리자가 팀에서 빠지는 순간 복사본이
 * **전 회원 공개**(`team_id = null`)가 된다 — 2026-09-16 독립 리뷰가 짚었고,
 * 운영에 팀에 든 관리자가 실제로 있었다.
 *
 * 표에 「복사본」 칸을 더하면 마이그레이션이 따라붙는다. 대신 **id 형식**으로
 * 가른다.
 *
 * - 복사본은 **uuid 5**(여기서 만든다)
 * - 나머지는 전부 **uuid 4** — `randomUUID()`·`gen_random_uuid()`·화면의
 *   `randomId()` 가 다 4 다(운영 74장 전부 4 확인)
 * - 화면이 id 를 정해 보내는 올리기 주소는 **4 만 받는다**(`isOrdinaryReferenceId`)
 *   — 그래야 5 가 복사본만의 표시로 남는다
 * - 회원이 표에 **직접** 넣는 권한은 거뒀다(`202609160002_revoke_member_reference_insert.sql`)
 *   — 열려 있으면 이 검사를 안 거치고 아무 판의 id 로 넣을 수 있었다
 *
 * **이 검사를 안 거치는 길이 하나 남아 있다** — `scripts/migrate-local-to-supabase.mjs`
 * 가 로컬 id 를 그대로 넣는다. 로컬 id 도 `randomUUID()`(4)로 만들어져 실제 위험은
 * 없지만, 그 스크립트로 다른 곳의 자료를 옮길 일이 생기면 먼저 여기를 보라.
 *
 * `server-only` 를 붙이지 않는다 — 시험에서 값으로 잰다. `node:crypto` 를 쓰므로
 * 화면 쪽에서 부르면 안 된다.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** uuid 판 번호. uuid 가 아니면 `null`. */
function versionOf(id: string): string | null {
  const match = UUID.exec(id);
  return match ? match[1]! : null;
}

/**
 * 복사본의 id — **같은 그림을 같은 사람이 복사하면 늘 같다.**
 *
 * 01 을 누를 때마다 새로 복사하면 관리자 라이브러리에 같은 그림이 쌓인다.
 * 「원래 그림 + 복사한 사람」에서 만들어 두 번째부터는 이미 있는 행을 쓴다.
 */
export function adoptedReferenceId(originalId: string, ownerId: string): string {
  const hex = createHash("sha1").update(`adopted-reference:${ownerId}:${originalId}`).digest("hex");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** 관리자가 복사해 온 그림인가. **팀 이동에서 빼야 한다.** */
export function isAdoptedReferenceId(id: string): boolean {
  return versionOf(id) === "5";
}

/**
 * 화면이 정해 보낸 id 를 받아도 되나. **uuid 4 만.**
 *
 * 5 를 받으면 누구나 자기 그림을 「복사본」으로 꾸며 팀 이동을 비껴갈 수 있다.
 */
export function isOrdinaryReferenceId(id: string): boolean {
  return versionOf(id) === "4";
}
