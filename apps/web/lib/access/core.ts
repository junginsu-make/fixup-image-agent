import type { UserRole } from "../membership/types";

/**
 * 누가 무엇을 볼 수 있는가 — 판단을 모아 두는 곳.
 *
 * 전에는 이 판단이 화면과 라우트에 흩어져 있었다. 같은 질문("관리자는 남의
 * 것을 볼 수 있나")을 열다섯 군데가 각자 답했고, 그러다 어긋났다 —
 * 2026-09-04 에 목록은 전체로 넓히고 상세는 그대로 두어, 관리자에게 목록은
 * 뜨는데 열리지는 않는 상태가 났다.
 *
 * 여기 있는 것은 **순수 함수뿐**이다. DB 도 세션도 만지지 않는다. 그래야
 * 이 판단만 따로 시험할 수 있고, 시험이 곧 규칙 문서가 된다.
 *
 * 판단은 세 종류로 갈린다. 섞으면 안 된다.
 *
 *   `scope()`          어느 **행**을 만질 수 있나 — 목록·상세·지우기가 함께 쓴다
 *   `canAccessPage()`  어느 **주소**를 열 수 있나 — 미들웨어와 페이지 문지기가 쓴다
 *   `can*()`           특정 **기능**을 쓸 수 있나 — 지식 관리, 올린 사람 이메일 보기
 */

/** 판단에 필요한 것만. 프로필 전체를 넘기면 무엇을 보고 정했는지 흐려진다. */
export interface Viewer {
  userId: string;
  role: UserRole;
}

/**
 * 무엇을 하려는가.
 *
 * **`export` 가 따로 있는 이유**: 「보기」와 「가공해 파일로 내려받기」는 무게가
 * 다르다. 전체가 열린 사람에게 보기·지우기를 연 근거는 「잘못 올라온 것을 치울
 * 방법이 없다」였는데(`server-library.ts`), 그것은 **보고 지우는** 일이다.
 * 광고 규격 내보내기는 ZIP 이 만들어지는 순간 서비스 밖으로 나가고 그 안에는
 * 누구 것인지 안 적힌다.
 *
 * **역할을 지어내 넘기는 방식은 쓰지 않는다.** 호출부에서 `role: "member"` 로
 * 바꿔 부르면 `api/ad/__tests__/ad-export-route.test.ts` 의 「본문에 실린 역할을
 * 믿지 않는다」가 막으려던 그 관례가 되고, 한 번 생기면 다른 라우트로 번진다.
 * 역할은 그대로 넘기고 **액션 이름으로 가른다.**
 */
export type ScopeAction = "read" | "delete" | "export";

/**
 * 이 사람이 만질 수 있는 범위.
 *
 * 문자열이나 `null` 대신 종류를 붙인 값으로 돌려준다. 예전 `libraryScope` 는
 * 소유자 id 아니면 `null` 을 줬는데, 부르는 쪽이 그 `null` 을 그대로
 * `.eq("user_id", null)` 에 넘겨 **한 줄도 못 지우면서 오류도 안 나는** 길이
 * 열려 있었다(2026-09-04 에 고쳤다). 종류가 붙어 있으면 그 실수를 타입이 막는다.
 */
export type Scope =
  | { kind: "all" }
  | { kind: "user"; userId: string };

/**
 * 무엇을 만질 수 있나.
 *
 * **관리자는 보기도 지우기도 전부 통과한다.** 한동안 지우기는 자기 것만
 * 두었는데, 잘못 올라온 것을 내릴 사람이 아무도 없으면 그대로 남는다는
 * 운영자의 판단으로 2026-09-04 에 넓혔다.
 *
 * 팀 기능이 들어오면 **이 함수 하나만** 고친다 — 그때 `{ kind: "team" }` 이
 * 하나 늘고, 부르는 쪽은 그대로다. 그것이 이 함수를 만든 이유다.
 */
export function scope(viewer: Viewer, action: ScopeAction): Scope {
  // 내보내기는 전체가 열린 사람도 자기 것만이다.
  if (action === "export") return { kind: "user", userId: viewer.userId };
  if (viewer.role === "admin") return { kind: "all" };
  return { kind: "user", userId: viewer.userId };
}

/** 이 줄을 만질 수 있나. 목록을 이미 걸러 왔더라도 상세에서 다시 본다. */
export function canTouch(viewer: Viewer, ownerId: string, action: ScopeAction): boolean {
  const allowed = scope(viewer, action);
  return allowed.kind === "all" || allowed.userId === ownerId;
}

/**
 * 질의에 걸 소유자 조건. 조건이 필요 없으면 `undefined` 다.
 *
 * `null` 이 아니라 `undefined` 인 것이 중요하다. `null` 은 「값이 비어 있다」로
 * 읽혀 그대로 질의에 넘어가지만, `undefined` 는 「조건 자체가 없다」라서
 * 넘기면 타입이 막는다.
 */
export function ownerFilter(viewer: Viewer, action: ScopeAction): string | undefined {
  const allowed = scope(viewer, action);
  return allowed.kind === "all" ? undefined : allowed.userId;
}

/**
 * 전체가 열렸나.
 *
 * 「관리자 전용 길로 갈지, 회원용 길로 갈지」를 가르는 자리에 쓴다. 그 갈래를
 * 없애지 않는 이유가 있다 — 회원용 길에 「관리자면 조건을 뺀다」를 심으면,
 * 언젠가 그 조건이 어긋나 회원이 남의 것을 만진다. 길을 나눠 두면 어긋나도
 * 회원 쪽은 안전하다.
 */
export function hasFullScope(viewer: Viewer, action: ScopeAction): boolean {
  return scope(viewer, action).kind === "all";
}

/**
 * 세션에서 꺼낸 것으로 판단 대상을 만든다.
 *
 * 부르는 쪽마다 `{ userId: auth.member.userId, role: auth.member.profile.role }`
 * 을 손으로 적으면, 언젠가 한 곳이 다른 값을 집는다.
 */
export function viewerFrom(member: { userId: string; profile: { role: UserRole } }): Viewer {
  return { userId: member.userId, role: member.profile.role };
}

/* ── 주소 문지기 ──────────────────────────────────────────────── */

/**
 * 한 주소에 걸린 규칙.
 *
 * 규칙은 코드가 아니라 **설정**이다(`app_settings` 의 `page_access_config`).
 * 화면을 하나 막거나 여는 데 배포가 필요하면, 급할 때 못 막는다.
 */
export interface PageRule {
  /** 이 역할만 들어온다. 비어 있으면 역할로 막지 않는다. */
  allowedRoles?: UserRole[];
}

export type AccessConfig = Record<string, PageRule>;

/**
 * 이 주소를 열 수 있나.
 *
 * **긴 경로가 이긴다.** `/admin` 과 `/admin/costs` 가 둘 다 규칙에 있으면
 * 뒤엣것이 적용되어야 한다. 먼저 찾은 것을 쓰면 객체 열쇠 순서에 따라
 * 답이 달라진다 — 그건 규칙이 아니라 우연이다.
 */
export function canAccessPage(path: string, viewer: Viewer, config: AccessConfig): boolean {
  // 관리자는 전부 통과한다. 이 한 줄이 없으면 화면을 새로 만들 때마다
  // 설정에 관리자를 적어 넣어야 하고, 한 번 빠뜨리면 운영자가 못 들어간다.
  if (viewer.role === "admin") return true;

  const key = Object.keys(config)
    .filter((candidate) => path === candidate || path.startsWith(`${candidate}/`))
    .sort((a, b) => b.length - a.length)[0];

  // 규칙이 없으면 연다. 새 화면이 조용히 막히는 것보다, 막을 것을 적는 편이
  // 눈에 띈다 — 안 막힌 화면은 곧 발견되지만, 안 열리는 화면은 신고가 온다.
  if (!key) return true;

  const rule = config[key];
  if (!rule.allowedRoles?.length) return true;
  return rule.allowedRoles.includes(viewer.role);
}

/* ── 기능 권한 ────────────────────────────────────────────────── */

/**
 * 리디자인의 사전 지식을 관리할 수 있나.
 *
 * 행 접근이 아니라 **기능**이다. `scope()` 와 섞으면 「관리자가 볼 수 있는
 * 것」과 「관리자만 할 수 있는 일」이 한 판단이 되어, 나중에 팀장에게 하나만
 * 열어 주고 싶을 때 둘 다 열린다.
 */
export function canManageKnowledge(viewer: Viewer): boolean {
  return viewer.role === "admin";
}

/**
 * 올린 사람의 이메일을 볼 수 있나.
 *
 * 참고 이미지는 회원 공용이라 남이 올린 것도 목록에 나온다. 회원에게는
 * 「내 것인가」만 알려주면 되고, 누구인지까지 알려 줄 이유가 없다.
 */
export function canSeeOwnerEmails(viewer: Viewer): boolean {
  return viewer.role === "admin";
}
