"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Download, ImageIcon, Loader2 } from "lucide-react";
import { Badge, Button, Card, cn } from "@fixup/ui";
import type { LibraryItem } from "@fixup/shared";
import { loadLibrary, getAccountItemImages } from "../../lib/library";
import { planDerivation } from "../../lib/ad/derive";
import type { AdBatchEntry } from "../../lib/ad/batch";
import {
  PORTAL_LABEL, PREVIEW_MAX_WIDTH, SHRINK_WARNING, adSourceItems, bytesFromDataUrl,
  defaultSelection, downloadable, excludedCount, failureMessage, isActualSize,
  missingRequiredCount, previewWidth,
  libraryImagePicks, posterImagePicks, safeAreaOverlayStyle, specRows, zipEntryName,
  type AdImagePick, type AdSourceItem,
} from "./export-rules";

/**
 * 만들어 둔 그림에서 광고 규격을 뽑는 화면.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §9·§10 2단계
 *
 * **생성을 부르지 않는다.** 이미 있는 결과물만 읽는다.
 *
 * **미리보기 없이 내려받을 수 없다**(설계 §5.2). 규격 검증은 픽셀·형식·용량만
 * 보므로, 글자가 안 읽히거나 주인공이 잘린 것은 사람이 봐야 안다.
 */

/**
 * 서버가 주는 것 그대로.
 *
 * **손으로 베끼지 않는다.** 초판은 `AdBatchEntry` 를 필드별로 옮겨 적었는데,
 * 그러면 서버가 `shrink` 를 `scale` 로 바꿔도 **타입 검사가 통과하고 경고 배지만
 * 조용히 사라진다.** 파생시켜 두면 그 순간 컴파일이 깨진다.
 *
 * `bytes` 만 뺀다 — 라우트가 base64 로 바꿔 `dataUrl` 로 싣기 때문이다.
 * `batch.ts` 를 **읽기만** 하므로 격리 계약 1 에 걸리지 않는다.
 */
type ResultEntry = Omit<AdBatchEntry, "bytes"> & { dataUrl?: string };

type PosterWork = { id: string; title: string; status: string; images?: Array<{ variantIndex: number }> };

/**
 * 포스터 작업의 그림 목록.
 *
 * 라이브러리와 달리 목록 응답에 이미 실려 온다 — 다시 물을 이유가 없다.
 * 주소는 포스터 화면이 쓰는 것과 같다.
 */
async function posterItemImages(projectId: string): Promise<AdImagePick[]> {
  const body = await (await fetch(`/api/poster/projects/${projectId}`, { cache: "no-store" })).json();
  if (!body?.ok) return [];
  return posterImagePicks(projectId, (body.images ?? []) as Array<{ variantIndex: number }>);
}

const ROWS = specRows(planDerivation);

export function AdExportClient() {
  const [items, setItems] = React.useState<AdSourceItem[] | null>(null);
  const [item, setItem] = React.useState<AdSourceItem | null>(null);
  const [images, setImages] = React.useState<AdImagePick[] | null>(null);
  const [position, setPosition] = React.useState(0);
  const [picked, setPicked] = React.useState<string[]>(() => defaultSelection(ROWS));
  const [results, setResults] = React.useState<ResultEntry[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * **늦게 온 응답이 다른 그림의 결과로 붙는 것을 막는다.**
   *
   * 요청이 도는 중에 다른 썸네일을 누르면, 먼저 보낸 요청의 응답이 나중에 와서
   * 새 선택 밑에 앉는다. 사용자는 B 를 뽑았다고 믿고 **A 의 ZIP 을 내려받는다** —
   * 「미리보기가 진짜 관문」(설계 §5.2)이 정확히 여기서 깨진다.
   */
  const token = React.useRef(0);

  /**
   * **미리보기 한 칸이 실제로 몇 픽셀인가.**
   *
   * 상수 480 을 그대로 믿으면 좁은 화면에서 라벨이 거짓말을 한다. 데스크톱은
   * `max-w-5xl`(1024) − `p-6`(48) − Card `p-4`(32) = **944px** 이라 480 이 1:1 로
   * 들어가지만, 375px 화면에서는 쓸 수 있는 폭이 **295px** 다. 그때 456×304 는
   * 1.55배 줄어 보이는데 화면은 「1:1」이라고 적는다 — §5.2 의 가독 보증이
   * 좁은 화면에서만 조용히 사라진다.
   */
  const grid = React.useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = React.useState(PREVIEW_MAX_WIDTH);

  React.useEffect(() => {
    const node = grid.current;
    // 서버 렌더와 오래된 브라우저에서는 상수로 둔다 — 없는 것보다 낫다.
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => setCellWidth(Math.min(PREVIEW_MAX_WIDTH, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [results]);

  React.useEffect(() => {
    // 이 화면에서 못 뽑는 작업은 아예 안 보여 준다 — 고를 수 있는데 누르면
    // 「뽑지 못했습니다」만 뜨는 것이 가장 나쁘다.
    // **실패해도 「불러오는 중…」에 머물지 않는다.** `catch` 가 없으면 화면이
    /**
     * **포스터 작업도 함께 읽는다**(설계 §10 3-e).
     *
     * 광고 모드가 만드는 마스터는 `poster_images` 에 쌓이고 라이브러리에는
     * 안 들어간다. 이것을 안 읽으면 마스터를 만들고 여기 와도 **고를 그림이
     * 하나도 없다.** 리뷰 넷이 못 봤고 실제로 켜 보고 알았다.
     *
     * **실패와 「없음」을 가른다.** 초판은 둘을 뭉쳐 「보관된 작업이
     * 없습니다. 라이브러리에서 먼저 저장해 주세요」를 띄웠다 — 서버가 죽어
     * 있어도 그 문장이 나오고, 저장하러 가도 아무 일이 안 일어난다.
     *
     * `loadLibrary()` 쪽은 **가를 수 없다.** 그것이 부르는 네 함수가 전부
     * `catch { return [] }` 로 끝나 거절하지 않는다(`lib/library.ts:38,133,163`).
     * 그래서 거기에 걸어 뒀던 `catch` 와 오류 문구는 **닿지 않는 코드였다.**
     * 지웠다 — 있는데 안 도는 방어는 다음 사람이 있다고 믿는다.
     */
    void Promise.all([
      loadLibrary(),
      fetch("/api/poster/projects", { cache: "no-store" })
        .then((response) => response.json())
        .then((body) => {
          if (!body?.ok) throw new Error("포스터 목록을 읽지 못했습니다.");
          return body.projects as PosterWork[];
        })
        .catch(() => {
          // 이쪽은 가를 수 있다. 광고 마스터가 안 보이는 것이 이 화면에서
          // 가장 나쁜 실패이므로, 조용히 빈 목록으로 넘기지 않는다.
          setError("만든 작업 목록을 불러오지 못했습니다. 새로고침해 주세요.");
          return [] as PosterWork[];
        }),
    ])
      .then(([library, posters]) => setItems(adSourceItems(library, posters)))
      /**
       * **가정이 깨지는 날을 대비해 상태만 풀어 준다.**
       *
       * 지금 `loadLibrary()` 는 거절하지 않는다 — 그것이 부르는 넷이 전부
       * `catch { return [] }` 다. 문제는 **그 사실이 다른 파일에 있다**는
       * 점이다. `lib/library.ts` 는 화면 넷이 함께 쓰고, 거기서 `catch` 하나가
       * 빠지는 날 이 화면은 「불러오는 중…」에 **영원히 멈춘다.**
       *
       * 문구는 안 붙인다 — 지금은 닿지 않는 길이라 거짓 안내가 된다.
       * 목록을 비워 「보관된 작업이 없습니다」로 끝내면 최소한 멈추지는 않는다.
       */
      .catch(() => setItems([]));
  }, []);

  async function chooseItem(next: AdSourceItem) {
    const mine = (token.current += 1);
    setItem(next);
    setImages(null);
    setPosition(0);
    setResults(null);
    setError(null);
    try {
      const loaded = next.source === "poster"
        ? await posterItemImages(next.id)
        : libraryImagePicks((await getAccountItemImages(
          { id: next.id, title: next.title } as LibraryItem,
        ))?.images ?? []);
      if (mine !== token.current) return;
      setImages(loaded);
      /**
       * **첫 장을 고른 상태로 시작한다.**
       *
       * `position` 은 이제 배열 번호가 아니라 **서버 번호**다. `0` 으로 두면
       * 목록에 0번이 없을 때(라이브러리에서 첫 그림의 서명이 실패하면 그렇다)
       * **아무것도 선택돼 보이지 않고**, 그 상태로 뽑으면 사용자가 본 적 없는
       * 0번을 보내 「찾을 수 없습니다」가 온다 — 썸네일은 멀쩡히 보이는데.
       */
      setPosition(loaded[0]?.position ?? 0);
    } catch {
      // 여기서도 삼키면 썸네일 줄이 영영 안 나타난다.
      if (mine !== token.current) return;
      setImages([]);
      setError("이 작업의 이미지를 불러오지 못했습니다.");
    }
  }

  async function run() {
    if (!item) return;
    const mine = (token.current += 1);
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch("/api/ad/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, position, specIds: picked, source: item.source }),
      });
      const body = await response.json().catch(() => null);
      if (mine !== token.current) return;
      if (!response.ok || !body?.ok) {
        // 본문 없는 404 도 온다(기능이 꺼짐·그림 없음). 상태로 갈라 말한다.
        setError(failureMessage(response.status, body?.message));
        return;
      }
      setResults(body.results as ResultEntry[]);
    } catch {
      if (mine === token.current) setError("서버에 닿지 못했습니다.");
    } finally {
      // **토큰을 보고 풀면 안 된다.** 토큰이 바뀐 경우 `busy` 가 영영 안 풀려
      // 화면 전체가 잠기고 새로고침 말고는 길이 없다. 지금은 토큰을 올리는 두
      // 길이 모두 `disabled={busy}` 뒤에 있어 도달 불가지만, 그 네 곳 중 하나만
      // 빠지면 바로 잠긴다. 동시 실행은 이미 막혀 있으니 무조건 해제가 낫다.
      // 늦게 온 응답은 위의 토큰 검사가 여전히 버린다.
      setBusy(false);
    }
  }

  /**
   * **미리보기가 만든 바이트를 그대로 묶는다.**
   *
   * 서버에 다시 묻지 않는다 — 그러면 같은 파생이 두 번 돈다(설계 §5.2).
   * `jszip` 은 이미 이 저장소에 있고 `ResultViewer.tsx` 가 같은 방식으로 쓴다.
   */
  async function download() {
    // **검증에 걸린 것은 안 담는다.** 담으면 포털이 반려할 파일이 정상 파일과
    // 같은 이름으로 한 봉투에 들어간다(설계 §8).
    const made = downloadable(results ?? []);
    if (!made.length) return;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const entry of made) {
        zip.file(zipEntryName(entry.specId, entry.format), bytesFromDataUrl(entry.dataUrl!));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      // `ResultViewer.tsx` 와 `redesign-wizard.tsx` 가 쓰는 관례다 — DOM 에 붙이지
      // 않고 클릭하면 일부 브라우저가 무시한다.
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `광고규격-${made.length}개.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // **삼키면 버튼을 눌러도 아무 일이 안 일어난다.** `atob` 은 깨진 base64 에
      // `DOMException` 을 던지는데, `void download()` 라 미처리 rejection 이 되어
      // 화면에는 흔적조차 안 남는다.
      setError("ZIP 을 만들지 못했습니다. 다시 뽑아 주세요.");
    }
  }

  const missingRequired = missingRequiredCount(ROWS, picked);
  const madeCount = downloadable(results ?? []).length;
  const excluded = excludedCount(results ?? []);
  const noImages = images !== null && images.length === 0;

  return (
    /*
      **폭과 여백을 셸에 맡긴다.** 초판은 `mx-auto max-w-5xl p-6` 을 얹었는데,
      `AppShell` 의 `<main>` 이 이미 `px-[clamp(16px,2.2vw,52px)] pb-6 pt-4` 를
      준다(`app-shell.tsx:267`) — 여백이 두 겹이 되고 이 화면만 좁게 떴다.
      미리보기를 실제 크기로 깔아야 하는 화면이라(§5.2) 좁힐 이유도 없다.
    */
    <div className="grid gap-8">
      {/* `/poster`·`/sns` 첫 화면과 같은 머리말이다 — 라벨·제목·설명. */}
      <header className="grid">
        <p className="text-meta text-subtle-foreground">AD</p>
        <h1 className="mt-1 text-h1">광고 규격으로 내보내기</h1>
        <p className="mt-2 text-body text-muted-foreground">
          만들어 둔 그림 한 장에서 포털 광고 규격을 뽑습니다. 새로 만들지 않으므로 비용이 들지 않습니다.
        </p>
      </header>

      <Card className="grid gap-3 p-4">
        <h2 className="text-sm font-medium">1. 그림 고르기</h2>
        {items === null ? (
          <p className="text-meta text-subtle-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-meta text-subtle-foreground">
            보관된 작업이 없습니다. <Link href="/library" className="underline">라이브러리</Link>에서 먼저 저장해 주세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((entry) => (
              <Button
                key={entry.id}
                type="button"
                size="sm"
                variant={item?.id === entry.id ? "default" : "secondary"}
                aria-pressed={item?.id === entry.id}
                disabled={busy}
                onClick={() => void chooseItem(entry)}
              >
                {entry.title || "제목 없음"}
              </Button>
            ))}
          </div>
        )}

        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {images.map((image) => (
              <button
                key={image.position}
                type="button"
                disabled={busy}
                aria-pressed={position === image.position}
                onClick={() => { setPosition(image.position); setResults(null); }}
                className={cn(
                  // `border-transparent` 상태에서는 초점이 아예 안 보인다.
                  "h-20 w-20 overflow-hidden rounded border-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  position === image.position ? "border-foreground" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.image} alt={image.sectionName} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {noImages && (
          <p className="text-meta text-subtle-foreground">
            이 작업에는 서버에 보관된 이미지가 없습니다. 다른 작업을 골라 주세요.
          </p>
        )}
      </Card>

      <Card className="grid gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">2. 규격 고르기</h2>
          <span className="text-meta text-subtle-foreground">{picked.length}개 고름</span>
        </div>

        <ul className="grid gap-1">
          {ROWS.map((row) => {
            const checked = picked.includes(row.spec.id);
            return (
              <li key={row.spec.id}>
                <label
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-sm",
                    row.supported ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!row.supported || busy}
                    onChange={() => {
                      setResults(null);
                      setPicked((current) => current.includes(row.spec.id)
                        ? current.filter((id) => id !== row.spec.id)
                        : [...current, row.spec.id]);
                    }}
                  />
                  <span className="text-subtle-foreground">{PORTAL_LABEL[row.spec.portal]}</span>
                  <span>{row.spec.label}</span>
                  {row.spec.required && <Badge variant="secondary">필수</Badge>}
                  {/* 미검증 규격임을 데이터가 말한다(설계 §11). 화면이 감추면 안 된다. */}
                  {row.spec.sourceKind === "reference" && <Badge variant="outline">참고</Badge>}
                  {!row.supported && (
                    <span className="text-meta text-subtle-foreground">— {row.unsupportedReason}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {/*
          초판은 여기에 「못 뽑는 규격이 있습니다」만 뒀는데, 그 경고는 **도달할 수
          없었다** — 고른 것은 지원되는 것에서만 시작하고 미지원 체크박스는
          `disabled` 라 켤 수가 없다. 정작 설계 §9 원칙 1 의 뒷 절반인
          「필수를 끄면 알린다」가 없었다.
        */}
        {missingRequired > 0 && (
          <p className="text-meta text-destructive" role="alert">
            필수 규격 {missingRequired}개가 꺼져 있습니다. 빠지면 포털이 반려할 수 있습니다.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            disabled={!item || !picked.length || busy || noImages}
            onClick={() => void run()}
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            뽑아 보기
          </Button>
          <span className="text-meta text-subtle-foreground">
            {/* 이 기능의 핵심이 「새로 만들지 않는다」이므로 그것을 말한다. */}
            새로 만들지 않습니다 · 비용 0
          </span>
        </div>
        {error && <p className="text-meta text-destructive" role="alert">{error}</p>}
      </Card>

      {results && (
        <Card className="grid gap-3 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">3. 확인하고 내려받기</h2>
            <span className="text-meta text-subtle-foreground" aria-live="polite">
              {madeCount}개 나옴
            </span>
          </div>
          {/*
            **띠가 없는 것을 「제약이 없다」로 읽히게 두면 안 된다.** `safeArea` 를
            가진 규격은 카카오 디스플레이 넷뿐이고, 나머지 열셋에 띠가 없는 것은
            제약이 없어서가 아니라 **우리 데이터에 없어서**다(설계 §11).
          */}
          <p className="text-meta text-subtle-foreground">
            <strong>눈으로 확인해 주세요.</strong> 글자가 읽히는지, 주인공이 잘리지 않았는지는
            자동 검증이 못 잡습니다. 띠로 덮인 곳은 포털이 가릴 수 있는 자리입니다 —
            <strong>안전영역이 공개된 규격에만 띠가 붙습니다.</strong> 띠가 없다고 제약이
            없는 것은 아닙니다.
          </p>

          {/*
            **실제 크기로 깐다**(설계 §5.2). 전부 같은 폭으로 그리면 214×214 가
            확대되어 실제보다 잘 읽히게 보인다 — 「글자가 읽히는지 보세요」라고
            적어 놓고 읽히는지 볼 수 없는 크기로 보여 주는 셈이다.
          */}
          <div ref={grid} className="flex flex-wrap items-start gap-4">
            {results.map((entry) => (
              <figure
                key={entry.specId}
                className="grid gap-1"
                style={{ width: previewWidth(entry.target, cellWidth), maxWidth: "100%" }}
              >
                {/*
                  **`overflow-hidden` 은 모양이 아니라 기능이다.**
                  `safeAreaOverlayStyle` 의 9999px 그림자를 여기서 자른다.
                  지우면 그림자가 새어 **격자 전체가 붉게 덮인다.** jsdom 이 없어
                  시험이 못 잡는 유일한 자리다(`export-rules.ts` 머리말).
                */}
                <div className="relative overflow-hidden rounded border bg-muted">
                  {entry.dataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.dataUrl} alt={entry.label} className="w-full" />
                      {entry.safeArea && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute"
                          style={safeAreaOverlayStyle(entry.safeArea, entry.target)}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex h-24 items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-subtle-foreground" />
                    </div>
                  )}
                </div>
                <figcaption className="grid gap-0.5 text-meta">
                  <span className="flex items-center gap-1">
                    {entry.label}
                    {/* 「참고」가 2단계 목록에만 붙어 있어, 결과만 보는 사람에게는
                        미검증이라는 사실이 전달되지 않았다(설계 §11). */}
                    {entry.sourceKind === "reference" && <Badge variant="outline">참고</Badge>}
                  </span>
                  <span className="text-subtle-foreground">
                    {entry.target.width}×{entry.target.height}
                    {entry.byteLength ? ` · ${Math.round(entry.byteLength / 1024)}KB` : ""}
                    {entry.quality ? ` · q${entry.quality}` : ""}
                    {/* 1:1 이 아니면 그렇다고 말한다. 안 그러면 사람이 이 크기로
                        읽히는지 판단해 버린다. */}
                    {entry.dataUrl && !isActualSize(entry.target, cellWidth)
                      && " · 실제보다 작게 보임"}
                  </span>
                  {entry.shrink && entry.shrink > SHRINK_WARNING && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {entry.shrink}배 줄임 — 글자가 읽히는지 보세요
                    </span>
                  )}
                  {entry.status === "failed" && (
                    <span className="text-destructive">{entry.reason}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" disabled={!madeCount} onClick={() => void download()}>
              <Download className="mr-1 h-4 w-4" />
              {madeCount}개 내려받기 (ZIP)
            </Button>
            {excluded > 0 && (
              <span className="text-meta text-destructive">
                반려될 수 있는 {excluded}개는 봉투에서 뺐습니다
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
