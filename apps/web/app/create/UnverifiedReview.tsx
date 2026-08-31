"use client";

import { useState } from "react";
import {
  acknowledgeAll,
  applyUserEdit,
  collectUnverified,
  removeTarget,
  targetKey,
} from "@fixup/pdp-core";
import type { LandingPageBlueprint, UnverifiedItem } from "@fixup/pdp-core";
import { Badge, Button, Textarea } from "@fixup/ui";

interface UnverifiedReviewProps {
  blueprint: LandingPageBlueprint;
  onChange: (blueprint: LandingPageBlueprint) => void;
  onConfirm: (blueprint: LandingPageBlueprint) => void;
  onBack: () => void;
}

function ReviewItem({
  item,
  onApply,
  onRemove,
}: {
  item: UnverifiedItem;
  onApply: (value: string) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(item.value);
  return (
    <article className="grid gap-2 rounded-md bg-background p-3 shadow-[var(--shadow-ring)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.kind === "sample" ? "secondary" : "outline"}>
          {item.kind === "sample" ? "예시" : "확인 필요"}
        </Badge>
        <span className="text-xs text-muted-foreground">{targetKey(item.target)}</span>
      </div>
      {item.note ? <p className="text-sm text-muted-foreground">{item.note}</p> : null}
      <Textarea rows={2} value={value} placeholder="실제 값을 입력해 주세요."
        onChange={(event) => setValue(event.target.value)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>이 문장 빼기</Button>
        <Button type="button" size="sm" disabled={!value.trim()} onClick={() => onApply(value)}>
          실제 값으로 바꾸기
        </Button>
      </div>
    </article>
  );
}

export function UnverifiedReview({ blueprint, onChange, onConfirm, onBack }: UnverifiedReviewProps) {
  const items = collectUnverified(blueprint);
  const askCount = items.filter((item) => item.kind === "ask").length;
  const sampleCount = items.filter((item) => item.kind === "sample").length;
  const grouped = items.reduce<Map<string, UnverifiedItem[]>>((map, item) => {
    map.set(item.sectionId, [...(map.get(item.sectionId) ?? []), item]);
    return map;
  }, new Map());

  const confirmSamples = () => {
    const next = acknowledgeAll(blueprint, new Date().toISOString());
    onChange(next);
    onConfirm(next);
  };

  return (
    <section className="grid gap-4 rounded-lg bg-card p-5 shadow-[var(--shadow-ring)]">
      <div>
        <span className="text-meta text-subtle-foreground">3단계</span>
        <h2 className="text-h2">예시와 빈자리를 확인해 주세요</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          아래 숫자와 문장은 <strong>예시</strong>입니다. 사실이 아니며 저희가 검증하지 않았습니다.<br />
          실제 값으로 바꾸거나, 지우거나, 그대로 쓰겠다고 확인해 주세요.<br />
          확인 후에도 이 표시가 사실인지 확인할 책임은 게시하는 판매자에게 있습니다.
        </p>
      </div>

      {[...grouped.entries()].map(([sectionId, sectionItems]) => (
        <div key={sectionId} className="grid gap-2">
          <h3 className="text-sm font-bold">{sectionItems[0]?.sectionName || sectionId}</h3>
          {sectionItems.map((item) => (
            <ReviewItem key={`${sectionId}:${targetKey(item.target)}`} item={item}
              onApply={(value) => onChange(applyUserEdit(blueprint, sectionId, item.target, value))}
              onRemove={() => onChange(removeTarget(blueprint, sectionId, item.target))} />
          ))}
        </div>
      ))}

      {askCount > 0 ? (
        <p className="text-sm text-destructive">확인 필요 {askCount}건은 실제 값으로 바꾸거나 빼야 합니다.</p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>시나리오로 돌아가기</Button>
        <Button type="button" disabled={askCount > 0} onClick={confirmSamples}>
          이대로 진행 (예시 {sampleCount}건을 확인 없이 사용합니다)
        </Button>
      </div>
    </section>
  );
}
