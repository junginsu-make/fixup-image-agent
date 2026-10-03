/**
 * 저장 위치가 그 주인의 폴더(`<ownerId>/…`) 안인가 — 서버 권한으로 저장소를 부르기 **직전에** 본다.
 *
 * 서버는 줄에 적힌 위치를 서버 권한으로 서명·다운로드·삭제한다. 그 위치가 남의 폴더를
 * 가리키면 남의 그림이 열리거나(생성 재료로도) 지워진다(2026-10-03 보안 리뷰). 주인은
 * **위치를 적은 줄의 `user_id`** 다 — 부르는 사람이 아니다(팀 공유 줄은 주인이 따로 있다).
 *
 * storage-js 는 위치를 인코딩 없이 주소에 붙이고, 주소 해석은 `%2e%2e` 를 `..` 로 풀고
 * 탭·줄바꿈을 지우고 역슬래시를 빗금으로 읽는다. 그래서 앞머리만 맞춰서는 빠져나간다 —
 * `..`·`%`·역슬래시·공백·제어 문자가 있으면 막는다. DB 의 카드 위치 제약
 * (`202610030002_member_path_writes.sql`)과 같은 규칙이고, 2026-10-03 운영의 위치 170여 건이
 * 모두 이 규칙을 통과했다(정상 그림을 숨기지 않는다).
 */
const ESCAPES = /\.\.|%|\\|[\s\p{Cc}]/u;

export function inOwnerFolder(path: unknown, ownerId: string): path is string {
  if (typeof path !== "string" || !ownerId || ownerId.includes("/")) return false;
  const prefix = `${ownerId}/`;
  return path.startsWith(prefix) && path.length > prefix.length && !ESCAPES.test(path);
}

/** 주인 폴더 안의 위치만 남긴다. 빈 값도 뺀다. */
export function onlyInOwnerFolder(paths: ReadonlyArray<unknown>, ownerId: string): string[] {
  return paths.filter((path): path is string => inOwnerFolder(path, ownerId));
}
