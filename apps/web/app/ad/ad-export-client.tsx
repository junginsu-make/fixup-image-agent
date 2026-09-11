"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Download, ImageIcon, Loader2 } from "lucide-react";
import { ActionNotices } from "./action-notices";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StepBar, cn,
} from "@fixup/ui";
import type { LibraryItem } from "@fixup/shared";
import { getAccountItemImages } from "../../lib/library";
import { LibraryPickerButton } from "../_components/library-picker";
import { AD_STEPS } from "./steps";
import { planDerivation } from "../../lib/ad/derive";
import type { AdBatchEntry } from "../../lib/ad/batch";
import type { AdSpec } from "../../lib/ad/specs";
import {
  AD_PORTALS, PORTAL_LABEL, PREVIEW_MAX_WIDTH, SHRINK_WARNING, SOURCE_LABEL, actionNotices, adSourceItems, pickerKey,
  type AdAccountWork, type AdPosterWork, type AdReferenceImage,
  bytesFromDataUrl, downloadable, excludedCount, failureMessage, isActualSize, itemFromQuery,
  positionFromQuery, rowsForPortals, startingPosition, togglePortal,
  missingRequiredCount, previewBackdrop, previewWidth,
  cropNotice, libraryImagePicks, posterImagePicks, safeAreaOverlayStyle, specRows,
  zipEntryName,
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
  /**
   * 지금 보고 있는 단계.
   *
   * **어느 단계로든 자유롭게 간다**(운영자 요청 2026-09-11). `StepBar` 에
   * `allowJump` 을 안 넘기면 그렇게 된다 — 이 화면은 새로 만들지 않아서
   * 「아직 없는 단계」가 없고, 되돌아가 다른 그림을 고르는 일이 잦다.
   */
  const [step, setStep] = React.useState<string>("pick");
  const [items, setItems] = React.useState<AdSourceItem[] | null>(null);
  const [item, setItem] = React.useState<AdSourceItem | null>(null);
  const [images, setImages] = React.useState<AdImagePick[] | null>(null);
  const [position, setPosition] = React.useState(0);
  /**
   * **아무 포털도 안 고른 채로 시작한다**(설계 §1 ③).
   *
   * 초판은 필수 9개를 미리 켰는데, 그것이 세 포털에 걸쳐 있어서 한 포털만
   * 쓰는 사람에게는 **안 쓸 것까지 이미 켜진** 화면이었다 — 「무조건
   * 리사이징된다」로 읽힌다. 「빼는」 화면을 「고르는」 화면으로 바꾼다.
   */
  const [portals, setPortals] = React.useState<AdSpec["portal"][]>([]);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [results, setResults] = React.useState<ResultEntry[] | null>(null);
  /** 고른 포털의 규격만 그린다. 매번 세는 대신 한 번만 판단한다. */
  const visibleRows = rowsForPortals(ROWS, portals);

  /**
   * 포털을 켜고 끈다.
   *
   * 켜면 **그 포털의 필수만** 따라 켜지고, 끄면 그 포털 규격이 선택에서 빠진다.
   * 손으로 켠 비필수는 그 포털이 살아 있는 한 남는다 — 껐다 켜는 사이에 고른
   * 것을 뺏지 않는다.
   */
  const onTogglePortal = (portal: AdSpec["portal"]) => {
    setResults(null);
    // **업데이터 안에서 다른 상태를 건드리지 않는다.** 그러면 순수하지 않아
    // React 가 두 번 돌릴 때 선택이 겹쳐 쌓인다 — 실제로 그랬다.
    const next = togglePortal(ROWS, { portals, picked }, portal);
    setPortals(next.portals);
    setPicked(next.picked);
  };
  const [busy, setBusy] = React.useState(false);
  /** ZIP 을 묶는 중. 두 번 누르면 봉투가 둘 나온다. */
  const [zipping, setZipping] = React.useState(false);
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

  /**
   * 고를 수 있는 것을 모은다 — **작업물 · 참고 이미지 · 포스터 작업.**
   *
   * **`loadLibrary()` 를 안 쓴다.** 그 함수는 브라우저 저장분까지 합쳐 주는데
   * 여기서는 전부 버려야 하고, 무엇보다 서버가 준 **`mine` 과 `sourceType` 을
   * 떨어뜨린다** — 누구 것인지와 캐릭터인지를 가릴 수 없게 된다. 이 화면이
   * 쓰는 세 곳만 직접 읽는다.
   *
   * **셋을 각각 가른다.** 하나가 죽어도 나머지는 보여 준다. 전부 실패했을
   * 때만 「불러오지 못했습니다」다 — 참고 이미지 서버 하나 때문에 내 작업물이
   * 안 보이면 안 된다.
   */
  const loadSources = React.useCallback(async () => {
    setItems(null);
    setError(null);

    const readJson = async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(url);
      return body as Record<string, unknown>;
    };

    const [works, references, posters] = await Promise.all([
      readJson("/api/library")
        .then((body) => (body.items ?? []) as AdAccountWork[])
        .catch(() => null),
      readJson("/api/reference-images")
        .then((body) => (body.images ?? []) as AdReferenceImage[])
        .catch(() => null),
      readJson("/api/poster/projects")
        .then((body) => (body.projects ?? []) as AdPosterWork[])
        .catch(() => null),
    ]);

    if (works === null && references === null && posters === null) {
      setError("만든 작업 목록을 불러오지 못했습니다. 새로고침해 주세요.");
      setItems([]);
      return;
    }
    if (works === null || posters === null) {
      // 일부만 실패했다. 목록은 보여 주되 **모자라다는 사실을 숨기지 않는다** —
      // 있어야 할 그림이 안 보이는데 이유를 모르는 것이 가장 나쁘다.
      setError("일부 목록을 불러오지 못했습니다. 찾는 그림이 없으면 새로고침해 주세요.");
    }

    const list = adSourceItems({
      works: works ?? [],
      references: references ?? [],
      posters: posters ?? [],
    });
    setItems(list);
    return list;
  }, []);

  React.useEffect(() => {
    void loadSources().then((list) => {
      if (!list) return;
      /**
       * **결과 화면에서 넘어온 그림을 골라 준다**(설계 §1 ②).
       *
       * 목록을 받은 **뒤에** 판단한다 — 주소만 보고 고르면 그 그림이 실제로
       * 이 사람 것인지 모른 채 뽑기 버튼이 켜진다.
       *
       * **못 찾으면 아무 일도 안 한다.** 남의 id·지워진 id 가 와도 화면은
       * 지금처럼 목록을 보여 준다.
       */
      const query = new URLSearchParams(window.location.search);
      const wanted = itemFromQuery(list, {
        source: query.get("source"),
        id: query.get("id"),
      });
      // **`chooseItem` 을 거친다.** `setItem` 만 하면 그림 목록을 안 불러와
      // 「고를 변형이 없는」 화면이 된다.
      if (wanted) void chooseItem(wanted, positionFromQuery(query.get("position")));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSources]);

  async function chooseItem(next: AdSourceItem, preferred: number | null = null) {
    const mine = (token.current += 1);
    setItem(next);
    setImages(null);
    setPosition(0);
    setResults(null);
    setError(null);
    try {
      /*
        **참고 이미지는 한 장짜리다.** 작업물처럼 변형 목록을 물을 곳이 없다 —
        `reference_images` 는 한 줄이 곧 한 장이다. 목록에서 이미 주소를 받아
        왔으므로 그것으로 한 장을 세운다. 서버 번호는 0 이다.
      */
      const loaded = next.source === "poster"
        ? await posterItemImages(next.id)
        : next.source === "reference"
          ? (next.thumbnail
            ? [{ image: next.thumbnail, sectionName: next.title, position: 0 }]
            : [])
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
      // 주소가 가리킨 변형이 실재하면 그것으로 시작한다(설계 §1 ②).
      setPosition(startingPosition(loaded, preferred));
      /*
        **고르면 다음 단계로 넘긴다.** 한 단계씩 보이는 화면에서는 고른 뒤에도
        같은 자리에 머물면 「골랐는데 아무 일도 안 일어난다」가 된다. 되돌아가
        다른 그림을 고르는 길은 막대에 늘 열려 있다.

        그림이 하나도 안 딸려 온 작업은 넘기지 않는다 — 넘겨 봐야 02 에서
        뽑기가 안 눌린다.
      */
      if (loaded.length > 0) setStep("portal");
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
      // 결과는 03 에 그려진다. 뽑아 놓고 안 보여 주면 안 된다.
      setStep("result");
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
    if (!made.length || zipping) return;
    setZipping(true);
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
    } finally {
      setZipping(false);
    }
  }

  /**
   * **보이는 규격만 센다.** 안 고른 포털의 필수를 두고 「빠졌습니다」라고 하면,
   * 카카오만 하려는 사람에게 영원히 지워지지 않는 경고가 뜬다.
   */
  const missingRequired = missingRequiredCount(visibleRows, picked);
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
      {/*
        **진행 막대.** 다른 도구(`/poster`·`/sns`·`/create`·`/redesign`)와 같은
        부품이다. `allowJump` 을 안 넘겨 **어느 단계로든 자유롭게** 간다.
      */}
      <StepBar steps={AD_STEPS} current={step} onJump={setStep} />

      {step === "pick" ? (

      <Card>
        <CardHeader>
          {/* 단계 번호는 두 자리로 채운다 — `POSTER_STEPS` 가 「01 레퍼런스」다. */}
          <CardTitle>01 그림 고르기</CardTitle>
          <CardDescription>만들어 둔 작업에서 한 장을 고릅니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
        {items === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline size-4 animate-spin" />작업을 불러오는 중입니다.
          </p>
        ) : items.length === 0 ? (
          /*
            **아무것도 없는 사람에게 라이브러리를 보내면 안 된다.** 사이드바에
            이 화면이 걸린 뒤로는 **처음 온 사람이 여기를 먼저 누른다** —
            그때 라이브러리로 보내 봐야 거기도 비어 있다. 만드는 곳을 준다.

            이 화면은 새로 만들지 않는다는 것도 함께 말한다. 「광고」라는 말만
            보고 여기서 만들어지는 줄 알면 계속 기다리게 된다.
          */
          <Card className="grid place-items-center gap-3 py-14 text-center">
            <ImageIcon className="size-8 text-muted-foreground" />
            <div className="grid gap-1.5">
              <p className="text-sm font-bold">뽑을 그림이 아직 없습니다</p>
              <p className="text-sm text-muted-foreground">
                이 화면은 새로 만들지 않고 <strong>이미 만들어 둔 그림</strong>에서 규격을 뽑습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/poster/new">이미지 만들기</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/library">라이브러리 보기</Link>
              </Button>
            </div>
          </Card>
        ) : (
          /*
            **다른 화면과 같은 창을 쓴다**(운영자 요청 2026-09-11).

            전에는 이 화면만 격자를 페이지에 통째로 깔았다. 저장소의 다른 아홉
            화면은 `_components/library-picker.tsx` 한 부품으로 창을 띄운다 —
            같은 시스템에서 그림 고르는 방식이 화면마다 다르면 매번 다시 배운다.

            **캐릭터를 안 넘긴다.** 그 부품은 `characters` 를 받아야 캐릭터 칸을
            그린다. 안 넘기면 칸 자체가 안 나온다.

            **`contain` 이다.** 여기 놓이는 것은 광고 마스터라 가로가 길다
            (2:1·1.91:1). 정사각으로 자르면 좌우가 날아가 어느 작업인지 못
            알아본다.

            **`id` 에 출처를 붙인다.** 작업물·참고 이미지·포스터가 한 창에
            섞이는데 세 표의 id 가 겹치지 않는다는 보장이 없다. 겹치면 엉뚱한
            그림이 골라진다.
          */
          <div className="flex flex-wrap items-center gap-3">
            <LibraryPickerButton
              label="라이브러리에서 고르기"
              title="라이브러리에서 고르기"
              description={`고를 수 있는 그림 ${items.length}장 · 눌러서 고릅니다`}
              fit="contain"
              images={items.map((entry) => ({
                id: pickerKey(entry),
                title: entry.title,
                url: entry.thumbnail ?? null,
              }))}
              selectedIds={item ? [pickerKey(item)] : []}
              loading={busy}
              onReload={() => void loadSources()}
              /*
                고르면 `chooseItem` 이 02 로 넘기고, 그러면 이 카드가 통째로
                사라지면서 **창도 함께 닫힌다.** 따로 닫는 코드가 없는 것이
                빠뜨린 것이 아니라 이 구조의 결과다.
              */
              onToggle={(picked) => {
                const found = items.find((entry) => pickerKey(entry) === picked.id);
                // 이미 고른 것을 다시 누르면 그대로 둔다. 이 화면은 한 장만
                // 쓰므로 「빼기」가 할 일이 없다 — 비우면 02·03 이 닫힌다.
                if (found && found.id !== item?.id) void chooseItem(found);
              }}
            />
            {item ? (
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className="truncate font-bold">{item.title}</span>
                <Badge variant="secondary">{SOURCE_LABEL[item.source]}</Badge>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">아직 고르지 않았습니다.</span>
            )}
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
                  "h-20 w-20 overflow-hidden rounded-lg border-2 disabled:opacity-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // 고른 상태는 저장소 전체가 `border-primary` 다 —
                  // `reference-picker`·`library-picker`·`ModelPicker` 가 같다.
                  position === image.position ? "border-primary" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.image}
                  alt={image.sectionName}
                  data-zoomable
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        {noImages && (
          <p className="text-sm text-muted-foreground">
            이 작업에는 서버에 보관된 이미지가 없습니다. 다른 작업을 골라 주세요.
          </p>
        )}
        </CardContent>
      </Card>
      ) : null}

      {step === "portal" ? (
      <Card>
        <CardHeader className="flex-row items-baseline justify-between space-y-0">
          <div className="grid gap-1.5">
            <CardTitle>02 어디에 올릴까요</CardTitle>
            <CardDescription>포털을 고르면 그 포털 규격만 나옵니다. 고른 것만 뽑습니다.</CardDescription>
          </div>
          <span className="text-meta text-subtle-foreground">{picked.length}개 고름</span>
        </CardHeader>
        <CardContent className="grid gap-3">
        {/*
          **포털을 먼저 묻는다**(설계 §1 ③). 한 포털만 쓰는 사람이 안 쓸 규격을
          하나씩 꺼야 했다 — 그것이 「무조건 리사이징된다」로 읽혔다.
          만들 것 고르는 자리(`poster/new-client.tsx:302`)와 같은 버튼 모양이다.
        */}
        <fieldset className="grid gap-2">
          <legend className="text-meta text-subtle-foreground">포털</legend>
          <div className="flex flex-wrap gap-2">
            {AD_PORTALS.map((portal) => (
              <Button
                key={portal}
                type="button" size="sm"
                variant={portals.includes(portal) ? "default" : "secondary"}
                aria-pressed={portals.includes(portal)}
                disabled={busy}
                onClick={() => onTogglePortal(portal)}
              >
                {PORTAL_LABEL[portal]}
              </Button>
            ))}
          </div>
        </fieldset>

        {portals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            올릴 포털을 하나 이상 고르세요. 고른 포털의 규격만 뽑습니다.
          </p>
        ) : (
        <>
        {/* 쌍둥이 화면(`poster/ad-spec-picker.tsx`)과 같이 묶음에 이름을 준다. */}
        <fieldset className="grid gap-1">
          <legend className="sr-only">광고 규격</legend>
        <ul className="grid gap-1">
          {visibleRows.map((row) => {
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
        </fieldset>

        {/*
          초판은 여기에 「못 뽑는 규격이 있습니다」만 뒀는데, 그 경고는 **도달할 수
          없었다** — 고른 것은 지원되는 것에서만 시작하고 미지원 체크박스는
          `disabled` 라 켤 수가 없다. 정작 설계 §9 원칙 1 의 뒷 절반인
          「필수를 끄면 알린다」가 없었다.
        */}
        {/*
          **이후에 사람이 할 일**은 고르는 자리에서 말한다(사용자 요청
          2026-09-08). 결과가 나온 뒤에 「글자가 없네」를 알면 늦는다.
        */}
        <ActionNotices notices={actionNotices(picked, planDerivation)} />

        {/* 목록 안의 안내라 인라인으로 둔다 — 쌍둥이 화면과 짝이 맞는다. */}
        {missingRequired > 0 && (
          <p className="text-sm text-destructive" role="alert">
            필수 규격 {missingRequired}개가 꺼져 있습니다. 빠지면 포털이 반려할 수 있습니다.
          </p>
        )}
        </>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            disabled={!item || !picked.length || busy || noImages}
            onClick={() => void run()}
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {/* 저장소는 도는 동안 글자를 바꾼다 — 「만드는 중…」·「저장 중…」. */}
            {busy ? "뽑는 중…" : "뽑아 보기"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {/* 이 기능의 핵심이 「새로 만들지 않는다」이므로 그것을 말한다. */}
            새로 만들지 않습니다 · 비용 0
          </span>
        </div>
        {/*
          **오류는 상자로 낸다.** 저장소 22곳이 같은 모양을 쓴다 — 같은 마법사인
          `poster/new-client.tsx:247` 이 바로 그렇다. 11px 한 줄로 두면 뽑기가
          실패한 것을 못 보고 다시 누른다.
        */}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        </CardContent>
      </Card>
      ) : null}

      {step === "result" ? (
        <>
      {/*
        **빈 화면으로 두지 않는다.** 단계 막대가 어느 단계로든 보내 주므로,
        아직 안 뽑은 채 03 으로 뛰는 길이 늘 열려 있다. 그때 아무것도 안 그리면
        화면이 고장 난 것처럼 보인다 — 실제로 그랬다(2026-09-11 실측).
      */}
      {!results && (
        <Card className="grid place-items-center gap-3 py-14 text-center">
          <ImageIcon className="size-8 text-muted-foreground" />
          <div className="grid gap-1.5">
            <p className="text-sm font-bold">아직 뽑은 것이 없습니다</p>
            <p className="text-sm text-muted-foreground">
              {item
                ? "02 에서 포털을 고르고 「뽑아 보기」를 누르면 여기에 나옵니다."
                : "01 에서 그림을 먼저 고르세요."}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setStep(item ? "portal" : "pick")}>
            {item ? "02 로 가기" : "01 로 가기"}
          </Button>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between space-y-0">
            <div className="grid gap-1.5">
              <CardTitle>03 확인하고 내려받기</CardTitle>
              <CardDescription>뽑힌 것을 눈으로 보고 봉투에 담습니다.</CardDescription>
            </div>
            <span className="text-meta text-subtle-foreground" role="status">
              {madeCount}개 나옴
            </span>
          </CardHeader>
          <CardContent className="grid gap-3">
          {/*
            **띠가 없는 것을 「제약이 없다」로 읽히게 두면 안 된다.** `safeArea` 를
            가진 규격은 카카오 디스플레이 넷뿐이고, 나머지 열셋에 띠가 없는 것은
            제약이 없어서가 아니라 **우리 데이터에 없어서**다(설계 §11).
          */}
          <p className="text-sm text-muted-foreground">
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
          {/*
            **`min-w-0` 이 없으면 좁은 화면이 통째로 넘친다.**
            grid·flex 의 자식은 기본이 `min-width: auto` 라 **내용보다 작아지지
            않는다.** 미리보기 한 칸이 480px 이면 이 줄이 480px 로 버티고,
            `maxWidth: 100%` 는 그 480px 의 100% 라 아무것도 막지 못한다 —
            실측으로 360px 화면에서 문서가 546px 로 벌어졌다.
            `AppShell` 의 `<main className="min-w-0 …">` 이 같은 것을 막는다.

            폭을 재는 `ResizeObserver` 도 이것이 있어야 참값을 읽는다 — 없으면
            「칸이 넓으니 그림을 크게 → 그래서 칸이 넓다」로 되먹임한다.
          */}
          <div ref={grid} className="flex min-w-0 flex-wrap items-start gap-4">
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
                {entry.dataUrl ? (
                  /*
                    **투명 규격에는 체크무늬를 깐다**(설계 §6.3). 회색 판 위에
                    그리면 투명한지 회색인지 사람이 구분할 수 없다 — 이 기능의
                    존재 이유가 투명인데 그것만 확인이 안 된다.
                  */
                  <div
                    className="relative overflow-hidden rounded border bg-muted"
                    style={previewBackdrop(entry.format)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {/* 「글자가 읽히는지 보세요」라고 적었으면 크게 볼 길도 줘야 한다. */}
                    <img src={entry.dataUrl} alt={entry.label} data-zoomable className="w-full" />
                    {entry.safeArea && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute"
                        style={safeAreaOverlayStyle(entry.safeArea, entry.target)}
                      />
                    )}
                  </div>
                ) : (
                  /*
                    **못 만든 것을 「빈 그림」으로 그리면 안 된다.**
                    초판은 회색 칸에 그림 아이콘을 뒀는데, 그것은 **깨진 이미지와
                    똑같이 생겼다** — 실제로 「이미지가 깨진다」는 보고를 받았다.
                    일부러 안 만든 것과 만들다 실패한 것을 구분할 수 없으면
                    사용자는 고장으로 읽는다.
                  */
                  <div className="grid place-items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-6 text-center">
                    <AlertTriangle className="size-5 text-destructive" />
                    <p className="text-sm font-bold text-destructive">만들지 않았습니다</p>
                  </div>
                )}
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
                  {/* 왜 글자가 잘렸는지 화면이 말해야 한다 — 안 그러면 고장으로 읽힌다. */}
                  {entry.dataUrl && cropNotice(entry.specId, planDerivation) && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {cropNotice(entry.specId, planDerivation)}
                    </span>
                  )}
                  {entry.shrink && entry.shrink > SHRINK_WARNING && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {entry.shrink}배 줄임 — 글자가 읽히는지 보세요
                    </span>
                  )}
                  {/*
                    **「빈 배너에 점 하나」를 알린다**(설계 §5.4②).
                    세로로 긴 피사체를 가로로 긴 배너에 놓으면 폭이 6% 까지
                    쪼그라드는데, 픽셀·형식·용량이 전부 맞아 **규격 검증을
                    통과한다.** 막지 않고 알린다 — 늘이면 찌그러지고 자르면
                    얼굴이 잘린다.
                  */}
                  {entry.tooSmall && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      그림이 너무 작게 들어갔습니다 — 다른 그림을 골라 보세요
                    </span>
                  )}
                  {entry.status === "failed" && (
                    <span className="text-destructive">{entry.reason}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              **묶는 동안 잠근다.** 규격을 많이 고르면 base64 8MB 를 JSZip 으로
              묶는다(`export-rules.ts` 머리말) — 그동안 아무 표시가 없으면
              멈춘 줄 알고 다시 눌러 ZIP 이 둘 나온다. `library/ResultViewer.tsx`
              가 같은 일을 같은 방식으로 한다.
            */}
            <Button type="button" disabled={!madeCount || zipping} onClick={() => void download()}>
              {zipping
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                : <Download className="mr-1 h-4 w-4" />}
              {zipping ? "묶는 중…" : `${madeCount}개 내려받기 (ZIP)`}
            </Button>
            {excluded > 0 && (
              <span className="text-sm text-destructive">
                반려될 수 있는 {excluded}개는 봉투에서 뺐습니다
              </span>
            )}
          </div>
        </CardContent>
        </Card>
      )}
        </>
      ) : null}
    </div>
  );
}
