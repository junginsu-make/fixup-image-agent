import "server-only";

import { getMembership } from "../../../lib/membership/server";
import { canAccessPage, viewerFrom } from "../../../lib/access/core";
import { PAGE_ACCESS } from "../../../lib/access/routes";

/**
 * 설명서를 보는 사람이 관리자인가.
 *
 * **판단을 여기 적지 않는다.** 등록부(`lib/access/routes.ts`)를 보는 같은
 * 함수에 묻는다 — 미들웨어와 페이지 문지기가 쓰는 그 함수다. 「관리자인가」를
 * 여기서 다시 적으면 언젠가 셋이 갈리고, 그러면 **메뉴에는 있는데 안 열리는
 * 장**이 생긴다.
 *
 * 설명서는 활성 회원만 들어오므로 회원 정보가 없을 일은 드물다. 없으면
 * 관리자가 아닌 쪽으로 본다 — 모를 때 더 많이 보여 주는 쪽이 위험하다.
 */
export async function isAdminReader(): Promise<boolean> {
  const membership = await getMembership();
  if (!membership) return false;
  return canAccessPage(
    "/admin",
    viewerFrom({ userId: membership.user.id, profile: membership.profile }),
    PAGE_ACCESS,
  );
}
