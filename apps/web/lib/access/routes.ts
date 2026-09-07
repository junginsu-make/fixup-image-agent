import type { AccessConfig } from "./core";
import type { UserRole } from "../membership/types";

/**
 * 화면 등록부 — **누가 들어올 수 있나를 정하는 한 곳.**
 *
 * 전에는 이 사실이 세 군데에 흩어져 있었다.
 *
 *   미들웨어      `pathname.startsWith("/admin") && role !== "admin"`
 *   페이지 문지기  `requireAdmin()`
 *   사이드바      `isAdmin ? [...bottomItems, adminItem] : bottomItems`
 *
 * 세 곳이 각자 「관리자」를 알고 있으니, 화면을 하나 늘릴 때마다 세 군데를
 * 손봐야 한다. 한 곳이라도 빠뜨리면 **메뉴에는 있는데 안 열리는 화면**이나,
 * 더 나쁘게는 **메뉴에 없는데 주소를 치면 열리는 화면**이 생긴다.
 *
 * 여기 한 줄을 적으면 셋이 함께 따라온다.
 *
 * ── 아직 코드에 두는 이유 ─────────────────────────────────────────
 *
 * 설계에서는 이 규칙을 DB(`app_settings`)에 두기로 했다. 배포 없이 화면을
 * 막을 수 있어야 하기 때문이다. 지금은 코드에 둔다 — 미들웨어는 **모든 요청**
 * 마다 도는데, 거기서 설정을 한 번 더 읽으면 그 값을 캐시하는 이야기가 따라
 * 붙는다. 역할로 갈리는 화면이 지금 하나(`/admin`)뿐이라 그 값을 치를 때가
 * 아니다.
 *
 * 옮길 때 부르는 쪽은 안 바뀐다. `canAccessPage()` 가 이미 설정을 받는 모양이라,
 * 여기서 만드는 것 대신 DB 에서 읽은 것을 넣으면 된다.
 */

export interface AppRoute {
  path: string;
  /** 사이드바와 권한 화면에 함께 쓸 이름. */
  label: string;
  /** 이 역할만 들어온다. 없으면 활성 회원 누구나. */
  requiredRole?: UserRole;
}

export const APP_ROUTES: AppRoute[] = [
  { path: "/guide", label: "사용 설명서" },
  { path: "/sns", label: "카드뉴스 만들기" },
  { path: "/poster", label: "이미지 만들기" },
  { path: "/create", label: "상세페이지 만들기" },
  { path: "/redesign", label: "상세 페이지 리디자인" },
  { path: "/characters", label: "캐릭터 만들기" },
  { path: "/inbox", label: "수집함" },
  { path: "/sources", label: "수집 리스트" },
  { path: "/library", label: "라이브러리" },
  { path: "/settings", label: "계정" },
  { path: "/admin", label: "관리자", requiredRole: "admin" },
];

/**
 * 등록부에서 뽑아낸 접근 규칙.
 *
 * 역할이 걸린 것만 담는다. 규칙이 없는 화면은 `canAccessPage()` 가 연다 —
 * 새 화면이 조용히 막히는 것보다, 막을 것을 적는 편이 눈에 띈다.
 */
export const PAGE_ACCESS: AccessConfig = Object.fromEntries(
  APP_ROUTES
    .filter((route): route is AppRoute & { requiredRole: UserRole } => Boolean(route.requiredRole))
    .map((route) => [route.path, { allowedRoles: [route.requiredRole] }]),
);
