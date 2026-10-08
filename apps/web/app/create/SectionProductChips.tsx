"use client";

import type { ProductId } from "@fixup/pdp-core";
import { cn } from "@fixup/ui";
import { sectionProductsOn, toggleSectionProduct } from "./products";

/**
 * **이 섹션 그림에 나올 제품**(설계 2026-10-08 §5). 눌러서 켜고 끈다.
 *
 * 제품이 둘 이상일 때만 그린다 — 하나면 고를 것이 없다. 마지막 하나는 끌 수 없다
 * (`aria-disabled`): 제품 사진 없이 그리는 섹션은 없다. 판단은 `products.ts` 가 한다.
 */
export function SectionProductChips({
  products,
  selected,
  onChange,
}: {
  products?: ReadonlyArray<{ id: ProductId; label: string }>;
  /** 섹션의 `product_ids`. 없으면 모두 켜진 것이다. */
  selected?: string[];
  onChange: (productIds: ProductId[]) => void;
}) {
  if (!products || products.length < 2) return null;
  const all = products.map((product) => product.id);
  const on = sectionProductsOn(all, selected);

  return (
    <div role="group" aria-label="이 섹션에 나올 제품" className="flex flex-wrap items-center gap-1.5">
      <span className="text-meta text-subtle-foreground">나올 제품</span>
      {products.map((product) => {
        const active = on.includes(product.id);
        const locked = active && on.length === 1;
        return (
          <button
            key={product.id}
            type="button"
            data-product-chip={product.id}
            aria-pressed={active}
            aria-disabled={locked || undefined}
            title={locked ? "섹션마다 제품이 하나는 있어야 합니다" : undefined}
            onClick={() => {
              if (!locked) onChange(toggleSectionProduct(all, selected, product.id));
            }}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-sm transition-colors",
              active ? "border-primary bg-primary-soft text-foreground" : "border-border text-muted-foreground hover:bg-muted",
              locked && "cursor-not-allowed",
            )}
          >
            {product.label}
          </button>
        );
      })}
    </div>
  );
}
