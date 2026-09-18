import type { ReactNode } from "react";
import { requireActiveMember } from "../../lib/membership/server";
import { RunningJobsProvider } from "../_components/running-jobs";
import { easyStoreForUser } from "../../lib/easy/store";
import { EasyRail } from "./_components/rail";

/**
 * Easy 모드의 **제 레이아웃** (설계 §4).
 *
 * ── 지금 셸을 안 쓴다 ────────────────────────────────────────
 *
 * `StudioLayout` 을 감싸지 않는다. 그것을 감싸면 사이드바에 도구가 여섯 개
 * 걸리고, **그러면 「쉬운 모드」가 아니다**(2026-09-17 사용자 결정).
 *
 * 이 저장소는 셸을 뿌리에서 강제하지 않는다 — 화면마다 `StudioLayout` 을 직접
 * 골라 감싼다. 그래서 안 감싸면 된다. 뿌리 `app/layout.tsx` 는 테마와 글꼴만
 * 준다.
 *
 * ── 그래도 해야 하는 것 둘 ───────────────────────────────────
 *
 * `StudioLayout` 이 하던 일 중 둘은 Easy 도 해야 한다.
 *
 *   `requireActiveMember()`  안 부르면 문이 열린 채가 된다
 *   `RunningJobsProvider`    그림이 도착하는 길이다
 *
 * 나머지(사이드바·상단바·프로젝트 목록·사용량 표시)는 안 쓴다.
 */

export const dynamic = "force-dynamic";

export default async function EasyLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMember();
  // 레일의 목록을 서버에서 한 번 읽어 넘긴다. 첫 그림에 빈 레일이 보이지 않게.
  const conversations = await easyStoreForUser(membership.user.id).listConversations();

  return (
    <RunningJobsProvider>
      {/*
        **한 화면에 딱 맞춘다.** 대화는 스스로 스크롤하고 입력창은 아래에
        붙어 있어야 한다. 페이지 전체가 늘어나면 입력창이 화면 밖으로 밀린다.
      */}
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <EasyRail conversations={conversations} email={membership.profile.email} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </RunningJobsProvider>
  );
}
