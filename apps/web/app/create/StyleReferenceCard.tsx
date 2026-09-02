"use client";

import { Palette } from "lucide-react";
import { Badge, Button, cn } from "@fixup/ui";

/**
 * 이 페이지에 쓸 디자인 레퍼런스.
 *
 * 몰래 적용하지 않는다. 반영 강도가 "디자인 전체"라 무엇이 씌워지는지 모른 채
 * 이미지가 나오면 사용자가 결과를 이해할 수 없다. 무엇을 왜 골랐는지 보여주고
 * 끌 수 있게 한다.
 */

export interface StyleReferenceView {
  id: string;
  name: string;
  description: string;
  imageBase64: string;
  mimeType: string;
  reason: string;
}

interface StyleReferenceCardProps {
  reference: StyleReferenceView;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** 제품 이미지를 지킬 것인가. 레퍼런스가 있을 때만 의미가 있다. */
  preserveProduct: boolean;
  onPreserveProductChange: (preserve: boolean) => void;
}

export function StyleReferenceCard({
  reference,
  enabled,
  onToggle,
  preserveProduct,
  onPreserveProductChange,
}: StyleReferenceCardProps) {
  return (
    <div
      className={cn(
        "mb-4 rounded-md border p-3.5 transition-colors",
        enabled ? "border-primary/25 bg-primary-soft/40" : "border-border bg-muted/30",
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Palette size={14} className={enabled ? "text-primary" : "text-muted-foreground"} />
        <span className="text-sm font-bold">
          {enabled ? "이 디자인을 따라 만듭니다" : "디자인 레퍼런스를 쓰지 않습니다"}
        </span>
        <Badge variant="secondary" className="ml-auto">
          {reference.name}
        </Badge>
      </div>

      <div className="flex gap-3">
        {/* 레퍼런스는 저장된 이미지라 next/image 최적화 대상이 아니다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${reference.name} 레퍼런스`}
          src={`data:${reference.mimeType};base64,${reference.imageBase64}`}
          data-zoomable
          className={cn(
            "h-28 w-auto flex-none cursor-zoom-in rounded-md object-cover shadow-[var(--shadow-ring)] transition-opacity",
            enabled ? "" : "opacity-40 grayscale",
          )}
        />
        <div className="min-w-0 text-sm">
          {reference.reason ? (
            <p className="text-muted-foreground">{reference.reason}</p>
          ) : null}
          <p className="mt-1.5 whitespace-pre-line text-xs text-subtle-foreground">
            {reference.description}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onToggle(!enabled)}>
          {enabled ? "레퍼런스 없이 만들기" : "이 레퍼런스 쓰기"}
        </Button>
        <span className="text-xs text-muted-foreground">
          색·서체·구성이 모두 이 이미지를 따라갑니다.
        </span>
      </div>

      {/*
        참조가 둘(제품 기준 이미지 + 레퍼런스)이면 모델이 절충한다. 실측에서
        배경·글자는 레퍼런스를 따랐는데 제품 라벨만 원래 색으로 남았다.
        무엇을 지킬지는 자기 상품을 아는 사람이 제일 잘 안다.
      */}
      {enabled ? (
        <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-md bg-background/60 p-2.5">
          <input
            type="checkbox"
            checked={preserveProduct}
            onChange={(event) => onPreserveProductChange(event.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <strong>제품 이미지 그대로 지키기</strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {preserveProduct
                ? "섹션마다 같은 제품이 나옵니다. 대신 레퍼런스 디자인이 일부만 반영됩니다."
                : "레퍼런스 디자인을 온전히 따릅니다. 대신 섹션마다 제품 모습이 조금씩 달라질 수 있습니다."}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
