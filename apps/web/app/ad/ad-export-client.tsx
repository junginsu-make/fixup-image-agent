"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Download, ImageIcon, Loader2 } from "lucide-react";
import { Badge, Button, Card, cn } from "@fixup/ui";
import type { LibraryItem } from "@fixup/shared";
import { loadLibrary, getAccountItemImages, type PdpResultImage } from "../../lib/library";
import { planDerivation } from "../../lib/ad/derive";
import {
  PORTAL_LABEL, SHRINK_WARNING, bytesFromDataUrl, defaultSelection,
  safeAreaOverlayStyle, specRows, zipEntryName,
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

interface ResultEntry {
  specId: string;
  label: string;
  portal: "naver" | "google" | "kakao";
  product: string;
  required: boolean;
  sourceKind: "official" | "reference";
  format: "jpg" | "png" | "png-alpha";
  target: { width: number; height: number };
  safeArea?: { top: number; right: number; bottom: number; left: number };
  status: "ok" | "failed";
  reason?: string;
  failures: string[];
  byteLength?: number;
  quality?: number;
  shrink?: number;
  dataUrl?: string;
}

const ROWS = specRows(planDerivation);

export function AdExportClient() {
  const [items, setItems] = React.useState<LibraryItem[] | null>(null);
  const [item, setItem] = React.useState<LibraryItem | null>(null);
  const [images, setImages] = React.useState<PdpResultImage[] | null>(null);
  const [position, setPosition] = React.useState(0);
  const [picked, setPicked] = React.useState<string[]>(() => defaultSelection(ROWS));
  const [results, setResults] = React.useState<ResultEntry[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadLibrary().then((loaded) => setItems(loaded));
  }, []);

  async function chooseItem(next: LibraryItem) {
    setItem(next);
    setImages(null);
    setPosition(0);
    setResults(null);
    const loaded = await getAccountItemImages(next);
    setImages(loaded?.images ?? []);
  }

  async function run() {
    if (!item) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch("/api/ad/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, position, specIds: picked }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setError(body?.message ?? "뽑지 못했습니다.");
        return;
      }
      setResults(body.results as ResultEntry[]);
    } catch {
      setError("서버에 닿지 못했습니다.");
    } finally {
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
    const made = (results ?? []).filter((entry) => entry.dataUrl);
    if (!made.length) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const entry of made) {
      zip.file(zipEntryName(entry.specId, entry.format), bytesFromDataUrl(entry.dataUrl!));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `광고규격-${made.length}개.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const supported = ROWS.filter((row) => row.supported);
  const madeCount = (results ?? []).filter((entry) => entry.dataUrl).length;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">광고 규격으로 내보내기</h1>
        <p className="text-meta text-subtle-foreground">
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
                onClick={() => void chooseItem(entry)}
              >
                {entry.title || "제목 없음"}
              </Button>
            ))}
          </div>
        )}

        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {images.map((image, index) => (
              <button
                key={image.image}
                type="button"
                onClick={() => { setPosition(index); setResults(null); }}
                className={cn(
                  "h-20 w-20 overflow-hidden rounded border-2",
                  position === index ? "border-foreground" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.image} alt={image.sectionName} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {images && images.length === 0 && (
          <p className="text-meta text-subtle-foreground">이 작업에는 이미지가 없습니다.</p>
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
                    disabled={!row.supported}
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

        {picked.some((id) => !supported.find((row) => row.spec.id === id)) && (
          <p className="text-meta text-destructive">고른 것 중 지금 못 뽑는 규격이 있습니다.</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button type="button" disabled={!item || !picked.length || busy} onClick={() => void run()}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            뽑아 보기
          </Button>
          <span className="text-meta text-subtle-foreground">
            {/* 이 기능의 핵심이 「새로 만들지 않는다」이므로 그것을 말한다. */}
            새로 만들지 않습니다 · 비용 0
          </span>
        </div>
        {error && <p className="text-meta text-destructive">{error}</p>}
      </Card>

      {results && (
        <Card className="grid gap-3 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">3. 확인하고 내려받기</h2>
            <span className="text-meta text-subtle-foreground">{madeCount}개 나옴</span>
          </div>
          <p className="text-meta text-subtle-foreground">
            <strong>눈으로 확인해 주세요.</strong> 글자가 읽히는지, 주인공이 잘리지 않았는지는
            자동 검증이 못 잡습니다. 띠로 덮인 곳은 포털이 가릴 수 있는 자리입니다.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map((entry) => (
              <figure key={entry.specId} className="grid gap-1">
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
                  <span>{entry.label}</span>
                  <span className="text-subtle-foreground">
                    {entry.target.width}×{entry.target.height}
                    {entry.byteLength ? ` · ${Math.round(entry.byteLength / 1024)}KB` : ""}
                    {entry.quality ? ` · q${entry.quality}` : ""}
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

          <div>
            <Button type="button" disabled={!madeCount} onClick={() => void download()}>
              <Download className="mr-1 h-4 w-4" />
              {madeCount}개 내려받기 (ZIP)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
