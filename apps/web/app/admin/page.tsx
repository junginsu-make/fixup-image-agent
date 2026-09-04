import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Clock3, ImageIcon, Search, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@fixup/ui";
import type { MemberProfile } from "../../lib/membership/types";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { approveMember, deleteMember, resendApproval, resendConfirmation, setMemberStatus, updateQuota } from "./actions";
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
  const [usdKrw, costSummary, costByMember, costByOperation, costByModel, costDaily, modelPrices] =
    await Promise.all([
      getUsdKrw(),
      getCostSummary(),
      getCostByMember(profileIds),
      getCostByOperation(30),
      getCostByModel(30),
      getCostDaily(30),
      getModelPrices(),
    ]);

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
      </div>

      {notice ? <AdminNotice notice={notice} /> : null}

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
                    <p className="break-all font-semibold leading-5">{profile.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {profile.email_confirmed_at ? "이메일 인증 완료" : "이메일 미인증"} · 가입 {new Date(profile.created_at).toLocaleDateString("ko-KR")}
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
                <tr><th className="py-3 pr-3">회원</th><th className="py-3 pr-3">상태</th><th className="py-3 pr-3">이번 달</th><th className="py-3 pr-3">이번 달 비용</th><th className="py-3 pr-3">누적 비용</th><th className="py-3 pr-3">월 한도</th><th className="py-3">관리</th></tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id} className="border-b align-top">
                    <td className="py-4 pr-3">
                      <p className="font-medium">{profile.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {profile.email_confirmed_at ? "이메일 인증" : "미인증"} · {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                      </p>
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

function AdminNotice({ notice }: { notice: string }) {
  const failed = notice === "approved_email_failed";
  const message = notice === "approved"
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
            : "회원은 승인됐지만 이메일 발송에 실패했습니다. SMTP 설정 확인 후 재발송해 주세요.";
  return <div className={`rounded-md border px-4 py-3 text-sm ${failed ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/30 bg-primary-soft"}`}>{message}</div>;
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
  return (
    <div className="flex flex-wrap gap-2">
      {profile.status === "pending" ? (
        <form action={approveMember} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <ConfirmSubmitButton
            className={buttonClass}
            disabled={!profile.email_confirmed_at}
            confirmMessage={`${profile.email} 회원을 승인하고 승인 완료 메일을 보낼까요?`}
            pendingLabel="승인 중..."
          >
            승인
          </ConfirmSubmitButton>
          {/*
            왜 잠겼는지 말해 준다. 버튼만 회색이고 아무 설명이 없어서 관리자가
            고장으로 봤다(2026-09-04). 이메일 주인이 맞는지 확인되기 전에
            승인하면 남의 주소로 가입한 사람을 들여보내게 되므로 잠그는 것이
            맞지만, 잠근 이유는 보여야 한다.
          */}
          {!profile.email_confirmed_at ? (
            <p className="mt-1 text-[11px] leading-snug text-amber-700">
              이메일 인증 대기 중입니다. 본인이 인증 메일의 링크를 눌러야 승인할 수 있습니다.
            </p>
          ) : null}
        </form>
      ) : null}

      {/*
        인증 메일 다시 보내기.

        사용자도 `/access` 에서 직접 보낼 수 있지만 **로그인을 해야 그 화면에
        닿는다.** 메일이 통째로 안 왔거나 비밀번호를 잊은 사람은 거기까지 못
        간다. 그때 관리자가 대신 눌러 준다.

        이미 인증을 마친 사람에게는 안 보인다 — 보낼 것이 없다.
      */}
      {!profile.email_confirmed_at ? (
        <form action={resendConfirmation} className={formClass}>
          <input type="hidden" name="userId" value={profile.id} />
          <ConfirmSubmitButton
            className={buttonClass}
            variant="outline"
            confirmMessage={`${profile.email} 주소로 이메일 인증 메일을 다시 보낼까요?`}
            pendingLabel="발송 중..."
          >
            인증 메일 재발송
          </ConfirmSubmitButton>
        </form>
      ) : null}
      {profile.status === "active" ? (
        <>
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
          <form action={resendApproval} className={formClass}>
            <input type="hidden" name="userId" value={profile.id} />
            <ConfirmSubmitButton
              className={buttonClass}
              variant="outline"
              confirmMessage={`${profile.email} 주소로 승인 완료 메일을 다시 보낼까요?`}
              pendingLabel="발송 중..."
            >
              승인 메일 재발송
            </ConfirmSubmitButton>
          </form>
        </>
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
        아주 지우기.

        관리자에게는 안 보인다 — 서로 지우기 시작하면 되돌릴 방법이 없다.
        내리려면 먼저 일반 회원으로 낮춘 뒤 지운다.

        **이메일을 그대로 입력해야 눌린다.** 표에서 줄을 잘못 짚는 일이 흔한데,
        이건 되돌릴 수 없다 — 그 사람이 만든 작업물·참고 이미지·캐릭터가
        같이 사라진다. 다시 못 들어오게만 할 생각이면 「이용 정지」를 쓴다.
      */}
      {profile.role !== "admin" ? (
        <details className="w-full">
          <summary className="cursor-pointer list-none text-xs text-subtle-foreground hover:text-destructive">
            회원 지우기
          </summary>
          <form action={deleteMember} className="mt-2 grid gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2">
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
        </details>
      ) : null}
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
