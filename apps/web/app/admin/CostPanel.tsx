import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@fixup/ui";
import {
  formatKrw,
  formatUsd,
  operationLabel,
  type CostSummary,
  type ModelPrice,
} from "../../lib/cost";
import { updateModelPrice, updateUsdKrw } from "./actions";

/**
 * 실제로 나간 돈.
 *
 * 지금까지 관리자 화면은 '장수'만 보여줬다. 장수는 회원에게 차감할 몫이지
 * 우리가 낸 돈이 아니다. 모델마다 단가가 4배 넘게 차이 나서 장수만으로는
 * 어디서 돈이 새는지 알 수 없다.
 *
 * 금액은 단가표를 곱해 낸 값이다. 청구서 그 자체가 아니므로 화면에 기준을
 * 밝힌다 — 없는 정확도를 있는 것처럼 보이면 안 된다.
 */

export function CostPanel({
  summary,
  usdKrw,
  byOperation,
  byModel,
  daily,
  prices,
}: {
  summary: CostSummary;
  usdKrw: number;
  byOperation: Array<{ operation: string; images: number; usd: number }>;
  byModel: Array<{ model: string; label: string; unitCostUsd: number; images: number; usd: number }>;
  daily: Array<{ date: string; images: number; usd: number; wastedUsd: number }>;
  prices: ModelPrice[];
}) {
  const maxDaily = Math.max(0.0001, ...daily.map((row) => row.usd));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">청구서 대조 전 추정 원가입니다. 원가 미확인 {summary.unknownCalls ?? 0}건 · 처리 중 {summary.pendingCalls ?? 0}건</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CostMetric label="오늘 비용" usd={summary.todayUsd} usdKrw={usdKrw} sub={`${summary.todayImages}장`} />
        <CostMetric label="이번 달 비용" usd={summary.monthUsd} usdKrw={usdKrw} sub={`${summary.monthImages}장`} />
        <CostMetric label="누적 비용" usd={summary.totalUsd} usdKrw={usdKrw} sub={`${summary.totalImages}장`} />
        <CostMetric
          label="실패로 버린 비용"
          usd={summary.wastedUsd}
          usdKrw={usdKrw}
          sub={`${summary.wastedImages}장 · 회원에게 차감하지 않음`}
          warn
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>최근 30일 비용 추이</CardTitle>
              <CardDescription>붉은 부분은 만들어 놓고 회원에게 주지 못한 몫입니다.</CardDescription>
            </div>
            <Badge variant="secondary" className="flex-none">1 USD = {usdKrw.toLocaleString("ko-KR")}원</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1" aria-label="최근 30일 비용">
              {daily.length ? (
                daily.map((row) => (
                  <div
                    key={row.date}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    title={`${row.date}: ${formatKrw(row.usd, usdKrw)} · ${row.images}장`}
                  >
                    {row.wastedUsd > 0 ? (
                      <div
                        className="w-full rounded-t bg-destructive/70"
                        style={{ height: `${Math.max(2, (row.wastedUsd / maxDaily) * 100)}%` }}
                      />
                    ) : null}
                    <div
                      className="w-full bg-primary/80"
                      style={{
                        height: row.usd
                          ? `${Math.max(4, ((row.usd - row.wastedUsd) / maxDaily) * 100)}%`
                          : "2px",
                      }}
                    />
                  </div>
                ))
              ) : (
                <p className="w-full self-center text-center text-sm text-muted-foreground">
                  아직 기록이 없습니다.
                </p>
              )}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{daily[0]?.date ?? "-"}</span>
              <span>{daily.at(-1)?.date ?? "-"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1.5">
            <CardTitle>기능별 사용처 (30일)</CardTitle>
            <CardDescription>어느 기능이 돈을 쓰는지 봅니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {byOperation.length ? (
              <ul className="space-y-3 text-sm">
                {byOperation.map((row) => (
                  <li key={row.operation} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{operationLabel(row.operation)}</span>
                    <span className="text-xs text-muted-foreground">{row.images}장</span>
                    <strong>{formatKrw(row.usd, usdKrw)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">아직 기록이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>모델별 사용량과 단가</CardTitle>
            <CardDescription>
              원가는 <strong>실행에 기록한 추정치</strong>입니다. 제공자 청구서와
              다를 수 있습니다 — 청구서를 보고 여기서 고치면 지난 기록의 금액도 함께 맞춰집니다.
            </CardDescription>
          </div>
          <form action={updateUsdKrw} className="flex flex-none items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="usdKrw">
              환율
            </label>
            <Input
              id="usdKrw"
              name="usdKrw"
              defaultValue={usdKrw}
              inputMode="numeric"
              className="h-9 w-24"
            />
            <Button type="submit" variant="outline" size="sm">
              저장
            </Button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-3 pr-3">모델</th>
                <th className="py-3 pr-3">30일 장수</th>
                <th className="py-3 pr-3">30일 비용</th>
                <th className="py-3">장당 단가 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => {
                const used = byModel.find((row) => row.model === price.model);
                return (
                  <tr key={price.model} className="border-b align-middle">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{price.label}</p>
                      {price.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">{price.note}</p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">{(used?.images ?? 0).toLocaleString()}장</td>
                    <td className="py-3 pr-3 font-medium">
                      {formatKrw(used?.usd ?? 0, usdKrw)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {formatUsd(used?.usd ?? 0)}
                      </span>
                    </td>
                    <td className="py-3">
                      <form action={updateModelPrice} className="flex items-center gap-2">
                        <input type="hidden" name="model" value={price.model} />
                        <Input
                          name="unitCostUsd"
                          defaultValue={price.unitCostUsd}
                          inputMode="decimal"
                          className="h-9 w-28"
                          aria-label={`${price.label} 장당 단가`}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          저장
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {/* 단가표에 없는 모델로 만든 기록. 0원으로 잡히므로 드러내 준다. */}
              {byModel
                .filter((row) => !prices.some((price) => price.model === row.model))
                .map((row) => (
                  <tr key={row.model} className="border-b align-middle text-muted-foreground">
                    <td className="py-3 pr-3">{row.model}</td>
                    <td className="py-3 pr-3">{row.images.toLocaleString()}장</td>
                    <td className="py-3 pr-3">실행 기록 기준 · 대조 필요</td>
                    <td className="py-3">—</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CostMetric({
  label,
  usd,
  usdKrw,
  sub,
  warn = false,
}: {
  label: string;
  usd: number;
  usdKrw: number;
  sub: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-extrabold ${warn && usd > 0 ? "text-destructive" : ""}`}>
          {formatKrw(usd, usdKrw)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatUsd(usd)} · {sub}
        </p>
      </CardContent>
    </Card>
  );
}
