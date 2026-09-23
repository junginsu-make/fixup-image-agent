"use client";

import * as React from "react";
import { LibraryPickerButton } from "../../_components/library-picker";

/** `/api/poster/references` 가 주는 줄. `ReferenceItem` 과 같은 모양이다. */
export interface ReferenceRow {
  id: string;
  title?: string | null;
  url?: string;
  thumbUrl?: string | null;
  mine?: boolean;
  ownerEmail?: string | null;
}

export interface EasyLibrary {
  rows: ReferenceRow[];
  loading: boolean;
  reload(): void;
}

/**
 * 라이브러리 목록을 **한 번만** 읽는다.
 *
 * 시작 화면의 「라이브러리에서」와 입력창의 폴더 단추가 같은 목록을 쓴다. 각자
 * 읽으면 화면 하나를 여는 데 같은 요청이 두 번 간다.
 *
 * 목록은 `/api/poster/references` 에서 온다 — `/api/reference-images` 와 갈려
 * 창이 비어 보이던 적이 있어(2026-09-18 사용자 보고) 그때 한쪽으로 모았다.
 */
export function useEasyLibrary(): EasyLibrary {
  const [rows, setRows] = React.useState<ReferenceRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const body = await (await fetch("/api/poster/references", { cache: "no-store" })).json();
      setRows(body.ok && Array.isArray(body.references) ? body.references : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, reload };
}

/**
 * 라이브러리에서 고르는 단추.
 *
 * **고른 것을 곧바로 붙인다.** 창이 한 장씩 알려 주므로 「고르기」와 「닫기」를
 * 따로 기다리지 않는다. 창은 열린 채로 있어 여러 장을 이어서 고를 수 있다.
 */
export function EasyLibraryPicker({
  library,
  selectedIds,
  onPick,
  label,
  triggerAriaLabel,
  triggerVariant = "secondary",
}: {
  library: EasyLibrary;
  selectedIds: string[];
  onPick(picked: { id: string; url: string; title: string }[]): void;
  label?: string;
  triggerAriaLabel?: string;
  triggerVariant?: React.ComponentProps<typeof LibraryPickerButton>["triggerVariant"];
}) {
  return (
    <LibraryPickerButton
      label={label}
      triggerAriaLabel={triggerAriaLabel}
      triggerVariant={triggerVariant}
      title="라이브러리에서 고르기"
      description={`고를 수 있는 이미지 ${library.rows.length}장 · 눌러서 고릅니다`}
      loading={library.loading}
      images={library.rows.map((row) => ({
        id: row.id,
        title: row.title ?? "",
        url: row.url ?? null,
        // 격자는 사본을 쓴다. 안 넘기면 창 하나에 수십 MB 가 오간다.
        thumbUrl: row.thumbUrl ?? null,
        // 주인 표시. 떨어뜨리면 남의 그림에도 지우기가 붙는다.
        mine: row.mine,
        ownerEmail: row.ownerEmail,
      }))}
      selectedIds={selectedIds}
      onReload={library.reload}
      onToggle={(image) => {
        const url = image.url ?? image.thumbUrl;
        if (!url) return;
        onPick([{ id: image.id, url, title: image.title ?? "" }]);
      }}
    />
  );
}
