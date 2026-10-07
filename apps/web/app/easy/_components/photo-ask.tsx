"use client";

import * as React from "react";
import { Button, cn } from "@fixup/ui";
import { canPickPerson, isPersonRole, type CardPhotoRole, type EasyPhotoRole, type JudgedPhotoRole } from "../photo-roles";

/** 물음의 한 줄. 주소는 화면이 붙인 사진에서 채운다. */
export interface PhotoAskRow {
  id: string;
  /** 판단이 정한 것. 「그림체만」 단추를 이 줄에 낼지 이것이 정한다. */
  role: JudgedPhotoRole;
  url?: string;
  title?: string;
}

const 단추: ReadonlyArray<{ role: EasyPhotoRole; label: string }> = [
  { role: "style", label: "분위기만 참고" },
  { role: "preserve_product", label: "제품 그대로" },
  { role: "preserve_person", label: "인물 그대로" },
];

/**
 * **판단이 그 역할로 정한 줄에만** 낸다(설계 §2-5). 새 단추로 모두에게 내면
 * 읽고 고르는 데 오래 걸린다. 그렇다고 빼면 다시 보낼 때 「인물 그대로」로
 * 바뀌는데, 그 문구는 그림체 바꾸기를 금지한다.
 */
const 그림체만 = { role: "preserve_person_restyled" as const, label: "인물 그대로 · 그림체만" };

/** 카드뉴스 물음에만 낸다(2단계 §5-1). 이미지 한 장에는 이 두 쓰임이 없다. */
const 카드단추: ReadonlyArray<{ role: CardPhotoRole; label: string }> = [
  { role: "place_as_is", label: "원본 그대로 한 장" },
  { role: "ending", label: "마지막 장" },
];

/**
 * **사진을 어떻게 쓸지 묻는 줄**(설계 §2-5).
 *
 * 물음 글은 코드가 짓고(`turn-words.ts` 의 `photoQuestion`) 물음 줄이 보인다(2차 D1).
 * 분명한 사진은 이미 고른 채로 보이고, 틀렸으면 여기서 바꾼다.
 */
export function EasyPhotoAsk({
  mode = "image",
  rows,
  picked,
  ready,
  onPick,
  onSubmit,
  disabled,
}: {
  mode?: "image" | "cardnews";
  rows: readonly PhotoAskRow[];
  picked: Readonly<Record<string, CardPhotoRole | undefined>>;
  /** 모두 골랐고 인물이 한 줄 이하인가(`photoAskReady`). */
  ready: boolean;
  onPick: (id: string, role: CardPhotoRole) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      {rows.map((row, index) => {
        const 고를것: ReadonlyArray<{ role: CardPhotoRole; label: string }> = [
          ...단추,
          ...(mode === "cardnews" ? 카드단추 : []),
          ...(row.role === "preserve_person_restyled" ? [그림체만] : []),
        ];
        return (
          <div key={row.id} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex w-16 shrink-0 items-center gap-1.5 text-meta text-subtle-foreground">
              {String.fromCodePoint(0x2460 + Math.min(index, 19))}
              {row.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.url} alt={row.title ?? `사진 ${index + 1}`} className="size-9 rounded border border-border object-cover" />
              ) : null}
            </span>
            {고를것.map((item) => {
              const on = picked[row.id] === item.role;
              const 막힘 = isPersonRole(item.role) && !on && !canPickPerson(picked, row.id);
              return (
                <button
                  key={item.role}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled || 막힘}
                  onClick={() => onPick(row.id, item.role)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-meta transition-colors disabled:opacity-50",
                    on
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border bg-background hover:border-primary/50",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        );
      })}

      <p className="text-meta text-subtle-foreground">말로 답하셔도 됩니다. 예: 「1번은 우리 원두 봉투야」</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || !ready} onClick={onSubmit}>이걸로 만들기</Button>
      </div>
    </div>
  );
}
