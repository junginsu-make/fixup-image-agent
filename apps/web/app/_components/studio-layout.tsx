import type { ReactNode } from "react";
import { AppShell } from "@fixup/ui";
import { requireActiveMember, getUsageSummary } from "../../lib/membership/server";
import { canAccessPage, viewerFrom } from "../../lib/access/core";
import { PAGE_ACCESS } from "../../lib/access/routes";
import { GuideLink } from "./guide-link";
import { ReferenceHuntButton } from "./reference-hunt-button";
import { myMembership } from "../../lib/teams/store";
import { listProjectsWithCounts } from "../../lib/teams/project-store";
import { currentProjectId } from "../../lib/teams/current-project";
import { selectProjectAction } from "../team/actions";
import { RunningJobsPanel, RunningJobsProvider } from "./running-jobs";
import { StudioActions } from "./studio-actions";

export async function StudioLayout({ children }: { children: ReactNode }) {
  const membership = await requireActiveMember();
  const usage = await getUsageSummary(membership.user.id);
  // 팀 메뉴는 소속이 있을 때만 낸다. 팀이 하나도 없는 회사에서 모두에게
  // 보이면, 눌러 봐야 빈 화면이라 메뉴만 늘어난다.
  const team = await myMembership(membership.user.id);

  // 프로젝트는 팀 아래에만 있다. 혼자 쓰는 사람에게는 목록 자체가 안 나온다.
  const projects = await listProjectsWithCounts(team?.teamId ?? null);
  const currentProject = await currentProjectId(projects);
  return (
    // 만드는 중인 것들은 셸 바깥에 둔다. 화면을 옮겨도 이 자리는 다시 만들어지지
    // 않으므로, 다른 화면으로 가도 결과를 계속 받아 올 수 있다.
    <RunningJobsProvider>
      <AppShell
        // 메뉴에 관리자를 낼지도 등록부가 정한다. 미들웨어가 문을 여는 기준과
        // 같은 곳에서 나와야, 「메뉴엔 있는데 안 열리는」 일이 안 생긴다.
        isAdmin={canAccessPage("/admin", viewerFrom({
          userId: membership.user.id,
          profile: membership.profile,
        }), PAGE_ACCESS)}
        hasTeam={Boolean(team)}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          workCount: project.workCount,
        }))}
        currentProjectId={currentProject}
        onSelectProject={selectProjectAction}
        sidebarFooter={<RunningJobsPanel />}
        actions={
          <StudioActions email={membership.profile.email} usage={usage}>
            {/* 앱 밖으로 나가는 문. 홈·랜딩에는 이 셸이 안 붙으므로 거기엔 안 나온다. */}
            <ReferenceHuntButton />
            <GuideLink />
          </StudioActions>
        }
      >
        {children}
      </AppShell>
    </RunningJobsProvider>
  );
}
