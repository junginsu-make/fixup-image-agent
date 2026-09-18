import type { ReactNode } from "react";
import { ThemeToggle } from "@fixup/ui";
import { requireActiveMember, getUsageSummary } from "../../lib/membership/server";
import { RunningJobsProvider } from "../_components/running-jobs";
import { StudioActions } from "../_components/studio-actions";
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
 * ── 그래도 상단바는 있어야 한다 ──────────────────────────────
 *
 * 처음에는 상단바를 통째로 뺐는데, **어느 계정으로 들어와 있는지·얼마나 썼는지·
 * 나가는 길이 사라졌다**(2026-09-18 사용자 보고). 그것들은 도구 목록이 아니라
 * **어느 화면에나 있어야 하는 것**이다.
 *
 * 그래서 `StudioActions` 를 그대로 쓴다. 다른 화면과 같은 부품이라 계정 표시와
 * 사용량 셈이 갈리지 않는다.
 *
 * ── 그래도 해야 하는 것 둘 ───────────────────────────────────
 *
 *   `requireActiveMember()`  안 부르면 문이 열린 채가 된다
 *   `RunningJobsProvider`    그림이 도착하는 길이다
 */

export const dynamic = "force-dynamic";

export default async function EasyLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMember();
  const usage = await getUsageSummary(membership.user.id);
  // 레일의 목록을 서버에서 한 번 읽어 넘긴다. 첫 그림에 빈 레일이 보이지 않게.
  const conversations = await easyStoreForUser(membership.user.id).listConversations();

  return (
    <RunningJobsProvider>
      {/*
        **한 화면에 딱 맞춘다.** 대화는 스스로 스크롤하고 입력창은 아래에
        붙어 있어야 한다. 페이지 전체가 늘어나면 입력창이 화면 밖으로 밀린다.
      */}
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <EasyRail conversations={conversations} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            **상단바.** 계정·사용량·테마·로그아웃이 여기 고정된다.

            대화는 아래에서 스스로 스크롤하므로 이 줄은 늘 보인다 — `shrink-0`
            이 없으면 대화가 길어질 때 이 줄이 눌려 사라진다.
          */}
          <header className="flex shrink-0 items-center justify-end gap-1.5 border-b border-border px-3 py-2">
            <StudioActions email={membership.profile.email} usage={usage}>
              <ThemeToggle />
            </StudioActions>
          </header>

          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </div>
    </RunningJobsProvider>
  );
}
