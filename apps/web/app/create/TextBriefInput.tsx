"use client";

import { Loader2, Wand2 } from "lucide-react";
import { Badge, Button, Textarea } from "@fixup/ui";
import type { CopyIntensity, GapPolicy } from "@fixup/pdp-core";
import { COPY_INTENSITIES, GAP_POLICIES, GAP_POLICY_LEGEND } from "./copy-controls";

/**
 * 텍스트 진입 1단계.
 *
 * 형식을 강요하지 않는다. 짧게 써도 되묻지 않고 진행하며, AI가 채운 부분은
 * 다음 단계(시나리오)에서 목록으로 보여준다.
 */

const EXAMPLES = [
  "퇴근 후 집에서 하는 30분 요가 클래스. 직장인 대상이고 장비가 필요 없습니다.",
  "소상공인 대상 세무 상담 구독 서비스. 월 1회 화상 상담과 장부 검토를 제공합니다.",
  "프리랜서 디자이너를 위한 견적서 자동화 앱입니다.",
];

interface TextBriefInputProps {
  value: string;
  copyIntensity: CopyIntensity;
  gapPolicy: GapPolicy;
  isBusy: boolean;
  onChange: (value: string) => void;
  onCopyIntensityChange: (value: CopyIntensity) => void;
  onGapPolicyChange: (value: GapPolicy) => void;
  onSubmit: () => void;
}


export function TextBriefInput({
  value,
  copyIntensity,
  gapPolicy,
  isBusy,
  onChange,
  onCopyIntensityChange,
  onGapPolicyChange,
  onSubmit,
}: TextBriefInputProps) {
  const canSubmit = value.trim().length > 0 && !isBusy;

  return (
    <section className="rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <span className="text-meta text-subtle-foreground">1단계</span>
          <h2 className="text-h2">무엇을 판매하시나요?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            형식은 자유입니다. 떠오르는 대로 적어주세요. 부족한 부분은 AI가 채우고, 채운 내용은 다음
            화면에서 확인하고 고칠 수 있습니다.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          이미지 크레딧 0장
        </Badge>
      </div>

      <Textarea
        rows={7}
        value={value}
        disabled={isBusy}
        placeholder="예) 퇴근 후 집에서 하는 30분 요가 클래스입니다. 직장인이 대상이고 장비가 필요 없습니다."
        onChange={(event) => onChange(event.target.value)}
        className="resize-y text-sm"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <fieldset className="grid gap-1.5">
          <legend className="text-meta text-subtle-foreground">표현 강도</legend>
          <div className="flex flex-wrap gap-1.5">
            {COPY_INTENSITIES.map((option) => (
              <Button key={option.value} type="button" size="sm" disabled={isBusy}
                variant={copyIntensity === option.value ? "default" : "outline"}
                onClick={() => onCopyIntensityChange(option.value)}>{option.label}</Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className="text-meta text-subtle-foreground">{GAP_POLICY_LEGEND.text}</legend>
          <div className="flex flex-wrap gap-1.5">
            {GAP_POLICIES.map((option) => (
              <Button key={option.value} type="button" size="sm" disabled={isBusy}
                variant={gapPolicy === option.value ? "default" : "outline"}
                onClick={() => onGapPolicyChange(option.value)}>{option.label}</Button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-3 grid gap-1.5">
        <span className="text-meta text-subtle-foreground">이렇게 적으셔도 됩니다</span>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              disabled={isBusy}
              className="h-auto max-w-full whitespace-normal py-1.5 text-left text-xs font-normal"
              onClick={() => onChange(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button disabled={!canSubmit} onClick={onSubmit}>
          {isBusy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-4 w-4" />
          )}
          구성 시나리오 만들기
        </Button>
      </div>
    </section>
  );
}
