import Link from "next/link";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { isCreditLedgerEnabled } from "../../../lib/membership/credit-ledger";
import { isLocalAuthBypass } from "../../../lib/dev-auth";
import { MembersClient, type CreditMember, type CreditPlan } from "./members-client";

export const dynamic = "force-dynamic";
export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const size = [50, 100, 200].includes(Number(params.size)) ? Number(params.size) : 50;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const enabled = isCreditLedgerEnabled() && !isLocalAuthBypass;
  let members: CreditMember[] = [], plans: CreditPlan[] = [], total = 0, errorMessage = "";
  let teams: { id: string; name: string }[] = [];
  if (enabled) {
    const db = createSupabaseAdminClient();
    const [rows, catalog, teamRows] = await Promise.all([
      db.rpc("credit_admin_members", { p_actor: actor.user.id, p_query: params.q ?? "", p_status: params.status ?? "", p_team: /^[0-9a-f-]{36}$/i.test(params.team ?? "") ? params.team : null, p_plan: params.plan ?? "", p_balance: params.balance ?? "", p_expiring: params.expiring === "1", p_sort: params.sort ?? "created", p_direction: params.direction ?? "desc", p_limit: size, p_offset: (page - 1) * size, p_review: params.review === "1" }),
      db.from("subscription_plans").select("id,name,monthly_units,price_krw,active").order("price_krw"),
      db.from("teams").select("id,name").order("name"),
    ]);
    teams = teamRows.data ?? [];
    if (rows.error || catalog.error) errorMessage = rows.error?.message ?? catalog.error!.message;
    else { members = rows.data.items; total = rows.data.total; plans = catalog.data; }
  }
  const query = (next: number) => `/admin/members?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((x): x is [string, string] => typeof x[1] === "string")), page: String(next) })}`;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">회원·크레딧 관리</h1><p className="mt-1 text-sm text-muted-foreground">잔액, 만료, 구독, 지급 이력을 한곳에서 관리합니다.</p></div><div className="flex gap-4 text-sm"><Link href="/admin">운영 현황</Link><Link href="/admin/cost-lab">비용 예산</Link></div></div>
    {!enabled && <p className="rounded-lg border p-4 text-sm">현재는 화면 미리보기입니다. DB 마이그레이션과 CREDIT_LEDGER 연결 후 사용할 수 있으며 기존 회원의 차감 기준은 자동으로 변경되지 않습니다.</p>}
    {errorMessage && <p role="alert" className="text-red-600">장부를 읽지 못했습니다: {errorMessage}</p>}
    <form className="flex flex-wrap gap-2 rounded-xl border p-4">
      <input aria-label="회원 검색" name="q" defaultValue={params.q} placeholder="이메일 검색" className="rounded border bg-background p-2" />
      <select aria-label="회원 상태" name="status" defaultValue={params.status ?? ""} className="rounded border bg-background p-2"><option value="">모든 상태</option><option value="active">승인</option><option value="pending">대기</option><option value="suspended">정지</option></select>
      <select aria-label="잔액 필터" name="balance" defaultValue={params.balance ?? ""} className="rounded border bg-background p-2"><option value="">모든 잔액</option><option value="zero">잔액 없음</option><option value="low">10 이하</option><option value="enough">10 초과</option></select>
      <select aria-label="팀 필터" name="team" defaultValue={params.team ?? ""} className="rounded border bg-background p-2"><option value="">모든 팀</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select aria-label="구독 필터" name="plan" defaultValue={params.plan ?? ""} className="rounded border bg-background p-2"><option value="">모든 구독</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="정렬 기준" name="sort" defaultValue={params.sort ?? "created"} className="rounded border bg-background p-2"><option value="created">가입일</option><option value="email">이메일</option><option value="balance">잔액</option><option value="used">사용량</option><option value="expires">만료일</option></select>
      <select aria-label="정렬 방향" name="direction" defaultValue={params.direction ?? "desc"} className="rounded border bg-background p-2"><option value="desc">내림차순</option><option value="asc">오름차순</option></select>
      <select aria-label="페이지 크기" name="size" defaultValue={size} className="rounded border bg-background p-2">{[50,100,200].map(n => <option key={n} value={n}>{n}명씩</option>)}</select>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="expiring" value="1" defaultChecked={params.expiring === "1"} />7일 내 만료</label><label className="flex items-center gap-1 text-sm"><input type="checkbox" name="review" value="1" defaultChecked={params.review === "1"} />정산 확인 대기</label><button className="rounded bg-primary px-4 py-2 text-primary-foreground">조회</button>
    </form>
    <p className="text-sm">전체 {total.toLocaleString()}명 · {page} / {Math.max(1, Math.ceil(total / size))}페이지</p>
    <MembersClient members={members} plans={plans} enabled={enabled && !errorMessage} />
    <nav aria-label="회원 목록 페이지" className="flex gap-5 text-sm">{page > 1 && <Link href={query(page - 1)}>이전</Link>}{page * size < total && <Link href={query(page + 1)}>다음</Link>}</nav>
  </div>;
}
