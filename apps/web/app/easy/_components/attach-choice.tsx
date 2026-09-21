"use client";

import * as React from "react";
import { Button } from "@fixup/ui";
import { LibraryPickerButton } from "../../_components/library-picker";

/**
 * 첫 화면의 세 갈래 — **직접 첨부 · 라이브러리에서 · 없이 시작** (설계 §3).
 *
 * **한 번만 묻는다.** 되묻지 않는 것이 이 모드의 뜻이다(설계 §6).
 *
 * ── 이미지 만들기와 **같은 길로** 불러온다 ────────────────────
 *
 * 처음에는 `/api/reference-images` 를 눌렀을 때 불렀는데 둘이 어긋났다
 * (2026-09-18 사용자 보고).
 *
 *   ① 창을 열어도 비어 있고 **새로고침을 눌러야** 목록이 왔다
 *   ② 새로고침해도 **그림이 하나도 안 보였다**
 *
 * ②의 까닭은 응답 모양이다. 그 라우트는 `{ images }` 가 아니라 **`{ references }`**
 * 로 준다. `body.images` 를 읽으니 늘 빈 배열이었고, 새로고침이 화면을 다시
 * 그려 「불러온 것처럼」 보였을 뿐이다.
 *
 * `/api/poster/references` 로 옮긴다. 이미지 만들기(02)가 쓰는 그 라우트다 —
 * **같은 그림이 같은 모양으로** 온다. 사본(`thumbUrl`)과 주인 표시(`mine`)도
 * 함께 오는데, 사본이 없으면 창 하나에 수십 MB 가 오간다.
 */

interface Picked {
  id: string;
  url: string;
  title: string;
}

/** `/api/poster/references` 가 주는 줄. `ReferenceItem` 과 같은 모양이다. */
interface ReferenceRow {
  id: string;
  title?: string | null;
  url?: string;
  thumbUrl?: string | null;
  mine?: boolean;
  ownerEmail?: string | null;
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
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const body = await (await fetch("/api/poster/references", { cache: "no-store" })).json();
      // **`references` 다.** `images` 로 읽으면 늘 빈 배열이 온다.
      setRows(body.ok && Array.isArray(body.references) ? body.references : []);
    } catch {
      // 못 불러오면 빈 목록이다. 창이 「고를 그림이 없습니다」를 보여 준다.
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * **화면이 뜰 때 불러온다.**
   *
   * 누를 때 부르면 창이 빈 채로 열리고 사용자가 새로고침을 눌러야 한다 —
   * 이미지 만들기(02)는 화면이 뜰 때 미리 읽어 두므로 창이 곧바로 찬다.
   * 같은 길로 간다.
   */
  React.useEffect(() => { void load(); }, [load]);

  return (
    /*
      **셋 다 테두리를 준다**(2026-09-21 사용자 — 「밝은 화면에서 더 안 보인다」).

      전에는 「직접 첨부」가 `secondary`, 「없이 시작」이 `ghost` 였다. `ghost` 는
      바탕색이 없어 **밝은 화면에서 글자만 떠 있는 것처럼** 보였고, 누를 수 있는
      자리인지 알 수 없었다.

      여기는 첫 화면에서 **처음 마주치는 단추 셋**이다. 어느 것을 눌러도 되는
      자리이므로 셋이 같은 무게로 보여야 한다.
    */
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="sm" onClick={onUpload}>
        직접 첨부
      </Button>

      {/*
        **고른 것을 곧바로 붙인다.** 이 창은 `onToggle` 로 한 장씩 알려 주므로
        「고르기」와 「닫기」를 따로 기다리지 않는다.
      */}
      <LibraryPickerButton
        label="라이브러리에서"
        title="라이브러리에서 고르기"
        description={`고를 수 있는 그림 ${rows.length}장 · 눌러서 고릅니다`}
        loading={loading}
        images={rows.map((row) => ({
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
        onReload={load}
        onToggle={(image) => {
          const url = image.url ?? image.thumbUrl;
          if (!url) return;
          onPick([{ id: image.id, url, title: image.title ?? "" }]);
        }}
      />

      <Button variant="outline" size="sm" onClick={onSkip}>
        없이 시작
      </Button>
    </div>
  );
}
