"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { LibraryPickerButton } from "../../_components/library-picker";

/**
 * 첫 화면의 세 갈래 — **직접 첨부 · 라이브러리에서 · 없이 시작** (설계 §3).
 *
 * **한 번만 묻는다.** 되묻지 않는 것이 이 모드의 뜻이다(설계 §6).
 *
 * ── 라이브러리에서 고른 것은 다시 올리지 않는다 ───────────────
 *
 * 이미 우리 저장소에 있는 그림이라 id 만 받으면 된다. 다시 올리면 같은 그림이
 * 두 벌이 되고 라이브러리가 지저분해진다.
 */

interface Picked {
  id: string;
  url: string;
  title: string;
}

interface ReferenceRow {
  id: string;
  title?: string | null;
  url?: string | null;
  mine?: boolean;
}

export function EasyAttachChoice({
  selectedIds,
  onUpload,
  onPick,
  onSkip,
}: {
  selectedIds: string[];
  onUpload: () => void;
  onPick: (picked: Picked[]) => void;
  onSkip: () => void;
}) {
  const [rows, setRows] = React.useState<ReferenceRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  /**
   * **누를 때 불러온다.**
   *
   * 첫 화면을 그릴 때 미리 불러오면, 라이브러리를 안 쓰는 사람에게도 목록을
   * 받아 온다. 이 모드는 그림 없이 시작하는 사람이 많다.
   */
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const body = await (await fetch("/api/reference-images")).json();
      setRows(Array.isArray(body.images) ? body.images : []);
      setLoaded(true);
    } catch {
      // 못 불러오면 빈 목록이다. 창이 「고를 그림이 없습니다」를 보여 준다.
      setRows([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="secondary" size="sm" onClick={onUpload}>
        직접 첨부
      </Button>

      {/*
        **고른 것을 곧바로 붙인다.** 이 창은 `onToggle` 로 한 장씩 알려 주므로
        「고르기」와 「닫기」를 따로 기다리지 않는다.
      */}
      <LibraryPickerButton
        label="라이브러리에서"
        title="라이브러리에서 고르기"
        description="눌러서 고릅니다. 고른 그림이 대화에 붙습니다"
        loading={loading}
        images={rows.map((row) => ({
          id: row.id,
          title: row.title ?? "",
          url: row.url ?? null,
          // 격자는 사본, 확대는 원본. 참고 이미지는 사본을 따로 안 두므로 같다.
          thumbUrl: row.url ?? null,
          mine: row.mine,
        }))}
        selectedIds={selectedIds}
        onReload={() => void load()}
        onToggle={(image) => {
          if (!image.url) return;
          onPick([{ id: image.id, url: image.url, title: image.title ?? "" }]);
        }}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          // 목록을 안 불러왔으면 처음 눌렀을 때 받아 둔다.
          if (!loaded) void load();
          onSkip();
        }}
      >
        없이 시작
      </Button>
    </div>
  );
}
