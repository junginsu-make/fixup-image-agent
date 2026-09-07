import { Coins, Crown, TriangleAlert } from "lucide-react";
import { Button, Card, Input } from "@fixup/ui";
import {
  balanceOf,
  effectiveQuotaOf,
  suggestedQuota,
  type TeamCredit,
} from "../../lib/teams/credit";
import { setPersonalQuotaAction, setTeamQuotaAction } from "./actions";

/**
 * 크레딧 탭 — 팀 잔량 막대 · 팀원별 사용량 · 개인 상한 편집.
 *
 * 한 화면에 두 층이 있다. 위는 「팀이 이번 달에 얼마나 남았나」, 아래는
 * 「그 안에서 누가 얼마까지 쓸 수 있나」다. 나누면 팀 잔량을 보러 갔다가
 * 상한을 고치러 다시 와야 한다.
 */
export function CreditTab({
  teamId,
  credit,
  canWrite,
}: {
  teamId: string | null;
  credit: TeamCredit;
  canWrite: boolean;
}) {
  if (!teamId) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <Coins className="h-6 w-6 text-subtle-foreground" />
        <p className="text-sm font-bold">팀이 있어야 크레딧을 합칩니다</p>
        <p className="max-w-sm text-meta text-subtle-foreground">
          팀이 없으면 각자의 개인 상한이 그대로 한도입니다.
        </p>
      </div>
    );
  }

  const balance = balanceOf(credit);
  const suggested = suggestedQuota(credit.members);

  return (
    <div className="space-y-6">
      {/* ── 팀 잔량 ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">이번 달 팀 크레딧</h2>
            <p className="mt-1 text-meta text-subtle-foreground">
              {balance.unset
                ? "아직 정하지 않았습니다. 지금은 각자의 개인 상한만 걸립니다."
                : `${balance.used.toLocaleString("ko-KR")} / ${balance.quota.toLocaleString("ko-KR")} 사용 · ${balance.remaining.toLocaleString("ko-KR")} 남음`}
            </p>
          </div>

          {canWrite ? (
            <form action={setTeamQuotaAction} className="flex items-end gap-2">
              <input type="hidden" name="teamId" value={teamId} />
              <label className="grid gap-1">
                <span className="text-meta text-subtle-foreground">팀 한도</span>
                <Input
                  name="quota"
                  inputMode="numeric"
                  defaultValue={String(credit.quota)}
                  className="h-9 w-32 tabular-nums"
                  aria-label="팀 한도"
                />
              </label>
              <Button type="submit" size="sm">저장</Button>
            </form>
          ) : null}
        </div>

        {/* 막대는 한도를 정했을 때만. 안 정했는데 빈 막대를 그리면 「0 남았다」로
            읽혀서, 실제로는 아무것도 안 막는 상태를 다 썼다고 오해한다. */}
        {balance.unset ? (
          canWrite && suggested > 0 ? (
            <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-meta text-subtle-foreground">
              팀원 상한을 더하면 <strong className="tabular-nums">{suggested.toLocaleString("ko-KR")}</strong> 입니다.
              이보다 낮게 정하면 지금까지 쓰던 만큼을 못 씁니다.
            </p>
          ) : null
        ) : (
          <>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`팀 크레딧 ${Math.round(balance.ratio * 100)}% 사용`}
            >
              <div
                className={`h-full rounded-full ${balance.over ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.round(balance.ratio * 100)}%` }}
              />
            </div>
            {balance.over ? (
              <p className="mt-2 flex items-center gap-1.5 text-meta text-destructive">
                <TriangleAlert className="h-3.5 w-3.5" />
                이미 쓴 것이 한도보다 많습니다. 이번 달에는 아무도 더 만들 수 없습니다.
              </p>
            ) : null}
          </>
        )}
      </Card>

      {/* ── 팀원별 ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold">팀원별 사용량</h2>
        <p className="mb-3 text-meta text-subtle-foreground">
          개인 상한은 <strong>팀 잔량 안에서의 천장</strong>입니다. 팀 잔량이 개인 상한보다 적으면
          잔량이 먼저 걸립니다.
        </p>

        {credit.members.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-10 text-center text-meta text-subtle-foreground">
            아직 팀원이 없습니다.
          </p>
        ) : (
          <Card>
            <ul className="divide-y">
            {credit.members.map((row) => {
              const ceiling = effectiveQuotaOf(credit, row);
              const capped = ceiling < row.personalQuota;
              return (
                <li key={row.userId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {row.role === "leader" ? (
                        <Crown className="h-3.5 w-3.5 flex-none text-primary" aria-label="팀장" />
                      ) : null}
                      <span className="truncate text-sm font-medium">{row.email}</span>
                    </span>
                    <span className="block text-meta text-subtle-foreground tabular-nums">
                      이번 달 {row.used.toLocaleString("ko-KR")} 사용 · 실제 천장{" "}
                      {ceiling.toLocaleString("ko-KR")}
                      {/* 개인 상한을 100 으로 적어 뒀는데 팀 때문에 40 밖에 못
                          쓴다면, 그 사실을 여기서 말해야 한다. 안 말하면
                          「상한이 100 인데 왜 막히지」가 된다. */}
                      {capped ? " (팀 잔량에 걸림)" : ""}
                    </span>
                  </span>

                  {canWrite ? (
                    <form action={setPersonalQuotaAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={row.userId} />
                      <Input
                        name="quota"
                        inputMode="numeric"
                        defaultValue={String(row.personalQuota)}
                        className="h-8 w-24 tabular-nums"
                        aria-label={`${row.email} 개인 상한`}
                      />
                      <Button type="submit" variant="ghost" size="sm">저장</Button>
                    </form>
                  ) : (
                    <span className="text-meta tabular-nums text-subtle-foreground">
                      상한 {row.personalQuota.toLocaleString("ko-KR")}
                    </span>
                  )}
                </li>
              );
            })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
