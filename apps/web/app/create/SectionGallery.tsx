"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { GeneratedResult, SectionBlueprint } from "@fixup/pdp-core";
import { apiJson } from "./pdp-utils";
import { Badge, Button, cn } from "@fixup/ui";

/**
 * 섹션 갤러리 — 만든 섹션들을 한눈에 보고 검토하는 화면.
 *
 * 왜 필요한가: 편집기는 한 번에 한 장만 보여준다. 섹션이 9개면 전체 흐름을
 * 보려고 화살표를 아홉 번 눌러야 했다. 운영자가 지적한 실제 불편이다.
 *
 * 보기 방식 세 가지
 * - 격자: 전체를 한눈에. 카드 크기 3단계로 밀도를 고른다
 * - 이어보기: 상세페이지는 세로로 이어 붙는 물건이라, 최종 모습 그대로 확인한다
 * - 모달: 카드를 눌러 크게. ← → 로 이동, Esc 로 닫는다
 */

type Section = GeneratedResult["blueprint"]["sections"][number];
export type GalleryViewMode = "grid" | "stitched";
export type GalleryCardSize = "small" | "medium" | "large";

const CARD_SIZE_CLASS: Record<GalleryCardSize, string> = {
  small: "[grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]",
  medium: "[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]",
  large: "[grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]",
};

const SIZE_LABEL: Array<{ value: GalleryCardSize; label: string }> = [
  { value: "small", label: "작게" },
  { value: "medium", label: "보통" },
  { value: "large", label: "크게" },
];

interface SectionGalleryProps {
  sections: Section[];
  sectionKeys: string[];
  generatingKeys: string[];
  layerCounts: Record<string, number>;
  onGenerate: (index: number) => void;
  onGenerateAllMissing: () => void;
  onEdit: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  onGoEdit: () => void;
  getName: (section: Section) => string;
  getGoal: (section: Section) => string;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-meta text-subtle-foreground">{label}</span>
      <div className="flex gap-0.5 rounded-full bg-background p-0.5 shadow-[var(--shadow-ring)]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold transition-colors",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SectionGallery({
  sections,
  sectionKeys,
  generatingKeys,
  layerCounts,
  onGenerate,
  onGenerateAllMissing,
  onEdit,
  onMove,
  onDelete,
  onAdd,
  onGoEdit,
  getName,
  getGoal,
}: SectionGalleryProps) {
  const [viewMode, setViewMode] = useState<GalleryViewMode>("grid");
  const [cardSize, setCardSize] = useState<GalleryCardSize>("medium");
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const generatedCount = sections.filter((section) => section.generatedImage).length;
  const missingCount = sections.length - generatedCount;
  const isBusy = generatingKeys.length > 0;

  const closeZoom = useCallback(() => setZoomIndex(null), []);
  const stepZoom = useCallback(
    (delta: number) =>
      setZoomIndex((current) => {
        if (current === null) {
          return current;
        }
        const next = current + delta;
        return next < 0 || next >= sections.length ? current : next;
      }),
    [sections.length]
  );

  // 모달이 열려 있을 때만 키보드를 가로챈다. 닫혀 있으면 편집기 단축키와 부딪힌다.
  useEffect(() => {
    if (zoomIndex === null) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeZoom();
      } else if (event.key === "ArrowLeft") {
        stepZoom(-1);
      } else if (event.key === "ArrowRight") {
        stepZoom(1);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeZoom, stepZoom, zoomIndex]);

  const zoomSection = zoomIndex === null ? null : sections[zoomIndex];

  // 마음에 든 결과를 다음 작업의 디자인 레퍼런스로 남긴다.
  // 실패해도 조용히 넘기지 않는다 — 저장된 줄 알고 넘어가면 나중에 없어서 당황한다.
  const [savingReference, setSavingReference] = useState(false);
  const [referenceNotice, setReferenceNotice] = useState("");

  const saveAsReference = async (section: SectionBlueprint | null, index: number) => {
    if (!section?.generatedImage || savingReference) return;
    setSavingReference(true);
    setReferenceNotice("");
    try {
      const [, mimeType = "image/png", imageBase64 = ""] =
        /^data:([^;]+);base64,(.*)$/.exec(section.generatedImage) ?? [];
      const response = await apiJson<{ ok: boolean; message?: string }>("/pdp/style-references", {
        method: "POST",
        body: JSON.stringify({
          name: `${getName(section)} (${index + 1}번 섹션)`,
          source: "generated",
          imageBase64,
          mimeType,
        }),
      });
      setReferenceNotice(
        response.ok
          ? "레퍼런스로 저장했습니다. 다음 작업에서 후보로 나옵니다."
          : response.message ?? "레퍼런스로 저장하지 못했습니다.",
      );
    } catch (error) {
      setReferenceNotice(
        error instanceof Error ? error.message : "레퍼런스로 저장하지 못했습니다.",
      );
    } finally {
      setSavingReference(false);
    }
  };

  return (
    <div className="min-w-0">
      {/* 고정(sticky)은 생성 중일 때만 건다.
          고정된 막대는 위든 아래든 스크롤에 지나가는 내용을 덮는다. 실제로
          카드의 '다시 생성 / 편집' 버튼 8개가 가려졌다. 생성 중에는 그 버튼들이
          어차피 비활성이고 진행 상황을 봐야 하므로 그때만 고정한다. */}
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg p-3 shadow-[var(--shadow-ring)]",
          isBusy ? "sticky top-0 z-30 bg-card/95 backdrop-blur" : "bg-card"
        )}
      >
        <SegmentedControl
          label="보기"
          value={viewMode}
          options={[
            { value: "grid", label: "격자" },
            { value: "stitched", label: "이어보기" },
          ]}
          onChange={setViewMode}
        />
        {viewMode === "grid" ? (
          <SegmentedControl label="카드 크기" value={cardSize} options={SIZE_LABEL} onChange={setCardSize} />
        ) : null}

        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${sections.length ? Math.round((generatedCount / sections.length) * 100) : 0}%` }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums">
            {generatedCount} / {sections.length} 완료
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {missingCount > 0 ? (
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" size="sm" disabled={isBusy} onClick={onGenerateAllMissing}>
                {isBusy ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin" />
                ) : (
                  <Sparkles size={15} className="mr-1.5" />
                )}
                남은 {missingCount}장 만들기
              </Button>
              <span className="text-[11px] text-subtle-foreground">전부 성공 시 최대 {missingCount}장 차감</span>
            </div>
          ) : null}
          <Button size="sm" disabled={!generatedCount || isBusy} onClick={onGoEdit}>
            편집으로
            <ChevronRight size={15} className="ml-1" />
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-subtle-foreground">
        카드를 누르면 크게 열립니다 · ← → 이동 · Esc 닫기
      </p>

      {viewMode === "grid" ? (
        <div className={cn("grid gap-3", CARD_SIZE_CLASS[cardSize])}>
          {sections.map((section, index) => {
            const key = sectionKeys[index] ?? String(index);
            const busy = generatingKeys.includes(key);
            const layers = layerCounts[key] ?? 0;

            return (
              <article
                key={key}
                className="flex flex-col overflow-hidden rounded-lg bg-card shadow-[var(--shadow-ring)]"
              >
                <button
                  type="button"
                  onClick={() => section.generatedImage && setZoomIndex(index)}
                  disabled={!section.generatedImage}
                  aria-label={`${getName(section)} 크게 보기`}
                  className={cn(
                    "relative block aspect-[3/4] w-full overflow-hidden bg-canvas",
                    section.generatedImage ? "cursor-zoom-in" : "cursor-default"
                  )}
                >
                  {section.generatedImage ? (
                    <img
                      alt={getName(section)}
                      src={section.generatedImage}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-subtle-foreground">
                      <ImageIcon size={22} />
                    </span>
                  )}

                  <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-foreground/75 text-xs font-bold text-background">
                    {index + 1}
                  </span>

                  {busy ? (
                    <span className="absolute inset-0 grid place-items-center bg-background/70">
                      <Loader2 size={22} className="animate-spin text-primary" />
                    </span>
                  ) : null}
                </button>

                <div className="flex-1 p-3">
                  <strong className="block truncate text-sm">{getName(section)}</strong>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{getGoal(section)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant={section.generatedImage ? "green" : "outline"}>
                      {section.generatedImage ? "생성됨" : "대기 중"}
                    </Badge>
                    {layers > 0 ? <Badge variant="secondary">레이어 {layers}</Badge> : null}
                  </div>
                </div>

                {/* 순서 변경은 드래그 대신 버튼으로 둔다. 터치·키보드에서도 되고
                    실수로 끌어 옮기는 사고가 없다. */}
                <div className="flex items-center gap-1 border-t px-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${getName(section)} 위로`}
                    disabled={isBusy || index === 0}
                    onClick={() => onMove(index, index - 1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${getName(section)} 아래로`}
                    disabled={isBusy || index === sections.length - 1}
                    onClick={() => onMove(index, index + 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${getName(section)} 삭제`}
                    className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isBusy || sections.length <= 1}
                    onClick={() => onDelete(index)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>

                <div className="flex gap-1.5 p-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isBusy}
                    onClick={() => onGenerate(index)}
                  >
                    {busy ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : section.generatedImage ? (
                      <RefreshCw size={14} className="mr-1.5" />
                    ) : (
                      <Sparkles size={14} className="mr-1.5" />
                    )}
                    {section.generatedImage ? "다시 생성" : "생성"}
                  </Button>
                  <Button size="sm" onClick={() => onEdit(index)} disabled={isBusy || !section.generatedImage}>
                    <Pencil size={14} className="mr-1.5" />
                    편집
                  </Button>
                </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={onAdd}
            disabled={isBusy}
            className="grid min-h-[220px] place-items-center gap-1.5 rounded-lg border border-dashed bg-card/50 p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
              <Plus size={20} />
            </span>
            <strong className="text-sm">섹션 추가</strong>
            <span className="text-xs text-subtle-foreground">빈 섹션을 뒤에 만듭니다</span>
          </button>
        </div>
      ) : (
        /* 이어보기 — 상세페이지는 세로로 이어 붙는 물건이라 최종 모습 그대로 본다.
           틈 없이 붙여야 실제와 같다. */
        <div className="rounded-lg bg-card p-4 shadow-[var(--shadow-ring)]">
          <p className="mb-3 text-sm text-muted-foreground">
            실제 상세페이지처럼 위에서 아래로 이어 붙인 모습입니다. 이미지가 없는 섹션은 자리만 표시됩니다.
          </p>
          <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-md bg-canvas shadow-[var(--shadow-ring)]">
            {sections.map((section, index) => {
              const key = sectionKeys[index] ?? String(index);

              return section.generatedImage ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => setZoomIndex(index)}
                  className="block w-full cursor-zoom-in"
                  aria-label={`${getName(section)} 크게 보기`}
                >
                  <img alt={getName(section)} src={section.generatedImage} className="block w-full" />
                </button>
              ) : (
                <div
                  key={key}
                  className="grid aspect-[3/4] place-items-center border-y border-dashed text-center text-sm text-subtle-foreground"
                >
                  <span>
                    {index + 1}. {getName(section)}
                    <br />
                    <span className="text-xs">아직 이미지가 없습니다</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {zoomSection?.generatedImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${getName(zoomSection)} 크게 보기`}
          className="fixed inset-0 z-[60] flex flex-col bg-foreground/80 p-4 backdrop-blur-sm"
          onClick={closeZoom}
        >
          <div className="mx-auto flex w-full max-w-5xl flex-none items-center gap-3 pb-3 text-background">
            <div className="min-w-0">
              <strong className="block truncate text-sm">
                {(zoomIndex ?? 0) + 1}. {getName(zoomSection)}
              </strong>
              <span className="block truncate text-xs opacity-80">{getGoal(zoomSection)}</span>
            </div>
            <span className="ml-auto text-sm tabular-nums opacity-90">
              {(zoomIndex ?? 0) + 1} / {sections.length}
            </span>
            <button
              type="button"
              onClick={closeZoom}
              aria-label="닫기"
              className="grid h-9 w-9 place-items-center rounded-full bg-background/15 hover:bg-background/25"
            >
              <X size={18} />
            </button>
          </div>

          {/* 이미지 영역 클릭은 닫기로 새어나가지 않게 막는다. */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              disabled={(zoomIndex ?? 0) === 0}
              aria-label="이전 섹션"
              className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
            >
              <ChevronLeft size={22} />
            </button>

            <img
              alt={getName(zoomSection)}
              src={zoomSection.generatedImage}
              className="max-h-full max-w-full rounded-md object-contain shadow-[var(--shadow-elevate)]"
            />

            <button
              type="button"
              onClick={() => stepZoom(1)}
              disabled={(zoomIndex ?? 0) === sections.length - 1}
              aria-label="다음 섹션"
              className="grid h-11 w-11 flex-none place-items-center rounded-full bg-background/15 text-background hover:bg-background/25 disabled:opacity-30"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div
            className="mx-auto flex w-full max-w-5xl flex-none justify-center gap-2 pt-3"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const target = zoomIndex ?? 0;
                closeZoom();
                onEdit(target);
              }}
            >
              <Pencil size={14} className="mr-1.5" />이 섹션 편집하기
            </Button>
            {/*
              마음에 든 결과를 다음 작업의 디자인 레퍼런스로 남긴다.
              쌓일수록 고를 수 있는 폭이 넓어지고, 그래야 페이지끼리 닮는 것을 막는다.
            */}
            <Button
              variant="outline"
              size="sm"
              disabled={savingReference}
              onClick={() => void saveAsReference(zoomSection, zoomIndex ?? 0)}
            >
              <Palette size={14} className="mr-1.5" />
              {savingReference ? "저장 중…" : "레퍼런스로 저장"}
            </Button>
          </div>

          {referenceNotice ? (
            <p
              className="mx-auto max-w-5xl flex-none pt-2 text-center text-xs text-background/80"
              onClick={(event) => event.stopPropagation()}
            >
              {referenceNotice}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
