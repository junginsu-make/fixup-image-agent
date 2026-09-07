import Link from "next/link";
import { Crown, UserMinus, Users } from "lucide-react";
import { Badge, Button, Input } from "@fixup/ui";
import { requireActiveMember } from "../../lib/membership/server";
import { canWriteTeam, summarize } from "../../lib/teams/core";
import type { TeamWithMembers } from "../../lib/teams/core";
import {
  countActiveMembers,
  countWorkFor,
  listTeams,
  listUnassigned,
  myMembership,
} from "../../lib/teams/store";
import { ConfirmSubmitButton } from "../admin/confirm-submit-button";
import {
  archiveTeamAction,
  createTeamAction,
  removeMemberAction,
  setMemberRoleAction,
} from "./actions";
import { AssignPanel, type Candidate } from "./assign-panel";
import { ProjectsTab } from "./projects-tab";
import { WorksTab } from "./works-tab";
import { CreditTab } from "./credit-tab";
import { listProjectsWithCounts, listTeamWorks } from "../../lib/teams/project-store";
import { teamCredit } from "../../lib/teams/store";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  team_created: "팀을 만들었습니다.",
  team_renamed: "팀 이름을 바꿨습니다.",
  team_archived: "팀을 접었습니다. 작업물은 만든 사람의 개인 작업으로 돌아갔습니다.",
  assigned: "팀에 넣었습니다. 만들어 둔 작업물도 함께 옮겼습니다.",
  promoted: "팀장으로 세웠습니다.",
  demoted: "팀원으로 내렸습니다.",
  removed: "팀에서 뺐습니다. 작업물은 개인 작업으로 돌아갔습니다.",
  project_created: "프로젝트를 만들었습니다.",
  project_renamed: "프로젝트 이름을 바꿨습니다.",
  project_archived: "프로젝트를 접었습니다. 작업물은 그대로 있고 「전체」로 돌아갔습니다.",
  work_moved: "작업물을 옮겼습니다.",
  team_quota_set: "팀 한도를 정했습니다.",
  personal_quota_set: "개인 상한을 바꿨습니다.",
};

/** 한 화면 세 탭. 주소에 실어서 각 탭이 자기 것만 서버에서 읽는다. */
const TABS = [
  { id: "members", label: "팀원" },
  { id: "projects", label: "프로젝트" },
  { id: "credit", label: "크레딧" },
  { id: "works", label: "작업물" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; tab?: string; team?: string }>;
}) {
  const { notice, tab, team: teamParam } = await searchParams;
  const active: TabId = TABS.some((entry) => entry.id === tab) ? (tab as TabId) : "members";
  const member = await requireActiveMember();
  const isAdmin = member.profile.role === "admin";
  const mine = await myMembership(member.user.id);

  // 운영자는 전부, 그 밖은 자기 팀만. 남의 팀 이름과 명단을 아예 안 보낸다 —
  // 화면에서 감추는 것과 안 보내는 것은 다르다.
  const allTeams = await listTeams();
  const teams = isAdmin ? allTeams : allTeams.filter((team) => team.id === mine?.teamId);

  const canAssign =
    active === "members" && teams.some((team) => canWriteTeam(isAdmin, mine, team.id));
  const [unassigned, totalMembers] = canAssign
    ? await Promise.all([listUnassigned(), countActiveMembers()])
    : [[], 0];

  // 고르기 전에 무엇이 따라가는지 말한다. 배정한 뒤에 알면 늦다.
  const workCounts = await countWorkFor(unassigned.map((row) => row.userId));
  const candidates: Candidate[] = unassigned.map((row) => ({
    userId: row.userId,
    email: row.email,
    workCount: workCounts.get(row.userId) ?? 0,
  }));

  const assignedCount = allTeams.reduce((sum, team) => sum + team.members.length, 0);
  const stats = summarize(allTeams, assignedCount, totalMembers);

  /**
   * 프로젝트와 작업물은 **한 팀 것**이다.
   *
   * 팀원은 자기 팀이다. 운영자는 팀이 여럿일 수 있어 하나를 골라야 하는데,
   * 안 고르면 첫 팀으로 둔다 — 「팀을 고르세요」만 뜬 빈 화면을 만들지 않는다.
   */
  const focusTeamId = isAdmin
    ? (teams.find((entry) => entry.id === teamParam)?.id ?? teams[0]?.id ?? null)
    : (mine?.teamId ?? null);
  const canWriteFocus = focusTeamId ? canWriteTeam(isAdmin, mine, focusTeamId) : false;

  const projects = active === "members" ? [] : await listProjectsWithCounts(focusTeamId);
  const works = active === "works" ? await listTeamWorks(focusTeamId) : [];
  const credit =
    active === "credit" && focusTeamId
      ? await teamCredit(focusTeamId)
      : { quota: 0, members: [] };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">팀</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "팀을 만들고 회원을 배정합니다. 팀에 넣으면 그 사람이 만들어 둔 작업물도 함께 팀으로 갑니다."
              : "우리 팀 명단입니다. 같은 팀 사람이 만든 작업물은 서로 볼 수 있습니다."}
          </p>
        </div>
        {isAdmin && active === "members" ? (
          <form action={createTeamAction} className="flex items-center gap-2">
            <Input
              name="name"
              required
              maxLength={60}
              placeholder="새 팀 이름"
              className="h-9 w-48"
              aria-label="새 팀 이름"
            />
            <ConfirmSubmitButton
              // **첫 팀을 만들면 그날 참고 이미지가 나뉜다.** 지금은 회원
              // 전원이 서로의 본보기를 보는데, 팀이 하나라도 생기면 같은 팀
              // 것만 보인다. 조용히 좁히면 고장 신고가 들어온다.
              confirmMessage={
                allTeams.length === 0
                  ? [
                      "첫 팀을 만듭니다.",
                      "",
                      "지금은 회원 전원이 서로의 참고 이미지를 볼 수 있지만, 팀을 만든 뒤에는 같은 팀 것만 보입니다. 팀에 배정되지 않은 사람은 자기 것만 보게 됩니다.",
                      "",
                      "회원들에게 미리 알리셨나요?",
                    ].join("\n")
                  : "새 팀을 만듭니다. 계속할까요?"
              }
              pendingLabel="만드는 중..."
            >
              팀 만들기
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </header>

      {notice && NOTICES[notice] ? (
        <p className="rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
          {NOTICES[notice]}
        </p>
      ) : null}

      {/* 통계 바 — 카드 넷 대신 밑줄 하나. 세로 공간을 거의 안 쓴다. 이 화면의
          주인공은 숫자가 아니라 명단이다. */}
      <TabBar active={active} focusTeamId={isAdmin ? focusTeamId : null} />

      {isAdmin && active === "members" ? (
        <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y py-3 text-sm">
          <Stat label="팀" value={`${stats.teams}개`} />
          <Stat label="배정" value={`${stats.assigned}명`} />
          <Stat
            label="미배정"
            value={`${stats.unassigned}명`}
            // 소속 없는 사람이 목록 아래에 묻히면 새로 가입한 회원이 영영
            // 팀에 못 들어간다. 0 이 아닐 때만 눈에 띄게 한다.
            urgent={stats.unassigned > 0}
          />
          <Stat label="배정률" value={`${Math.round(stats.ratio * 100)}%`} />
        </dl>
      ) : null}

      {active === "projects" ? (
        <>
          {isAdmin && teams.length > 1 ? (
            <TeamSwitch teams={teams} focusTeamId={focusTeamId} tab="projects" />
          ) : null}
          <ProjectsTab teamId={focusTeamId} projects={projects} canWrite={canWriteFocus} />
        </>
      ) : active === "credit" ? (
        <>
          {isAdmin && teams.length > 1 ? (
            <TeamSwitch teams={teams} focusTeamId={focusTeamId} tab="credit" />
          ) : null}
          <CreditTab teamId={focusTeamId} credit={credit} canWrite={canWriteFocus} />
        </>
      ) : active === "works" ? (
        <>
          {isAdmin && teams.length > 1 ? (
            <TeamSwitch teams={teams} focusTeamId={focusTeamId} tab="works" />
          ) : null}
          <WorksTab
            teamId={focusTeamId}
            works={works}
            projects={projects}
            canWrite={canWriteFocus}
          />
        </>
      ) : teams.length === 0 ? (
        <EmptyState isAdmin={isAdmin} />
      ) : (
        <div className="grid gap-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              canWrite={canWriteTeam(isAdmin, mine, team.id)}
              isAdmin={isAdmin}
              candidates={candidates}
              viewerId={member.user.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 한 화면 세 탭. 주소로 오가서 각 탭이 서버에서 자기 것만 읽는다. */
function TabBar({ active, focusTeamId }: { active: TabId; focusTeamId: string | null }) {
  return (
    <nav className="flex gap-1 border-b" aria-label="팀 화면 탭">
      {TABS.map((entry) => {
        const on = entry.id === active;
        // 고른 팀을 탭을 옮겨도 유지한다. 안 그러면 운영자가 탭마다 팀을
        // 다시 고르게 된다.
        const href = focusTeamId
          ? `/team?tab=${entry.id}&team=${focusTeamId}`
          : `/team?tab=${entry.id}`;
        return (
          <Link
            key={entry.id}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
              on
                ? "border-primary text-primary"
                : "border-transparent text-subtle-foreground hover:text-foreground"
            }`}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 운영자가 어느 팀을 볼지. 팀이 둘 이상일 때만 나온다. */
function TeamSwitch({
  teams,
  focusTeamId,
  tab,
}: {
  teams: TeamWithMembers[];
  focusTeamId: string | null;
  tab: TabId;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-meta text-subtle-foreground">팀</span>
      {teams.map((team) => (
        <Link
          key={team.id}
          href={`/team?tab=${tab}&team=${team.id}`}
          className={`rounded-full border px-2.5 py-1 text-sm transition-colors ${
            team.id === focusTeamId
              ? "border-primary/40 bg-primary-soft font-bold text-primary"
              : "border-border hover:bg-muted/40"
          }`}
        >
          {team.name}
        </Link>
      ))}
    </div>
  );
}

function Stat({ label, value, urgent = false }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-meta text-subtle-foreground">{label}</dt>
      <dd className={`text-base font-bold tabular-nums ${urgent ? "text-primary" : ""}`}>{value}</dd>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
      <Users className="h-6 w-6 text-subtle-foreground" />
      <p className="text-sm font-bold">
        {isAdmin ? "아직 팀이 없습니다" : "아직 팀에 속해 있지 않습니다"}
      </p>
      <p className="max-w-sm text-meta text-subtle-foreground">
        {isAdmin
          ? "오른쪽 위에서 팀 이름을 적어 만드세요. 만든 뒤 회원을 넣으면 그 사람의 작업물도 함께 팀으로 갑니다."
          : "운영자나 팀장이 팀에 넣어 주면 여기에 명단이 나옵니다. 그때까지 만든 작업물은 나만 볼 수 있습니다."}
      </p>
    </div>
  );
}

function TeamCard({
  team,
  canWrite,
  isAdmin,
  candidates,
  viewerId,
}: {
  team: TeamWithMembers;
  canWrite: boolean;
  isAdmin: boolean;
  candidates: Candidate[];
  viewerId: string;
}) {
  const leaders = team.members.filter((row) => row.role === "leader").length;

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">{team.name}</h2>
          <Badge variant="secondary">{team.members.length}명</Badge>
          {leaders === 0 ? (
            // 팀장이 없으면 그 팀은 팀장 쪽에서 아무도 못 꾸린다. 조용히 두면
            // 왜 버튼이 없는지 알 수 없다.
            <Badge variant="destructive">팀장 없음</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <AssignPanel teamId={team.id} teamName={team.name} candidates={candidates} />
          ) : null}
          {isAdmin ? (
            <form action={archiveTeamAction}>
              <input type="hidden" name="teamId" value={team.id} />
              <ConfirmSubmitButton
                variant="ghost"
                confirmMessage={`「${team.name}」을 접습니다. 팀원 ${team.members.length}명의 작업물은 각자의 개인 작업으로 돌아갑니다. 계속할까요?`}
                pendingLabel="접는 중..."
              >
                접기
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </header>

      {team.members.length === 0 ? (
        <p className="px-4 py-8 text-center text-meta text-subtle-foreground">
          아직 팀원이 없습니다.{canWrite ? " 「팀원 넣기」로 회원을 넣으세요." : ""}
        </p>
      ) : (
        <ul className="divide-y">
          {team.members.map((row) => (
            <li key={row.userId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span
                className={`grid h-7 w-7 flex-none place-items-center rounded-full border text-[11px] font-bold ${
                  row.role === "leader"
                    ? "border-primary/40 bg-primary-soft text-primary"
                    : "border-border bg-background text-subtle-foreground"
                }`}
                aria-hidden
              >
                {row.email.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{row.email}</span>
                <span className="block text-meta text-subtle-foreground">
                  {row.role === "leader" ? "팀장" : "팀원"} · {row.joinedAt.slice(0, 10)}
                  {row.userId === viewerId ? " · 나" : ""}
                </span>
              </span>

              {canWrite ? (
                <span className="flex items-center gap-1.5">
                  <form action={setMemberRoleAction}>
                    <input type="hidden" name="userId" value={row.userId} />
                    <input
                      type="hidden"
                      name="role"
                      value={row.role === "leader" ? "member" : "leader"}
                    />
                    <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
                      <Crown
                        className={`h-3.5 w-3.5 ${
                          row.role === "leader" ? "text-primary" : "text-subtle-foreground"
                        }`}
                      />
                      {row.role === "leader" ? "팀원으로" : "팀장으로"}
                    </Button>
                  </form>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={row.userId} />
                    <ConfirmSubmitButton
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-subtle-foreground"
                      confirmMessage={`${row.email} 을 「${team.name}」에서 뺍니다. 이 사람의 작업물은 개인 작업으로 돌아가고, 팀원들은 더 이상 볼 수 없습니다. 계속할까요?`}
                      pendingLabel="빼는 중..."
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      빼기
                    </ConfirmSubmitButton>
                  </form>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
