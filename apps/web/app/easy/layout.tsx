import type { ReactNode } from "react";
import { requireActiveMember } from "../../lib/membership/server";
import { StudioLayout } from "../_components/studio-layout";
import { easyStoreForUser } from "../../lib/easy/store";
import { EasyDashboard } from "./_components/dashboard";

/**
 * Easy 모드도 **다른 도구와 같은 셸 안**에 산다 (2026-09-21 사용자).
 *
 * ── 뒤집은 판단 ──────────────────────────────────────────────
 *
 * 설계 §4 와 2026-09-17 결정은 반대였다 — 「`StudioLayout` 을 감싸면 사이드바에
 * 도구가 여섯 개 걸리고, 그러면 「쉬운 모드」가 아니다」.
 *
 * 써 보고 사용자가 뒤집었다. 「스튜디오에서 카드뉴스를 만들든 이미지를 만들든
 * 오른쪽 대시보드에서만 기능들이 표시되고 사이드바나 상단바는 고정되는데
 * **이지모드만 페이지가 완전히 바뀝니다.**」
 *
 * 도구가 여섯 개 보이는 것이 벽이라고 봤는데, 실제로 벽이 된 것은 **어디에
 * 와 있는지 모르게 되는 것**이었다. 다른 도구에서 오던 사람이 Easy 를 누르면
 * 화면이 통째로 갈리고, 돌아가는 길이 왼쪽 아래 작은 글씨 하나였다.
 *
 * ── 그래서 여기가 하는 일은 둘뿐이다 ─────────────────────────
 *
 *   `fill`          입력창이 아래에 붙어 있어야 해서 페이지가 늘어나면 안 된다
 *   대화 목록 칸     사이드바에 있던 것을 **대시보드 안 첫 칸**으로 옮겼다
 *
 * 나머지 — 회원 확인 · 상단바 · 사이드바 · `RunningJobsProvider` — 는 전부
 * 셸이 한다. **두 벌로 살던 것이 한 벌이 됐다.**
 */

export const dynamic = "force-dynamic";

export default async function EasyLayout({ children }: { children: ReactNode }) {
  /*
   * 셸도 안에서 같은 것을 부른다. **여기서도 불러야 하는 까닭은 목록 때문이다** —
   * 어느 회원의 대화를 읽을지 알아야 한다. 읽기뿐이라 두 번 불러도 같다.
   */
  const membership = await requireActiveMember();
  // 목록을 서버에서 한 번 읽어 넘긴다. 첫 그림에 빈 칸이 보이지 않게.
  const conversations = await easyStoreForUser(membership.user.id).listConversations();

  return (
    <StudioLayout fill>
      {/*
        대시보드 안을 셋으로 나눈다 — **대화 목록 · 대화 · 결과**.
        나누는 일은 `EasyDashboard` 가 한다. 구분선을 끌 수 있으려면 상태가
        있어야 하고, 그것은 서버 부품인 여기서 못 든다.
      */}
      <EasyDashboard conversations={conversations}>{children}</EasyDashboard>
    </StudioLayout>
  );
}
