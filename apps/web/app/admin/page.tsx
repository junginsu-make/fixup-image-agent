import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, Clock3, ImageIcon, Search, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@fixup/ui";
import type { MemberProfile } from "../../lib/membership/types";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { listTeams, teamsOf } from "../../lib/teams/store";
import { TeamCell } from "./team-cell";
import { MoreActions } from "./member-actions";
import { isAiBadgeEnabled } from "../../lib/ai-badge-setting";
import { approveMember, deleteMember, moveShowcase, removeShowcase, resendApproval, resendConfirmation, setMemberStatus, updateAiBadge, updateQuota, updateShowcase } from "./actions";
import { listShowcaseForAdmin } from "../api/showcase/store";
import type { ShowcaseAdminView } from "../api/showcase/core";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { CostPanel } from "./CostPanel";
import {
  formatKrw,
  getCostByMember,
  getCostByModel,
  getCostByOperation,
  getCostDaily,
  getCostSummary,
  getModelPrices,
  getUsdKrw,
} from "../../lib/cost";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type AdminPageParams = { q?: string; status?: string; page?: string; notice?: string };
type DailyUsage = { usage_date: string; consumed_units: number | string };
type TopUsage = { user_id: string; email: string; consumed_units: number | string };
type MemberUsage = { user_id: string; consumed_units: number | string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageParams> }) {
  const params = await searchParams;
  const admin = createSupabaseAdminClient();
  const page = Math.max(1, Number(params.page || 1));
  let query = admin
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (params.q) query = query.ilike("email", `%${params.q.replace(/[%_,]/g, "")}%`);
  if (["pending", "active", "suspended"].includes(params.status || "")) {
    query = query.eq("status", params.status!);
  }

  const { data: rawProfiles, count, error: profilesError } = await query.range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1,
  );
  if (profilesError) throw profilesError;
  const profiles = (rawProfiles ?? []) as MemberProfile[];
  const profileIds = profiles.map((profile) => profile.id);
  /**
   * 이 쪽 사람들이 각각 어느 팀인가.
   *
   * 팀 편성은 `/team` 이 하지만, **운영자가 회원을 보는 곳은 여기다.** 여기에
   * 팀이 안 보이면 「이 사람 어느 팀이지」를 물으러 화면을 옮겨야 한다.
   */
  const teamByUser = await teamsOf(profileIds);
  // 고르개에 넣을 팀 목록. 명단에서 바로 배정하려면 무엇이 있는지 알아야 한다.
  const teamOptions = (await listTeams()).map((team) => ({ id: team.id, name: team.name }));

  const [totalResult, pendingResult, summaryResult, dailyResult, topResult, memberUsageResult] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.rpc("admin_usage_summary"),
    admin.rpc("admin_usage_daily", { p_days: 30 }),
    admin.rpc("admin_usage_top", { p_limit: 10 }),
    profileIds.length
      ? admin.rpc("admin_member_usage", { p_user_ids: profileIds })
      : Promise.resolve({ data: [] as MemberUsage[], error: null }),
  ]);

  const metricError = [totalResult.error, pendingResult.error, summaryResult.error, dailyResult.error, topResult.error, memberUsageResult.error].find(Boolean);
  if (metricError) throw metricError;

  // 실제로 나간 돈. 장수와 따로 집계한다 — 모델마다 단가가 4배 넘게 차이 난다.
  const [usdKrw, costSummary, costByMember, costByOperation, costByModel, costDaily, modelPrices, aiBadgeOn] =
    await Promise.all([
      getUsdKrw(),
      getCostSummary(),
      getCostByMember(profileIds),
      getCostByOperation(30),
      getCostByModel(30),
      getCostDaily(30),
      getModelPrices(),
      isAiBadgeEnabled(),
    ]);

  /**
   * 첫 화면에 걸린 것들.
   *
   * **못 읽어도 던지지 않는다.** 이 표는 나중에 붙은 것이라, 마이그레이션을
   * 아직 안 돌린 서버에서는 없다. 그 한 줄 때문에 회원 승인까지 막히면 안
   * 된다 — 못 읽었으면 `null` 로 두고 패널에서 그렇게 말한다.
   */
  const showcase = await listShowcaseForAdmin().catch(() => null);

  const summary = (summaryResult.data?.[0] ?? { today_units: 0, month_units: 0 }) as {
    today_units: number | string;
    month_units: number | string;
  };
  const daily = (dailyResult.data ?? []) as DailyUsage[];
  const top = (topResult.data ?? []) as TopUsage[];
  const usageByUser = new Map(
    ((memberUsageResult.data ?? []) as MemberUsage[]).map((row) => [row.user_id, Number(row.consumed_units)]),
  );
  const notice = params.notice;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">관리자</h1>
        <p className="mt-1 text-body text-muted-foreground">회원 승인, 상태, 월 한도와 실제 성공 이미지 사용량을 관리합니다.</p>
        {/*
          **월 한도의 뜻이 팀과 함께 바뀌었다.** 팀에 든 사람에게는 이 값이
          「팀 잔량 안에서의 천장」이다. 100 으로 올려 둬도 팀 잔량이 40 이면
          40 에서 막힌다 — 그 사실을 여기서 말하지 않으면 운영자는 한도를
          올렸는데 왜 막히는지 알 수 없다.
        */}
        <p className="mt-1 text-meta text-subtle-foreground">
          팀에 속한 회원의 월 한도는 <strong>팀 잔량 안에서의 천장</strong>입니다. 팀 잔량이 더 적으면
          그쪽이 먼저 걸립니다 — 팀 한도는 <Link href="/team?tab=credit" className="underline underline-offset-4">팀 · 크레딧</Link>에서 정합니다.
        </p>
      </div>

      {notice ? <AdminNotice notice={notice} /> : null}

      {/*
        **비용 전략실로 가는 문.**

        이 도구는 기존 시스템과 이어져 있지 않다 — 운영 DB 도 크레딧 장부도
        건드리지 않고, 모델별 단가를 코드에서 읽어다 만든 **가상 계산기**다.
        그래서 관리자 화면 안에 지표로 섞지 않고 **따로 선 화면**으로 둔다.

        `<a>` 다. `next/link` 로 걸면 Next 가 React 화면을 기대하고 미리
        가져오는데, 저쪽은 완성된 HTML 한 장이라 라우터가 다룰 물건이 아니다.
      */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="grid gap-1">
            <p className="text-sm font-bold">비용 전략실</p>
            <p className="text-sm text-muted-foreground">
              판매가·크레딧·마진을 바꿔 보는 <strong>가상 시뮬레이션</strong>입니다. 실제 요금이나 장부는
              바뀌지 않습니다.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            {/*
              **같은 창에서 연다.** 이 화면도 시스템의 한 화면이라 사이드바와
              머리말을 그대로 쓴다 — 새 창으로 띄우면 밖으로 나간 것처럼 된다.
            */}
            <Link href="/admin/cost-lab">열기</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users />} label="전체 회원" value={totalResult.count ?? 0} />
        <Metric icon={<Clock3 />} label="승인 대기" value={pendingResult.count ?? 0} />
        <Metric icon={<ImageIcon />} label="오늘 생성" value={Number(summary.today_units)} suffix="장" />
        <Metric icon={<BarChart3 />} label="이번 달 생성" value={Number(summary.month_units)} suffix="장" />
      </div>

      <CostPanel
        summary={costSummary}
        usdKrw={usdKrw}
        byOperation={costByOperation}
        byModel={costByModel}
        daily={costDaily}
        prices={modelPrices}
      />

      <AiBadgePanel enabled={aiBadgeOn} />

      <ShowcasePanel items={showcase} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <UsageChart daily={daily} />
        <TopUsers users={top} />
      </div>

      <Card>
        <CardHeader><CardTitle>회원 목록</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-2 sm:flex sm:flex-wrap">
            <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input name="q" defaultValue={params.q} className="pl-9" placeholder="이메일 검색" />
            </div>
            <select name="status" defaultValue={params.status || ""} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">전체 상태</option>
              <option value="pending">승인 대기</option>
              <option value="active">활성</option>
              <option value="suspended">정지</option>
            </select>
            <Button type="submit" variant="outline" className="w-full sm:w-auto">검색</Button>
          </form>

          <div className="grid gap-3 md:hidden">
            {profiles.map((profile) => (
              <article key={profile.id} className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 break-all font-semibold leading-5">
                      {profile.email}
                      {profile.role === "admin" ? <Badge variant="secondary">운영자</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {profile.email_confirmed_at ? "이메일 인증 완료" : "이메일 미인증"} · 가입 {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                      {profile.approved_at
                        ? ` · 승인 ${new Date(profile.approved_at).toLocaleDateString("ko-KR")}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge profile={profile} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs text-muted-foreground">이번 달 사용</dt>
                    <dd className="mt-1 text-lg font-extrabold">{usageByUser.get(profile.id) ?? 0}장</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs text-muted-foreground">팀</dt>
                    <dd className="mt-1">
                      <TeamCell
                        userId={profile.id}
                        email={profile.email}
                        team={teamByUser.get(profile.id)}
                        teams={teamOptions}
                      />
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs text-muted-foreground">현재 월 한도</dt>
                    <dd className="mt-1 text-lg font-extrabold">{profile.monthly_quota}장</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs text-muted-foreground">이번 달 비용</dt>
                    <dd className="mt-1 text-lg font-extrabold">
                      {formatKrw(costByMember.get(profile.id)?.monthUsd ?? 0, usdKrw)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <dt className="text-xs text-muted-foreground">누적 비용</dt>
                    <dd className="mt-1 text-lg font-extrabold">
                      {formatKrw(costByMember.get(profile.id)?.totalUsd ?? 0, usdKrw)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t pt-4">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">월 한도 변경</p>
                  <QuotaForm profile={profile} fullWidth />
                </div>
                <div className="mt-4 border-t pt-4">
                  <p className="mb-2 text-xs font-bold text-muted-foreground">회원 관리</p>
                  <MemberActions profile={profile} fullWidth />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr><th className="py-3 pr-3">회원</th><th className="py-3 pr-3">팀</th><th className="py-3 pr-3">상태</th><th className="py-3 pr-3">이번 달</th><th className="py-3 pr-3">이번 달 비용</th><th className="py-3 pr-3">누적 비용</th><th className="py-3 pr-3">월 한도</th><th className="py-3">관리</th></tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-b align-top">
                    <td className="py-4 pr-3">
                      {/*
                        `<p>` 가 아니라 `<div>` 다. `Badge` 는 `<div>` 이고,
                        HTML 은 `<p>` 안에 `<div>` 를 못 넣는다 — 넣으면
                        브라우저가 `<p>` 를 강제로 닫아 서버가 보낸 것과 화면이
                        어긋나고 hydration 오류가 난다.
                      */}
                      <div className="flex items-center gap-1.5 font-medium">
                        {profile.email}
                        {/*
                          운영자를 명단에서 알아볼 수 있어야 한다. 지우기가 왜
                          저 줄에만 없는지, 이 사람이 왜 남의 것을 다 보는지가
                          여기서 설명된다.
                        */}
                        {profile.role === "admin" ? <Badge variant="secondary">운영자</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {profile.email_confirmed_at ? "이메일 인증" : "미인증"} · 가입 {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                        {profile.approved_at
                          ? ` · 승인 ${new Date(profile.approved_at).toLocaleDateString("ko-KR")}`
                          : ""}
                      </p>
                    </td>
                    <td className="py-4 pr-3">
                      <TeamCell
                        userId={profile.id}
                        email={profile.email}
                        team={teamByUser.get(profile.id)}
                        teams={teamOptions}
                      />
                    </td>
                    <td className="py-4 pr-3"><StatusBadge profile={profile} /></td>
                    <td className="py-4 pr-3 font-medium">{usageByUser.get(profile.id) ?? 0}장</td>
                    <td className="py-4 pr-3 font-medium">
                      {formatKrw(costByMember.get(profile.id)?.monthUsd ?? 0, usdKrw)}
                    </td>
                    <td className="py-4 pr-3 text-muted-foreground">
                      {formatKrw(costByMember.get(profile.id)?.totalUsd ?? 0, usdKrw)}
                      <span className="ml-1 text-xs">
                        · {(costByMember.get(profile.id)?.images ?? 0).toLocaleString()}장
                      </span>
                    </td>
                    <td className="py-4 pr-3">
                      <QuotaForm profile={profile} />
                    </td>
                    <td className="py-4">
                      <MemberActions profile={profile} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!profiles.length ? <p className="py-10 text-center text-muted-foreground">조건에 맞는 회원이 없습니다.</p> : null}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>총 {count ?? 0}명</span>
            <div className="flex gap-2">
              {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={adminHref(params, page - 1)}>이전</Link></Button> : null}
              {page * PAGE_SIZE < (count ?? 0) ? <Button asChild variant="outline" size="sm"><Link href={adminHref(params, page + 1)}>다음</Link></Button> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageChart({ daily }: { daily: DailyUsage[] }) {
  const max = Math.max(1, ...daily.map((row) => Number(row.consumed_units)));
  return (
    <Card>
      <CardHeader><CardTitle>최근 30일 생성 추이</CardTitle></CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-1" aria-label="최근 30일 성공 이미지 생성량">
          {daily.map((row) => {
            const units = Number(row.consumed_units);
            return (
              <div key={row.usage_date} className="flex h-full min-w-0 flex-1 items-end" title={`${row.usage_date}: ${units}장`}>
                <div className="w-full rounded-t bg-primary/80" style={{ height: units ? `${Math.max(4, (units / max) * 100)}%` : "2px" }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{daily[0]?.usage_date ?? "-"}</span><span>{daily.at(-1)?.usage_date ?? "-"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function TopUsers({ users }: { users: TopUsage[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>이번 달 사용 상위 회원</CardTitle></CardHeader>
      <CardContent>
        {users.length ? (
          <ol className="space-y-3">
            {users.map((user, index) => (
              <li key={user.user_id} className="flex items-center gap-3 text-sm">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate" title={user.email}>{user.email}</span>
                <strong>{Number(user.consumed_units).toLocaleString()}장</strong>
              </li>
            ))}
          </ol>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">이번 달 생성 내역이 없습니다.</p>}
      </CardContent>
    </Card>
  );
}

/**
 * 첫 화면 갤러리 알림.
 *
 * 아래 사슬에 매달지 않고 표로 뺀다. 다섯 개를 더 이으면 무엇이 무엇의
 * 짝인지 눈으로 못 따라간다.
 */
const SHOWCASE_NOTICE: Record<string, string> = {
  showcase_on: "다시 첫 화면에 겁니다.",
  showcase_off: "첫 화면에서 내렸습니다. 그림은 그대로 두었으니 언제든 다시 켤 수 있습니다.",
  showcase_saved: "문구를 저장했습니다.",
  showcase_moved: "차례를 바꿨습니다.",
  showcase_removed: "첫 화면에서 지웠습니다. 원본 작업물은 그대로 있습니다.",
};

/**
 * 팀 편성 알림.
 *
 * 아래 삼항 사슬이 이미 길다. 거기 더 이으면 무엇이 무엇인지 못 읽는다.
 */
const TEAM_NOTICE: Record<string, string> = {
  team_assigned: "팀에 넣었습니다. 이 회원이 만든 작업물과 참고 이미지도 함께 팀으로 갔습니다.",
  team_removed: "팀에서 뺐습니다. 작업물과 참고 이미지는 개인 것으로 돌아갔습니다.",
  team_promoted: "팀장으로 세웠습니다.",
  team_demoted: "팀원으로 내렸습니다.",
};

function AdminNotice({ notice }: { notice: string }) {
  const failed = notice === "approved_email_failed";
  const message = TEAM_NOTICE[notice] ?? SHOWCASE_NOTICE[notice] ?? (notice === "approved"
    ? "회원 승인과 이메일 발송을 완료했습니다."
    : notice === "email_sent"
      ? "승인 이메일을 다시 보냈습니다."
      : notice === "price_updated"
        ? "단가를 저장했습니다. 지난 기록의 금액도 새 단가로 다시 계산됩니다."
        : notice === "rate_updated"
          ? "환율을 저장했습니다."
          : notice === "deleted"
            ? "회원을 지웠습니다. 그 회원이 만든 것도 함께 사라졌습니다."
            : notice === "confirm_sent"
              ? "이메일 인증 메일을 다시 보냈습니다. 본인이 링크를 누르면 승인할 수 있습니다."
              : notice === "confirm_rate_limited"
                ? "조금 전에 보냈습니다. 1분쯤 뒤에 다시 눌러 주세요."
                : notice === "badge_on"
                  ? "이제부터 만드는 그림에 \"AI 이미지\" 표기를 붙입니다."
                  : notice === "badge_off"
                    ? "이제부터 만드는 그림에는 표기를 붙이지 않습니다. 이미 만들어 둔 그림은 그대로입니다."
            : "회원은 승인됐지만 이메일 발송에 실패했습니다. SMTP 설정 확인 후 재발송해 주세요.");
  return <div className={`rounded-md border px-4 py-3 text-sm ${failed ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/30 bg-primary-soft"}`}>{message}</div>;
}

/**
 * "AI 이미지" 표기 스위치.
 *
 * 표기는 그림 파일 안에 새기므로, 여기서 끈 뒤 **새로 만든 것부터** 빠진다.
 * 이미 만들어 둔 그림은 그대로라는 것을 화면에 적어 둔다 — 껐는데 예전
 * 그림에 그대로 남아 있으면 고장으로 보인다.
 */
function AiBadgePanel({ enabled }: { enabled: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>&quot;AI 이미지&quot; 표기</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "켜짐" : "꺼짐"}</Badge>
            <p className="text-sm font-medium">
              만든 그림 오른쪽 아래에 표기를 {enabled ? "붙이고 있습니다" : "붙이지 않습니다"}.
            </p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            표기는 그림 파일 안에 새깁니다. 바꾸면 이때부터 새로 만드는 것에만 적용되고,
            이미 만들어 둔 그림은 그대로입니다.
          </p>
        </div>
        <form action={updateAiBadge}>
          <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
          <Button type="submit" variant={enabled ? "outline" : "default"}>
            {enabled ? "표기 끄기" : "표기 켜기"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * 첫 화면 갤러리.
 *
 * **거는 것은 여기가 아니라 라이브러리에서 한다.** 무엇을 걸지는 그림을 보고
 * 정하는 일이라, 목록만 있는 화면에서 고르면 판단이 안 선다. 여기서는 이미
 * 건 것을 다룬다 — 차례, 문구, 껐다 켜기, 지우기.
 *
 * `items` 가 `null` 이면 표를 못 읽은 것이다. 대개는 마이그레이션을 아직 안
 * 돌린 서버다. 그럴 때 빈 목록으로 보여주면 "아직 아무것도 안 걸었네"로
 * 읽혀, 걸어도 안 걸리는 이유를 영영 못 찾는다.
 */
function ShowcasePanel({ items }: { items: ShowcaseAdminView[] | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>첫 화면 갤러리</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          첫 화면에 걸 그림은 <Link href="/library" className="underline">라이브러리 → 작업물</Link>에서 그림을 열고
          「첫 화면에 걸기」로 고릅니다. 아무것도 안 걸면 첫 화면은 미리 넣어 둔 네 장을 그대로 보여줍니다.
        </p>

        {items === null ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            갤러리 표를 읽지 못했습니다. <code>supabase/migrations/202609040011_showcase.sql</code> 을 아직 안 돌린 서버일 수 있습니다.
            표가 없으면 그림을 걸어도 걸리지 않습니다.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 아무것도 걸지 않았습니다. 첫 화면은 미리 넣어 둔 네 장을 보여주고 있습니다.
          </p>
        ) : (
          <ul className="grid gap-3">
            {items.map((item, index) => (
              <ShowcaseRow key={item.id} item={item} first={index === 0} last={index === items.length - 1} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** 걸린 그림 한 줄. */
function ShowcaseRow({ item, first, last }: { item: ShowcaseAdminView; first: boolean; last: boolean }) {
  const kindName = item.sourceKind === "sns" ? "카드뉴스" : item.sourceKind === "poster" ? "이미지" : "라이브러리";

  return (
    <li className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-start">
      <div className="grid aspect-square w-[88px] place-items-center overflow-hidden rounded-md bg-muted">
        {item.visible ? (
          // 88px 자리다. 원본을 넣으면 200장까지 내려받는다 — 이 변경이
          // 줄이려던 바로 그 비용이다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt={item.caption ?? "첫 화면에 걸린 그림"}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          // 끈 그림은 주소까지 막힌다 — 껐는데 주소를 아는 사람이 계속 볼 수
          // 있으면 껐다고 할 수 없다. 그래서 여기서도 안 보인다.
          <span className="px-1 text-center text-[11px] leading-tight text-muted-foreground">꺼 놓아<br />안 보입니다</span>
        )}
      </div>

      <form action={updateShowcase} className="grid gap-2">
        <input type="hidden" name="id" value={item.id} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.visible ? "default" : "secondary"}>{item.visible ? "걸림" : "내림"}</Badge>
          <span className="text-xs text-muted-foreground">{kindName} · {item.sourceIndex + 1}번째 장 · {item.position + 1}번 자리</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto]">
          <Input name="kindLabel" defaultValue={item.kindLabel ?? ""} placeholder="종류 (예: 카드뉴스)" maxLength={60} />
          <Input name="caption" defaultValue={item.caption ?? ""} placeholder="설명 — 화면에는 안 보이고 검색엔진만 읽습니다" maxLength={200} />
          <Button type="submit" size="sm" variant="outline">문구 저장</Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <form action={moveShowcase}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <Button type="submit" size="icon" variant="ghost" aria-label="앞으로" disabled={first}><ArrowUp /></Button>
        </form>
        <form action={moveShowcase}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="down" />
          <Button type="submit" size="icon" variant="ghost" aria-label="뒤로" disabled={last}><ArrowDown /></Button>
        </form>
        <form action={updateShowcase}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="visible" value={item.visible ? "off" : "on"} />
          <Button type="submit" size="sm" variant="outline">{item.visible ? "내리기" : "다시 걸기"}</Button>
        </form>
        <form action={removeShowcase}>
          <input type="hidden" name="id" value={item.id} />
          <ConfirmSubmitButton
            variant="ghost"
            confirmMessage="첫 화면에서 지웁니다. 원본 작업물은 그대로 남습니다. 계속할까요?"
            pendingLabel="지우는 중..."
          >지우기</ConfirmSubmitButton>
        </form>
      </div>
    </li>
  );
}

function Metric({ icon, label, value, suffix = "명" }: { icon: ReactNode; label: string; value: number; suffix?: string }) {
  return <Card><CardContent className="flex items-center gap-3 pt-6"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-extrabold">{value.toLocaleString()}{suffix}</p></div></CardContent></Card>;
}

function QuotaForm({ profile, fullWidth = false }: { profile: MemberProfile; fullWidth?: boolean }) {
  return (
    <form action={updateQuota} className="flex gap-2">
      <input type="hidden" name="userId" value={profile.id} />
      <Input
        className={fullWidth ? "min-w-0 flex-1" : "w-20"}
        aria-label={`${profile.email} 월 이미지 한도`}
        name="quota"
        type="number"
        min={0}
        max={10000}
        defaultValue={profile.monthly_quota}
      />
      <ConfirmSubmitButton
        className={fullWidth ? "shrink-0" : undefined}
        variant="outline"
        confirmMessage={`${profile.email} 회원의 월 이미지 한도를 입력한 값으로 변경할까요?`}
        pendingLabel="저장 중..."
      >
        저장
      </ConfirmSubmitButton>
    </form>
  );
}

function MemberActions({ profile, fullWidth = false }: { profile: MemberProfile; fullWidth?: boolean }) {
  const formClass = fullWidth ? "min-w-[10rem] flex-1" : "";
  const buttonClass = fullWidth ? "w-full" : undefined;
  const locked = profile.status === "pending" && !profile.email_confirmed_at;

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {/*
        자주 쓰는 것만 밖에 둔다. 승인 · 정지 · 정지 해제 셋이다.

        나머지(메일 재발송 · 지우기)는 「⋯」 안으로 넣었다. 회원 하나가 세로로
        다섯 줄을 차지하고 있었는데, 스무 명을 훑을 때 한 화면에 열 명이
        들어오느냐 두 명이 들어오느냐가 갈린다.
      */}
      {profile.status === "pending" ? (
        <form action={approveMember} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <ConfirmSubmitButton
            className={buttonClass}
            disabled={locked}
            confirmMessage={`${profile.email} 회원을 승인하고 승인 완료 메일을 보낼까요?`}
            pendingLabel="승인 중..."
          >
            승인
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {profile.status === "active" ? (
        <form action={setMemberStatus} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <input type="hidden" name="status" value="suspended" />
          <ConfirmSubmitButton
            className={buttonClass}
            variant="destructive"
            confirmMessage={`${profile.email} 회원의 스튜디오 이용을 정지할까요?`}
            pendingLabel="정지 중..."
          >
            이용 정지
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {profile.status === "suspended" ? (
        <form action={setMemberStatus} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <input type="hidden" name="status" value="active" />
          <ConfirmSubmitButton
            className={buttonClass}
            confirmMessage={`${profile.email} 회원의 이용 정지를 해제할까요?`}
            pendingLabel="해제 중..."
          >
            정지 해제
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {/*
        왜 승인이 잠겼는지 말해 준다. 버튼만 회색이고 설명이 없어서 관리자가
        고장으로 봤다(2026-09-04). 전에는 두 줄짜리 문구를 늘 깔아 뒀는데,
        잠긴 버튼 바로 옆에 한 줄이면 같은 말을 한다.
      */}
      {locked ? (
        <span className="mt-1.5 text-[11px] leading-snug text-amber-700">
          이메일 인증 대기
        </span>
      ) : null}

      <MoreActions label={profile.email}>
        {!profile.email_confirmed_at ? (
          <form action={resendConfirmation}>
            <input type="hidden" name="userId" value={profile.id} />
            <ConfirmSubmitButton
              className="w-full"
              variant="outline"
              confirmMessage={`${profile.email} 주소로 이메일 인증 메일을 다시 보낼까요?`}
              pendingLabel="발송 중..."
            >
              인증 메일 재발송
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {profile.status === "active" ? (
          <form action={resendApproval}>
            <input type="hidden" name="userId" value={profile.id} />
            <ConfirmSubmitButton
              className="w-full"
              variant="outline"
              confirmMessage={`${profile.email} 주소로 승인 완료 메일을 다시 보낼까요?`}
              pendingLabel="발송 중..."
            >
              승인 메일 재발송
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {/*
          아주 지우기.

          관리자에게는 안 보인다 — 서로 지우기 시작하면 되돌릴 방법이 없다.
          내리려면 먼저 일반 회원으로 낮춘 뒤 지운다.

          **이메일을 그대로 입력해야 눌린다.** 표에서 줄을 잘못 짚는 일이 흔한데,
          이건 되돌릴 수 없다 — 그 사람이 만든 작업물·참고 이미지·캐릭터가
          같이 사라진다. 다시 못 들어오게만 할 생각이면 「이용 정지」를 쓴다.
        */}
        {profile.role !== "admin" ? (
          <form action={deleteMember} className="grid gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2">
            <input type="hidden" name="userId" value={profile.id} />
            <p className="text-[11px] leading-snug text-destructive">
              되돌릴 수 없습니다. 이 회원이 만든 작업물·참고 이미지·캐릭터가 함께 사라집니다.
              다시 못 들어오게만 하려면 「이용 정지」를 쓰세요.
            </p>
            <input
              name="confirmEmail"
              required
              autoComplete="off"
              placeholder={profile.email}
              aria-label="지울 회원의 이메일 확인"
              className="h-8 rounded-md border bg-background px-2 text-xs"
            />
            <ConfirmSubmitButton
              variant="destructive"
              confirmMessage={`${profile.email} 회원을 아주 지웁니다. 되돌릴 수 없습니다. 계속할까요?`}
              pendingLabel="지우는 중..."
            >
              아주 지우기
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </MoreActions>
    </div>
  );
}

function StatusBadge({ profile }: { profile: MemberProfile }) {
  return profile.status === "active" ? <Badge variant="green">활성</Badge> : profile.status === "suspended" ? <Badge variant="destructive">정지</Badge> : <Badge variant="secondary">승인 대기</Badge>;
}

function adminHref(params: AdminPageParams, page: number) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  search.set("page", String(page));
  return `/admin?${search}`;
}
