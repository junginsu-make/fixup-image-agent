import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { isAiBadgeEnabled } from "../../../lib/ai-badge-setting";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { isCreditLedgerEnabled } from "../../../lib/membership/credit-ledger";
import { isLocalAuthBypass } from "../../../lib/dev-auth";
import { getCostByModel, getCostByOperation, getCostDaily, getCostSummary, getModelPrices, getUsdKrw } from "../../../lib/cost";
import { listShowcaseForAdmin } from "../../api/showcase/store";
import { updateAiBadge } from "../actions";
import { AdminNotice } from "../admin-shared";
import { CostPanel } from "../CostPanel";
import { ModelCatalogPanel } from "../ModelCatalogPanel";
import { ShowcasePanel } from "../showcase-panel";
import { PlanSettings } from "./plan-settings";
import type { CreditPlan } from "../member-list/types";

export const dynamic = "force-dynamic";

type DailyUsage = { usage_date: string; consumed_units: number | string };
type TopUsage = { user_id: string; email: string; consumed_units: number | string };

/**
 * 시스템 관리 탭(`/admin/system`). 회원 한 사람이 아니라 서비스 전체에 걸리는 것들 —
 * 구독 플랜, 실제로 나간 돈, 모델 단가, 그림 표기, 첫 화면 갤러리, 생성 추이.
 *
 * 전에는 `/admin` 한 장에서 회원 목록 위에 쌓여 있었다. 회원을 찾으려면 이것들을
 * 다 지나 내려가야 했다.
 */
export default async function AdminSystemPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const ledger = isCreditLedgerEnabled() && !isLocalAuthBypass;
  const [usdKrw, costSummary, costByOperation, costByModel, costDaily, modelPrices, aiBadgeOn, dailyResult, topResult, planResult] = await Promise.all([
    getUsdKrw(), getCostSummary(), getCostByOperation(30), getCostByModel(30), getCostDaily(30), getModelPrices(), isAiBadgeEnabled(),
    admin.rpc("admin_usage_daily", { p_days: 30 }),
    admin.rpc("admin_usage_top", { p_limit: 10 }),
    ledger ? admin.from("subscription_plans").select("id,name,monthly_units,price_krw,active").order("price_krw") : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [dailyResult.error, topResult.error, planResult.error].find(Boolean);
  if (failed) throw failed;
  /* 못 읽어도 던지지 않는다. 이 표는 나중에 붙어서, 마이그레이션 전 서버에는 없다. */
  const showcase = await listShowcaseForAdmin().catch(() => null);

  return (
    <div className="space-y-6">
      {notice ? <AdminNotice notice={notice} /> : null}
      <PlanSettings plans={(planResult.data ?? []) as CreditPlan[]} enabled={ledger} />
      <CostPanel summary={costSummary} usdKrw={usdKrw} byOperation={costByOperation} byModel={costByModel} daily={costDaily} prices={modelPrices} />
      {/* 값이 왜 그런지 바로 위 표에서 궁금해진다. 그 답을 옆에 둔다. */}
      <ModelCatalogPanel />
      <AiBadgePanel enabled={aiBadgeOn} />
      <ShowcasePanel items={showcase} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <UsageChart daily={(dailyResult.data ?? []) as DailyUsage[]} />
        <TopUsers users={(topResult.data ?? []) as TopUsage[]} />
      </div>
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
