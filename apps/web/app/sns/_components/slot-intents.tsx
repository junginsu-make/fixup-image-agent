"use client";

import * as React from "react";
import { Label, Textarea } from "@fixup/ui";
import { attachmentNumber } from "@fixup/shared";
import { groupAttachments, type Attachment, type StyleRole } from "@fixup/sns-core";
import { slotRows } from "./slot-rows";

/**
 * 자리마다 「이 그림들을 어떻게 쓸까요」.
 *
 * ── 왜 카드에 번호 배지를 못 다나 ────────────────────────────
 *
 * 카드뉴스는 **카드마다 첨부를 골라서** 보낸다.
 *
 *   표지 카드   표지 레퍼런스 + 인물
 *   속지 카드   속지 레퍼런스 + 인물
 *
 * 그래서 같은 인물 사진이 표지에서는 ②, 속지에서는 ①일 수 있다. 카드 하나에
 * 배지를 하나 다는 이미지 만들기 방식이 **여기서는 성립하지 않는다.**
 *
 * 그래서 자리별로 묶어서 보여준다. 여기 보이는 차례가 그 자리 카드가 실제로
 * 받는 차례다 — `selectReferencesForRole` 을 화면도 그대로 쓰기 때문에
 * **갈릴 수가 없다.**
 *
 * ── 왜 자리마다 칸이 따로인가 ────────────────────────────────
 *
 * 표지와 속지는 원하는 것이 다르다 — 표지는 「크게, 사람은 가운데」, 속지는
 * 「사람은 작게, 글자 자리를 비워」. 한 칸으로 묶으면 못 나눈다
 * (2026-09-08 사용자 결정).
 */

export interface SlotIntents {
  cover: string;
  body: string;
  ending: string;
}

const SLOT_LABEL: Record<StyleRole, string> = {
  cover: "표지에 쓸 그림",
  body: "속지에 쓸 그림",
  ending: "엔딩에 쓸 그림",
};

export function SlotIntents({
  attachments, images, intents, onChange,
}: {
  attachments: Attachment[];
  images: Array<{ id: string; title?: string | null; signedUrl?: string | null }>;
  intents: SlotIntents;
  onChange: (next: SlotIntents) => void;
}) {
  const grouped = React.useMemo(() => groupAttachments(attachments), [attachments]);

  /**
   * 그릴 자리 — **그 자리에 갈 그림이 있을 때만.**
   *
   * 인물만 있고 그 자리 레퍼런스가 없어도 인물은 간다. 그때도 보여줘야
   * 「속지에는 사람이 안 들어가나?」로 오해하지 않는다.
   */
  const rows = slotRows(grouped);

  if (!rows.length) return null;

  return (
    <div className="grid gap-4">
      {rows.map(({ slot, picks }) => (
        <div key={slot} className="grid gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{SLOT_LABEL[slot]}</span>
            <span className="text-meta text-subtle-foreground">
              이 차례 그대로 그림 모델에게 갑니다
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {picks.map((pick, index) => {
              const found = images.find((entry) => entry.id === pick.id);
              const title = found?.title ?? "참고 이미지";
              const url = pick.url || found?.signedUrl || "";
              // 인물은 모든 자리에 따라간다. 같은 그림인 것을 알 수 있게 표시한다.
              const shared = pick.kind === "keep_identity";
              return (
                <div key={pick.id} className="relative w-16">
                  <span
                    aria-hidden
                    className="absolute left-1 top-1 z-10 grid size-5 place-items-center rounded bg-foreground/85 text-[11px] font-semibold text-background"
                  >
                    {attachmentNumber(index)}
                  </span>
                  <div className="aspect-square overflow-hidden rounded border border-border bg-muted">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`${attachmentNumber(index)}번 ${title}`} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <p className="truncate pt-0.5 text-[11px] text-subtle-foreground" title={title}>
                    {shared ? "공통 · " : ""}{title}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`slot-intent-${slot}`} className="text-meta text-subtle-foreground">
              이 그림들을 어떻게 쓸까요 · 선택
            </Label>
            <Textarea
              id={`slot-intent-${slot}`}
              rows={2}
              value={intents[slot]}
              onChange={(event) => onChange({ ...intents, [slot]: event.target.value })}
              placeholder="예: 1번 사진의 사람들을 2번 그림 느낌으로"
            />
          </div>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        그림 왼쪽 위 번호로 부르면 됩니다. 여기 적은 말이 위에서 고른 역할보다 우선합니다.
      </p>
    </div>
  );
}
