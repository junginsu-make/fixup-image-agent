import type { ReactNode } from "react";
import { AppShell } from "@fixup/ui";
import { requireActiveMember, getUsageSummary } from "../../lib/membership/server";
import { GuideDialog } from "./guide-dialog";
import { ReferenceHuntButton } from "./reference-hunt-button";
import { RunningJobsPanel, RunningJobsProvider } from "./running-jobs";
import { StudioActions } from "./studio-actions";

export async function StudioLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMember();
  const usage = await getUsageSummary(membership.user.id);
  return (
    // 만드는 중인 것들은 셸 바깥에 둔다. 화면을 옮겨도 이 자리는 다시 만들어지지
    // 않으므로, 다른 화면으로 가도 결과를 계속 받아 올 수 있다.
    <RunningJobsProvider>
      <AppShell
        isAdmin={membership.profile.role === "admin"}
        sidebarFooter={<RunningJobsPanel />}
        actions={
          <StudioActions email={membership.profile.email} usage={usage}>
            {/* 앱 밖으로 나가는 문. 홈·랜딩에는 이 셸이 안 붙으므로 거기엔 안 나온다. */}
            <ReferenceHuntButton />
            <GuideDialog />
          </StudioActions>
        }
      >
        {children}
      </AppShell>
    </RunningJobsProvider>
  );
}
