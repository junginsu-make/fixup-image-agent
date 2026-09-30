"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { NO_REFERENCE } from "../cardnews-attachments";
import { referenceAnswer, setItemsToAttach, type EasyResend } from "../cardnews-state";
import { EasyLibraryPicker, type EasyLibrary } from "./library-attach";

interface ReferenceSet {
  id: string;
  name: string;
  purpose: string;
  items: Array<{ referenceImageId: string; role: string }>;
}

/**
 * **따라 만들 카드뉴스를 요청한다**(2단계 설계 §5-3). 레퍼런스 없이는 원고를 안 쓴다.
 *
 * 라이브러리에서 고르거나, 카드뉴스 화면에서 저장해 둔 세트를 고른다. 세트는 자리
 * (표지 · 속지 · 끝)까지 갖고 있어 그대로 보낸다.
 */
export function EasyReferenceAsk({
  library, attachedIds, onAttach, onSubmit, disabled,
}: {
  library: EasyLibrary;
  attachedIds: string[];
  onAttach: (picked: Array<{ id: string; url: string; title: string }>) => void;
  /** 이 요청에 답해 붙인 그림은 분위기 참고로 확정해 보낸다(`referenceAnswer`). */
  onSubmit: (answer: Pick<EasyResend, "photoRoles" | "photoSlots">) => void;
  disabled?: boolean;
}) {
  const [sets, setSets] = React.useState<ReferenceSet[] | null>(null);
  const [slots, setSlots] = React.useState<Array<{ id: string; role: string }>>([]);
  const [note, setNote] = React.useState("");
  const [added, setAdded] = React.useState<string[]>([]);

  function attach(picked: Array<{ id: string; url: string; title: string }>) {
    setAdded((current) => [...current, ...picked.map((one) => one.id)]);
    onAttach(picked);
  }

  async function openSets() {
    try {
      const body = await (await fetch("/api/reference-sets", { cache: "no-store" })).json();
      // 포스터 전용 세트는 카드뉴스 자리를 모른다.
      setSets(body.ok && Array.isArray(body.sets) ? body.sets.filter((set: ReferenceSet) => set.purpose !== "poster") : []);
    } catch {
      setSets([]);
    }
  }

  function pickSet(set: ReferenceSet) {
    const picked = setItemsToAttach(set, library.rows);
    attach(picked.attach);
    setSlots(picked.slots);
    setNote(picked.missing ? `세트 그림 ${picked.missing}장은 라이브러리에 없어 뺐습니다.` : "");
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">{NO_REFERENCE}</p>
      <div className="flex flex-wrap gap-2">
        <EasyLibraryPicker library={library} selectedIds={attachedIds} onPick={attach} label="라이브러리에서 고르기" />
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => void openSets()}>저장한 레퍼런스 세트</Button>
      </div>
      {sets ? (
        sets.length ? (
          <div className="flex flex-wrap gap-2">
            {sets.map((set) => (
              <Button key={set.id} size="sm" variant="outline" disabled={disabled} onClick={() => pickSet(set)}>{set.name}</Button>
            ))}
          </div>
        ) : <p className="text-meta text-subtle-foreground">저장한 카드뉴스 세트가 없습니다.</p>
      ) : null}
      {note ? <p className="text-meta text-subtle-foreground">{note}</p> : null}
      <div className="flex justify-end">
        <Button size="sm" disabled={disabled || !attachedIds.length} onClick={() => onSubmit(referenceAnswer({ added, attachedIds, slots }))}>
          이걸로 만들기
        </Button>
      </div>
    </div>
  );
}
