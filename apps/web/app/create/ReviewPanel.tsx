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
 *
 * ── 「통과」가 무엇의 통과인지 밝힌다 (U-16) ────────────────
 *
 * 이 심사는 **같은 AI 가 제 결과를 다시 읽고 매긴 점수**다. 그런데 화면은
 * 「판매 원칙 심사를 모두 통과했습니다」라고만 말했다. 사람이 읽으면 「이
 * 페이지는 검증을 통과했다」로 읽힌다.
 *
 * **실제로 팔리는지는 아무도 재지 않았다.** 이 저장소에 전환율 데이터는 한
 * 줄도 없다(`docs/bugs/pdp-validation/w9-performance.md`).
 *
 * 설계 §14.5(U-16): 「실제 판매 효과 근거 없음 | **성과 검증 미완으로 명시,
 * 모델 점수와 분리** | W9 보고. **전환율 개선을 출시 합격으로 위장하지
 * 않음**」.
 */

/**
 * 어느 쪽이든 붙는 한 줄. **통과한 날에만 겸손하면 겸손이 아니다.**
 */
const LIMIT_NOTE =
  "AI 가 스스로 본 결과입니다. 실제 판매 효과는 확인하지 않았습니다.";

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
          {allPassed ? "AI 판매 원칙 심사를 모두 통과했습니다" : "AI 판매 원칙 심사에서 걸린 부분입니다"}
        </span>
        <Badge variant="secondary" className="ml-auto">
          통과 {summary.passed} / {review.items.length}
        </Badge>
      </div>

      {allPassed ? (
        <p className="text-sm text-muted-foreground">
          대상 · 문제 · 차별점 · 반론 · 흐름 · 근거 · 마무리 일곱 항목을 별도 심사에서 확인했습니다.
          {" "}
          {LIMIT_NOTE}
        </p>
      ) : (
        <>
          <p className="mb-2.5 text-sm text-muted-foreground">
            아래 섹션에서 직접 고칠 수 있습니다. 고치지 않고 진행해도 됩니다.
            {" "}
            {LIMIT_NOTE}
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
