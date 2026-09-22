import Link from "next/link";
import { BarChart3, Clock3, ImageIcon, Search, Users } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@fixup/ui";
import { isCreditLedgerEnabled } from "../../lib/membership/credit-ledger";
import { requireAdmin } from "../../lib/membership/server";
import { isLocalAuthBypass } from "../../lib/dev-auth";
import { isDisabledRoute } from "../../lib/access/routes";
import { shownFailure } from "../../lib/teams/failure";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { listTeams, teamsOf } from "../../lib/teams/store";
import { formatKrw, getCostByMember, getUsdKrw } from "../../lib/cost";
import { AdminError, AdminNotice, Metric } from "./admin-shared";
import { MemberTable } from "./member-list/member-table";
import type { AdminMemberRow, CreditInfo, CreditPlan } from "./member-list/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SELECT = "h-9 rounded-md border bg-background px-3 text-sm";
const PROFILE_COLUMNS = "id,email,email_confirmed_at,role,status,monthly_quota,approved_at,created_at";

type Params = { q?: string; status?: string; plan?: string; balance?: string; review?: string; page?: string; notice?: string; error?: string };
type Profile = AdminMemberRow["profile"];
type LedgerItem = { id: string; available: number; reserved: number; used: number; unlimited?: boolean; plan_id: string | null; subscription_status: string | null; next_expires: string | null; review_units: number };
type MemberPage = { profiles: Profile[]; credits: Map<string, CreditInfo>; total: number; plans: CreditPlan[] };

const STATUSES = ["pending", "active", "suspended"];
const BALANCES = ["zero", "low", "enough"];

/**
 * 회원 관리 탭(`/admin`).
 *
 * **크레딧 장부가 켜져 있으면 목록 자체를 장부에서 읽는다**(`credit_admin_members`).
 * 그래야 플랜·잔액으로 거르고 쪽을 나눌 수 있다 — 쪽을 먼저 나누고 나중에 거르면
 * 50명 중 3명만 남은 쪽이 생긴다. 승인에 필요한 칸(인증·승인일)은 그 쪽의 사람만
 * 따로 읽어 붙인다.
 */
export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1));
  let ledger = isCreditLedgerEnabled() && !isLocalAuthBypass;
  let ledgerError = "";
  let list: MemberPage;
  /*
    **장부를 못 읽어도 승인·정지는 되어야 한다.** 전에는 크레딧 화면이 따로라 장부가
    멈춰도 이 목록은 멀쩡했다. 한 화면이 된 지금 여기서 던지면 회원 승인까지 막힌다.
  */
  try {
    list = ledger ? await ledgerPage(params, page) : await plainPage(params, page);
  } catch (error) {
    if (!ledger) throw error;
    ledger = false;
    ledgerError = error instanceof Error ? error.message : String(error);
    list = await plainPage(params, page);
  }
  const ids = list.profiles.map((profile) => profile.id);
  const admin = createSupabaseAdminClient();

  const [teamByUser, teams, totalResult, pendingResult, summaryResult, usageResult, usdKrw, costByMember] = await Promise.all([
    teamsOf(ids),
    listTeams().then((all) => all.map((team) => ({ id: team.id, name: team.name }))),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.rpc("admin_usage_summary"),
    ids.length ? admin.rpc("admin_member_usage", { p_user_ids: ids }) : Promise.resolve({ data: [], error: null }),
    getUsdKrw(),
    getCostByMember(ids),
  ]);
  const failed = [totalResult.error, pendingResult.error, summaryResult.error, usageResult.error].find(Boolean);
  if (failed) throw failed;

  const images = new Map(((usageResult.data ?? []) as { user_id: string; consumed_units: number | string }[]).map((row) => [row.user_id, Number(row.consumed_units)]));
  const summary = (summaryResult.data?.[0] ?? { today_units: 0, month_units: 0 }) as { today_units: number | string; month_units: number | string };
  const rows: AdminMemberRow[] = list.profiles.map((profile) => {
    const cost = costByMember.get(profile.id);
    return {
      profile, team: teamByUser.get(profile.id), monthImages: images.get(profile.id) ?? 0,
      monthCost: formatKrw(cost?.monthUsd ?? 0, usdKrw), totalCost: formatKrw(cost?.totalUsd ?? 0, usdKrw), totalImages: cost?.images ?? 0,
      credit: list.credits.get(profile.id) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      {params.notice ? <AdminNotice notice={params.notice} /> : null}
      {shownFailure(params.error) ? <AdminError message={shownFailure(params.error)!} /> : null}
      {ledgerError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">크레딧 장부를 읽지 못해 크레딧·플랜 칸을 비워 두었습니다. 승인·정지는 그대로 됩니다. ({ledgerError})</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users />} label="전체 회원" value={totalResult.count ?? 0} />
        <Metric icon={<Clock3 />} label="승인 대기" value={pendingResult.count ?? 0} />
        <Metric icon={<ImageIcon />} label="오늘 생성" value={Number(summary.today_units)} suffix="장" />
        <Metric icon={<BarChart3 />} label="이번 달 생성" value={Number(summary.month_units)} suffix="장" />
      </div>
      <Card>
        <CardHeader><CardTitle>회원 목록</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Filters params={params} plans={list.plans} ledger={ledger} />
          <MemberTable rows={rows} plans={list.plans} teams={teams} ledger={ledger} teamsEnabled={!isDisabledRoute("/team")} />
          {!rows.length ? <p className="py-10 text-center text-muted-foreground">조건에 맞는 회원이 없습니다.</p> : null}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>총 {list.total.toLocaleString("ko-KR")}명</span>
            <div className="flex gap-2">
              {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={adminHref(params, page - 1)}>이전</Link></Button> : null}
              {page * PAGE_SIZE < list.total ? <Button asChild variant="outline" size="sm"><Link href={adminHref(params, page + 1)}>다음</Link></Button> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Filters({ params, plans, ledger }: { params: Params; plans: CreditPlan[]; ledger: boolean }) {
  return (
    <form className="grid gap-2 sm:flex sm:flex-wrap">
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input name="q" aria-label="이메일 검색" defaultValue={params.q} className="pl-9" placeholder="이메일 검색" />
      </div>
      <select name="status" aria-label="회원 상태" defaultValue={params.status || ""} className={SELECT}>
        <option value="">전체 상태</option>
        <option value="pending">승인 대기</option>
        <option value="active">활성</option>
        <option value="suspended">정지</option>
      </select>
      {ledger ? (
        <>
          <select name="plan" aria-label="플랜" defaultValue={params.plan || ""} className={SELECT}>
            <option value="">전체 플랜</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <select name="balance" aria-label="크레딧 잔액" defaultValue={params.balance || ""} className={SELECT}>
            <option value="">전체 잔액</option>
            <option value="zero">잔액 없음</option>
            <option value="low">10 이하</option>
            <option value="enough">10 초과</option>
          </select>
          {/* 통신이 끊겨 결과를 확인해야 하는 작업이 있는 회원. 쪽을 넘겨 가며 찾지 않게 한다. */}
          <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="review" value="1" defaultChecked={params.review === "1"} />확인 대기만</label>
        </>
      ) : null}
      <Button type="submit" variant="outline" className="w-full sm:w-auto">검색</Button>
    </form>
  );
}

/** 장부에서 거르고 나눈 한 쪽. */
async function ledgerPage(params: Params, page: number): Promise<MemberPage> {
  const actor = await requireAdmin();
  const db = createSupabaseAdminClient();
  const [listResult, planResult] = await Promise.all([
    db.rpc("credit_admin_members", {
      p_actor: actor.user.id, p_query: (params.q ?? "").trim(), p_status: STATUSES.includes(params.status ?? "") ? params.status : "",
      p_team: null, p_balance: BALANCES.includes(params.balance ?? "") ? params.balance : "", p_expiring: false,
      p_sort: "created", p_direction: "desc", p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      p_plan: /^[a-z0-9_-]{1,40}$/.test(params.plan ?? "") ? params.plan : "", p_review: params.review === "1",
    }),
    db.from("subscription_plans").select("id,name,monthly_units,price_krw,active").order("price_krw"),
  ]);
  if (listResult.error) throw listResult.error;
  if (planResult.error) throw planResult.error;
  const items = (listResult.data?.items ?? []) as LedgerItem[];
  const ids = items.map((item) => item.id);
  const { data, error } = ids.length ? await db.from("profiles").select(PROFILE_COLUMNS).in("id", ids) : { data: [], error: null };
  if (error) throw error;
  const byId = new Map(((data ?? []) as Profile[]).map((profile) => [profile.id, profile]));
  return {
    profiles: ids.map((id) => byId.get(id)).filter((profile): profile is Profile => Boolean(profile)),
    credits: new Map(items.map((item) => [item.id, {
      available: item.available, reserved: item.reserved, used: item.used, unlimited: item.unlimited === true,
      planId: item.plan_id, planStatus: item.subscription_status, nextExpires: item.next_expires, reviewUnits: item.review_units,
    }])),
    total: Number(listResult.data?.total ?? 0),
    plans: (planResult.data ?? []) as CreditPlan[],
  };
}

/** 장부가 꺼진 서버(로컬 미리보기). 크레딧 칸은 비어 있다. */
async function plainPage(params: Params, page: number): Promise<MemberPage> {
  let query = createSupabaseAdminClient().from("profiles").select(PROFILE_COLUMNS, { count: "exact" }).order("created_at", { ascending: false });
  if (params.q) query = query.ilike("email", `%${params.q.replace(/[%_,]/g, "")}%`);
  if (STATUSES.includes(params.status || "")) query = query.eq("status", params.status!);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw error;
  return { profiles: (data ?? []) as Profile[], credits: new Map(), total: count ?? 0, plans: [] };
}

function adminHref(params: Params, page: number) {
  const search = new URLSearchParams();
  for (const key of ["q", "status", "plan", "balance", "review"] as const) if (params[key]) search.set(key, params[key]!);
  search.set("page", String(page));
  return `/admin?${search}`;
}
