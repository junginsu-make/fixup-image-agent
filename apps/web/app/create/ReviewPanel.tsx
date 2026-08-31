"use client";

import { AlertTriangle, CheckCircle2, TriangleAlert } from "lucide-react";
import { REVIEW_CRITERIA, summarizeReview } from "@fixup/pdp-core";
import type { BlueprintReview, ReviewRating } from "@fixup/pdp-core";
import { Badge } from "@fixup/ui";
import { cn } from "@fixup/ui";

/**
 * 구성안 심사 결과.
 *
 * 통과한 척하지 않는 것이 이 화면의 목적이다. 두 번 다시 만들고도 남은 지적은
 * 그대로 보여주고, 사용자가 아래 섹션 카드에서 직접 고치게 한다.
 */

const RATING_LABEL: Record<ReviewRating, string> = {
  pass: "통과",
  weak: "약함",
  fail: "미달",
};

function criterionLabel(id: string) {
  return REVIEW_CRITERIA.find((criterion) => criterion.id === id)?.label ?? id;
}

export function ReviewPanel({ review }: { review: BlueprintReview }) {
  if (review.items.length === 0) return null;

  const summary = summarizeReview(review);
  const problems = review.items.filter((item) => item.rating !== "pass");
  const allPassed = problems.length === 0;

  return (
    <div
      className={cn(
        "mb-4 rounded-md border p-3.5",
        allPassed
          ? "border-primary/25 bg-primary-soft/40"
          : summary.failed > 0
            ? "border-warning/30 bg-warning/5"
            : "border-border bg-muted/30",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {allPassed ? (
          <CheckCircle2 size={14} className="text-primary" />
        ) : (
          <AlertTriangle size={14} className="text-warning" />
        )}
        <span className="text-sm font-bold">
          {allPassed ? "판매 원칙 심사를 모두 통과했습니다" : "판매 원칙 심사에서 걸린 부분입니다"}
        </span>
        <Badge variant="secondary" className="ml-auto">
          통과 {summary.passed} / {review.items.length}
        </Badge>
      </div>

      {allPassed ? (
        <p className="text-sm text-muted-foreground">
          대상 · 문제 · 차별점 · 반론 · 흐름 · 근거 · 마무리 일곱 항목을 별도 심사에서 확인했습니다.
        </p>
      ) : (
        <>
          <p className="mb-2.5 text-sm text-muted-foreground">
            아래 섹션에서 직접 고칠 수 있습니다. 고치지 않고 진행해도 됩니다.
          </p>
          <ul className="grid gap-2.5">
            {problems.map((item) => (
              <li key={item.criterion} className="text-sm">
                <div className="flex items-center gap-1.5">
                  {item.rating === "fail" ? (
                    <TriangleAlert size={13} className="shrink-0 text-warning" />
                  ) : null}
                  <span className="font-bold">{criterionLabel(item.criterion)}</span>
                  <Badge variant="outline" className="text-meta">
                    {RATING_LABEL[item.rating]}
                  </Badge>
                </div>
                {item.evidence ? (
                  <p className="mt-0.5 text-muted-foreground">{item.evidence}</p>
                ) : null}
                {item.fix ? (
                  <p className="mt-0.5 text-foreground">→ {item.fix}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
