"use client";

import { Info, TriangleAlert } from "lucide-react";
import type { CopyGapOutcome, ProductReadingStatus } from "@fixup/pdp-core";
import { productReadingNoticeOf } from "./product-reading-notice";

/**
 * 사진에서 **제품을 충분히 읽었는지** 알린다.
 *
 * 판독 품질을 재는 함수는 있었지만 아무도 부르지 않았다(U-13). 사진이 흐릿하든
 * 제품이 안 보이든 결과는 똑같이 「완성」으로 나왔고, 사용자는 근거 없는 카피를
 * 확인된 사실로 읽었다.
 *
 * 무엇을 말할지는 `product-reading-notice.ts` 가 정한다. 여기는 그리기만 한다.
 */

export function ProductReadingNotice({
  status,
  gapOutcome,
}: {
  status?: ProductReadingStatus;
  /** 서버가 빈자리 정책으로 **실제로 무엇을 했는지**. 화면 토글값이 아니다. */
  gapOutcome?: CopyGapOutcome;
}) {
  const notice = productReadingNoticeOf({ status, gapOutcome });
  if (!notice) return null;

  const warning = notice.tone === "warning";

  return (
    <div
      className={
        warning
          ? "mb-4 rounded-md border border-warning/30 bg-warning/5 p-3.5"
          : "mb-4 rounded-md border border-border bg-muted/30 p-3.5"
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        {warning ? (
          <TriangleAlert size={14} className="shrink-0 text-warning" />
        ) : (
          <Info size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-bold">{notice.title}</span>
      </div>

      <p className="text-sm text-muted-foreground">{notice.body}</p>

      {notice.policyNote ? (
        <p className="mt-1.5 text-sm text-foreground">→ {notice.policyNote}</p>
      ) : null}
    </div>
  );
}
