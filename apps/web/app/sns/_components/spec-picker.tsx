"use client";

import { CARD_RATIOS, IMAGE_MODELS, modelById, planSlots, type Attachment } from "@fixup/sns-core";
import { Badge, Card, CardContent, Label } from "@fixup/ui";
import { estimateCost } from "../cost-estimate";

export interface SnsSpec {
  ratio: string;
  cardCountMode: "auto" | "fixed";
  cardCount?: number;
  language: "ko" | "en" | "ja" | "zh";
  modelId: string;
}

export function estimateCostLabel(spec: SnsSpec, attachments: Attachment[]): string {
  const model = modelById(spec.modelId);
  if (spec.cardCountMode === "fixed") {
    const estimate = estimateCost({
      ratio: spec.ratio,
      modelId: spec.modelId,
      totalCards: spec.cardCount!,
      attachments,
    });
    return `예상 비용 $${estimate.usd.toFixed(2)} · ${model.label} · AI 생성 ${estimate.generatedCount}장`;
  }
  const slotPlan = planSlots({
    requested: "auto",
    placeAsIsCount: attachments.filter((attachment) => attachment.kind === "place_as_is").length,
    hasEndingImage: attachments.some((attachment) => attachment.kind === "ending"),
  });
  const min = estimateCost({ ratio: spec.ratio, modelId: spec.modelId, totalCards: slotPlan.autoRange!.min, attachments });
  const max = estimateCost({ ratio: spec.ratio, modelId: spec.modelId, totalCards: slotPlan.autoRange!.max, attachments });
  return `예상 비용 $${min.usd.toFixed(2)}~$${max.usd.toFixed(2)} · ${model.label}`;
}

export function SpecPicker({ spec, onChange, attachments }: {
  spec: SnsSpec;
  onChange(value: SnsSpec): void;
  attachments: Attachment[];
}) {
  const placeAsIsCount = attachments.filter((attachment) => attachment.kind === "place_as_is").length;
  const hasEndingImage = attachments.some((attachment) => attachment.kind === "ending");
  const plan = planSlots({
    requested: spec.cardCountMode === "fixed" ? spec.cardCount : "auto",
    placeAsIsCount,
    hasEndingImage,
  });

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div><h3 className="font-semibold">비율</h3><p className="text-sm text-muted-foreground">게시할 위치에 맞는 비율만 고르세요. 픽셀은 모델에 맞춰 자동으로 정합니다.</p></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{CARD_RATIOS.map((ratio) => <button key={ratio.id} type="button" onClick={() => onChange({ ...spec, ratio: ratio.id })} className={`rounded-lg border p-4 text-left ${spec.ratio === ratio.id ? "border-primary bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]" : "bg-card"}`}><strong className="block">{ratio.id}</strong><span className="mt-1 block text-xs text-muted-foreground">{ratio.label}</span></button>)}</div>
      </section>

      <section className="grid gap-3">
        <div><h3 className="font-semibold">전체 장수</h3><p className="text-sm text-muted-foreground">기본은 AI 추천입니다. 직접 고르면 정확히 그 장수 안에서 배치합니다.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange({ ...spec, cardCountMode: "auto", cardCount: undefined })} className={`rounded-md border px-4 py-2 text-sm font-medium ${spec.cardCountMode === "auto" ? "border-primary bg-primary-soft" : "bg-card"}`}>AI 추천</button>
          {[4, 5, 6, 7, 8].map((count) => <button key={count} type="button" onClick={() => onChange({ ...spec, cardCountMode: "fixed", cardCount: count })} className={`rounded-md border px-4 py-2 text-sm font-medium ${spec.cardCountMode === "fixed" && spec.cardCount === count ? "border-primary bg-primary-soft" : "bg-card"}`}>{count}장</button>)}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2"><Label htmlFor="sns-language">언어</Label><select id="sns-language" className="h-10 rounded-md border bg-background px-3 text-sm" value={spec.language} onChange={(event) => onChange({ ...spec, language: event.target.value as SnsSpec["language"] })}><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option><option value="zh">中文</option></select></label>
        <label className="grid gap-2"><Label htmlFor="sns-model">이미지 모델</Label><select id="sns-model" className="h-10 rounded-md border bg-background px-3 text-sm" value={spec.modelId} onChange={(event) => onChange({ ...spec, modelId: event.target.value })}>{IMAGE_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}{model.isDefault ? " · 기본" : ""}</option>)}</select></label>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2"><strong>자리 계산</strong>{plan.issues.length ? <Badge variant="secondary">확인 필요</Badge> : <Badge variant="green">배치 가능</Badge>}</div>
          {plan.total === "auto" ? <p className="text-sm">AI 추천 범위 {plan.autoRange!.min}~{plan.autoRange!.max}장 · 원본 {plan.placeAsIs}장 · 표지와 마지막 각 1자리</p> : <p className="text-sm">{plan.total}장 = 표지 1 + 원본 {plan.placeAsIs} + AI 속지 {plan.aiBody} + 마지막 1</p>}
          {plan.issues.map((issue) => <p key={issue} role="alert" className="text-sm text-destructive">{issue}</p>)}
          <p className="text-sm font-semibold text-primary">{estimateCostLabel(spec, attachments)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
