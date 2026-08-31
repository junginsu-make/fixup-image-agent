"use client";

import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button } from "@fixup/ui";

/**
 * 대표 이미지 승인 단계.
 *
 * 이 1장이 이후 모든 섹션 이미지의 색·조명·질감을 결정한다. 여기서 한 번 거르면
 * 전체를 다시 만드는 일을 막을 수 있어 승인 단계를 둔다.
 */

interface KeyVisualGateProps {
  previewUrl: string | null;
  isBusy: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onBack: () => void;
}

export function KeyVisualGate({ previewUrl, isBusy, onApprove, onRegenerate, onBack }: KeyVisualGateProps) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <span className="text-meta text-subtle-foreground">2단계 · 대표 이미지</span>
          <h2 className="text-h2">이 분위기로 진행할까요?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            이 이미지가 모든 섹션의 색과 분위기를 결정합니다. 마음에 드는 쪽으로 정한 뒤 섹션 이미지를
            만드는 게 전체를 다시 만드는 것보다 빠릅니다.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          다시 만들 때마다 1장 차감
        </Badge>
      </div>

      <div className="grid place-items-center overflow-hidden rounded-md bg-canvas p-3">
        {isBusy ? (
          <div className="grid h-64 place-items-center gap-2 text-center text-sm text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            대표 이미지를 만드는 중입니다.
          </div>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt="대표 이미지 미리보기"
            className="max-h-[60vh] w-auto max-w-full rounded-md object-contain"
          />
        ) : (
          <div className="grid h-64 place-items-center text-sm text-muted-foreground">
            아직 이미지가 없습니다.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={isBusy} onClick={onBack}>
          <ArrowLeft size={16} className="mr-1.5" />
          시나리오 고치기
        </Button>
        <Button variant="outline" className="ml-auto" disabled={isBusy} onClick={onRegenerate}>
          <RefreshCw size={16} className="mr-1.5" />
          다시 만들기
        </Button>
        <Button disabled={isBusy || !previewUrl} onClick={onApprove}>
          <Check size={16} className="mr-1.5" />
          이걸로 섹션 만들기
        </Button>
      </div>
    </section>
  );
}
