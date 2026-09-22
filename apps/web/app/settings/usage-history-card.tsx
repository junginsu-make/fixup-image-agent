import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { describeUsageEvent, type UsageEventRow } from "../../lib/membership/usage-history";
import { USAGE_HISTORY_LIMIT, type GrantRow } from "../../lib/membership/usage-store";

const when = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const day = (value: string) => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const KIND: Record<string, string> = { subscription: "구독", purchase: "구매", bonus: "추가 지급" };
const TONE: Record<string, string> = {
  charged: "font-bold text-foreground",
  pending: "font-semibold text-amber-700",
  free: "text-muted-foreground",
  failed: "text-muted-foreground",
  legacy: "text-muted-foreground",
};

/**
 * 내 크레딧 사용 기록과 받은 크레딧.
 *
 * **이번 달 합계는 잔액이 센 값을 그대로 쓴다.** 기록은 최근 것만 싣기 때문에, 실린 줄을
 * 더하면 한 달 치가 안 될 수 있다 — 그 합을 굵게 보이면 위 「이번 달 사용」과 다른 숫자가
 * 두 개 선다(독립 리뷰 2026-09-22). 사용자 요청 「사용기록이 정확해야 합니다」.
 */
export function UsageHistoryCard({ rows, grants, usedThisMonth, unlimited }: {
  rows: UsageEventRow[] | null;
  grants: GrantRow[] | null;
  /** 잔액이 센 이번 달 사용. 크레딧 계정이 아니면 null. */
  usedThisMonth: number | null;
  unlimited: boolean;
}) {
  if (!rows) {
    return (
      <Card>
        <CardHeader><CardTitle>사용 기록</CardTitle></CardHeader>
        <CardContent><p role="alert" className="text-base text-muted-foreground">사용 기록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요. 잔액은 위 숫자가 맞습니다.</p></CardContent>
      </Card>
    );
  }
  const current = rows.filter((row) => row.pricing_policy === "image-v2");
  const legacy = rows.filter((row) => row.pricing_policy !== "image-v2");
  const cut = rows.length >= USAGE_HISTORY_LIMIT;

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>사용 기록</CardTitle>
        <CardDescription className="text-sm">
          성공한 이미지만 차감되고, 실패하면 돌려받습니다.
          {usedThisMonth !== null ? <> 이번 달 사용 <strong className="text-foreground">{usedThisMonth.toLocaleString("ko-KR")}크레딧</strong>.</> : null}
          {cut ? ` 최근 ${USAGE_HISTORY_LIMIT}건만 보여 드립니다.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {current.length ? <UsageTable rows={current} /> : <p className="rounded-lg bg-muted/50 p-4 text-base text-muted-foreground">크레딧으로 만든 기록이 아직 없습니다.</p>}

        {legacy.length ? (
          <details className="rounded-lg border p-4" open={!current.length}>
            <summary className="cursor-pointer text-sm font-semibold">크레딧 적용 전 기록 {legacy.length}건</summary>
            <p className="mt-2 text-xs text-muted-foreground">2026년 9월 22일 크레딧으로 바뀌기 전의 기록입니다. 옛 단위(장)라서 지금 크레딧 잔액에는 들어가지 않습니다.</p>
            <div className="mt-3"><UsageTable rows={legacy} /></div>
          </details>
        ) : null}

        {grants === null ? (
          <p className="border-t pt-4 text-sm text-muted-foreground">받은 크레딧을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>
        ) : grants.length ? (
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-bold">받은 크레딧</h3>
            <ul className="divide-y rounded-lg border">
              {grants.map((grant) => {
                const endless = grant.source_key.startsWith("unlimited:");
                const live = !grant.revoked_at && new Date(grant.expires_at).getTime() > Date.now();
                const left = live ? grant.granted_units - grant.consumed_units - grant.reserved_units : 0;
                return (
                  <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-medium">{endless ? "무제한" : KIND[grant.kind] ?? grant.kind} <span className="text-muted-foreground">· {day(grant.granted_at)}</span></span>
                    <span className="tabular-nums text-muted-foreground">
                      {endless ? `사용 ${grant.consumed_units.toLocaleString("ko-KR")}` : `${grant.granted_units.toLocaleString("ko-KR")} 중 남음 ${left.toLocaleString("ko-KR")}`}
                      {grant.revoked_at ? " · 회수됨" : endless ? "" : live ? ` · ${day(grant.expires_at)}까지` : " · 만료"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : !unlimited ? <p className="border-t pt-4 text-sm text-muted-foreground">받은 크레딧이 아직 없습니다. 구독이나 크레딧 구매는 운영자에게 문의해 주세요.</p> : null}
      </CardContent>
    </Card>
  );
}

function UsageTable({ rows }: { rows: UsageEventRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr><th className="py-2 pr-3 font-medium">언제</th><th className="py-2 pr-3 font-medium">도구</th><th className="py-2 pr-3 font-medium">결과</th><th className="py-2 text-right font-medium">크레딧</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const line = describeUsageEvent(row);
            return (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{when(row.created_at)}</td>
                <td className="py-2.5 pr-3 font-medium">{line.tool}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{line.status}</td>
                <td className={`py-2.5 text-right tabular-nums ${TONE[line.tone]}`}>{line.amount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
