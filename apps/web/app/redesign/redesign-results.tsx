/*
 * ("use client" 를 두지 않는다 — 이 파일은 화면 진입점이 아니라 그 아래다.
 * 진입점이 선언하면 아래로 다 퍼지는데, 여기서 또 선언하면 Next 가 이 파일도
 * 진입점으로 보고 함수 props 마다 「직렬화되어야 한다」고 경고한다.)
 */
/**
 * 결과 화면과 그 부속들 — 섹션 카드, 진행 막대, 작은 조각들.
 *
 * 여기 있는 것들은 전부 props 로만 움직인다. 화면 상태를 들고 있지 않다.
 */

import * as React from "react";
import { useCreditUnit } from "../_components/credit-policy-provider";
import { failedSectionLines, type FailedSectionLine } from "./failed-sections";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Library as LibraryIcon,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
  cn,
} from "@fixup/ui";
import { IMAGE_LOOKS, IMAGE_LOOK_HINT, IMAGE_LOOK_LABEL, type ImageLook } from "@fixup/shared";
import { SaveImagesToLibrary } from "../_components/save-to-library";
import { copyText } from "../../lib/browser-safe";
import {
  models,
  type GenerationProgress,
  type Model,
  type Project,
  type SectionResult,
} from "./redesign-model";
import { buildImageFileName, downloadDataUrl, sanitizeDownloadName } from "./redesign-files";
import { ensureSectionRevisions, projectDisplayTitle } from "./redesign-project";
import { OptionGroup, PlaceholderThumb, Topbar } from "./redesign-bits";
export function Results({
  project,
  rolloutRequest,
  setRolloutRequest,
  onToast,
  onSave,
  onSaveToLibrary,
  onEditSection,
  onGenerateRest,
  generating,
  editingSectionId
}: {
  project?: Project | null;
  rolloutRequest: string;
  setRolloutRequest: (request: string) => void;
  onToast: (message: string) => void;
  onSave: () => void;
  onSaveToLibrary: () => void;
  onEditSection: (sectionId: string, editRequest: string, model: Model) => void;
  onGenerateRest: () => void;
  generating: boolean;
  editingSectionId: string | null;
}) {
  // 훅은 이른 반환보다 위에 있어야 한다. 아래에 두면 프로젝트가 없는 렌더에서만
  // 건너뛰어, 렌더마다 훅 차례가 달라진다.
  const 단위 = useCreditUnit();
  const [zipping, setZipping] = React.useState(false);
  if (!project) {
    return <Card><CardContent>아직 생성된 프로젝트가 없습니다.</CardContent></Card>;
  }
  const showRollout = project.sections.length < 8;
  // 어느 장이 왜 빠졌는지(F-7-8). 사연은 `failed-sections.ts`.
  const 빠진장 = failedSectionLines(project.failedSections);
  const title = projectDisplayTitle(project);
  const downloadableSections = project.sections.filter((section) => section.imageUrl);
  const facts = Array.isArray((project?.analysis as any)?.verified_facts)
    ? ((project!.analysis as any).verified_facts as string[])
    : [];

  /**
   * **한 파일(ZIP)로 내려받는다**(2026-09-23 화면 검수).
   *
   * 전에는 장마다 0.25초 간격으로 따로 내려받게 했다. 브라우저는 한 페이지가
   * 잇달아 여러 파일을 내려받으려 하면 막거나 허락을 묻는다 — 그러면 몇 장은
   * 조용히 안 받아진다. 상세페이지의 「전체 다운로드」와 같은 방식이다.
   */
  async function downloadAllImages() {
    if (downloadableSections.length === 0) {
      onToast("다운로드할 이미지가 없습니다.");
      return;
    }
    setZipping(true);
    try {
      // 누를 때만 불러온다. 화면을 열 때마다 받기엔 크다(약 100KB).
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [index, section] of downloadableSections.entries()) {
        const blob = await (await fetch(section.imageUrl as string)).blob();
        zip.file(`${String(index + 1).padStart(2, "0")}-${buildImageFileName(title, section, index)}`, blob);
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      downloadDataUrl(url, `${sanitizeDownloadName(title || "redesign")}-전체.zip`);
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onToast(`${downloadableSections.length}장을 ZIP 하나로 다운로드했습니다.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "전체 이미지를 내려받지 못했습니다.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <section>
      <Topbar eyebrow="RESULTS" title={title} stacked>
        <Button variant="secondary" onClick={onSave}><FileText className="size-4" />작업 저장</Button>
        <Button
          variant="secondary"
          onClick={onSaveToLibrary}
          disabled={downloadableSections.length === 0}
          title="계정에 올려 다른 기기에서도 볼 수 있게 합니다"
        >
          <LibraryIcon className="size-4" />라이브러리에 저장
        </Button>
        {/* 위 버튼은 리디자인 보관함으로 간다. 이건 참고 이미지로 넣어
            카드뉴스·포스터가 다음 작업의 기준으로 쓸 수 있게 한다. */}
        {/* 옆 단추들과 같은 모양으로. 테두리 없는 글자만 있어 단추로 안 보였다(2026-09-23). */}
        <SaveImagesToLibrary
          images={downloadableSections.map((section, index) => ({
            fileUrl: section.imageUrl as string,
            title: `리디자인 ${index + 1}`,
          }))}
          disabled={downloadableSections.length === 0}
          buttonVariant="secondary"
          buttonClassName="h-9 px-4 text-sm"
        />
        {/*
          「히어로 다시 생성」 단추는 뺐다. 누르면 「다음 단계에서 연결할 예정」이라는
          말만 나오는, 아무 일도 안 하는 단추였다(2026-09-23 화면 검수).
        */}
        <Button onClick={() => void downloadAllImages()} disabled={downloadableSections.length === 0 || zipping}>
          {zipping ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}전체 다운로드
        </Button>
      </Topbar>

      {project.referenceNotice ? (
        <Card className="mb-4 border-warning/30">
          <CardHeader>
            <CardTitle>참고 이미지 일부가 쓰이지 않았습니다</CardTitle>
            <CardDescription>{project.referenceNotice}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {빠진장.length > 0 && (
        <Card className="mb-4 border-warning/30">
          <CardHeader>
            <CardTitle>만들어지지 않은 섹션 {빠진장.length}장</CardTitle>
            <CardDescription>
              아래 섹션만 다시 만들면 됩니다. 이미 만든 이미지는 그대로 있고 다시 차감되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {빠진장.map((line: FailedSectionLine) => (
                <li key={line.label}>
                  <span className="font-bold">{line.label}</span>{" "}
                  <Badge variant={line.skipped ? "secondary" : "destructive"}>
                    {line.skipped ? "시도 안 함" : "실패"}
                  </Badge>
                  <p className="mt-0.5 text-muted-foreground">{line.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {facts.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>원문 근거(전사에서 추출한 정확 사실)</CardTitle>
            <CardDescription>이미지에 구운 텍스트는 정확도 한계가 있어, 정확 인증번호·수치는 아래 텍스트를 최종 기준으로 삼으세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            <Button variant="ghost" size="sm" onClick={() => { void copyText(facts.join("\n")); }}>사실 목록 복사</Button>
          </CardContent>
        </Card>
      )}

      <div className={cn("grid gap-4", showRollout ? "grid-cols-[minmax(0,1fr)_320px] max-xl:grid-cols-1" : "grid-cols-1")}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>리디자인 결과 {project.sections.length}장</CardTitle>
              <CardDescription>저장하면 대시보드의 최근 프로젝트에서 다시 열 수 있습니다.</CardDescription>
            </div>
            <Badge variant="green" className="shrink-0 whitespace-nowrap">{models[project.model].label}</Badge>
          </CardHeader>
          {/*
            **카드 폭을 줄여 한눈에 본다**(2026-09-23 화면 검수). 전에는 1440 화면에서
            두 줄로 놓여 한 장이 폭 550·높이 980 이었고, 여덟 장이면 페이지가
            6천 픽셀이 넘었다. 폭 220 부터 채워 넓은 화면에서는 네 장씩 놓인다.
          */}
          <CardContent className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {project.sections.map((section, index) => (
              <SectionResultCard
                key={section.id}
                section={section}
                index={index}
                projectTitle={title}
                onEditSection={onEditSection}
                editing={editingSectionId === section.id}
                disabled={generating}
              />
            ))}
          </CardContent>
        </Card>

        {showRollout ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>히어로 검토 후 요청</CardTitle>
                <CardDescription>첫 장을 보고 나머지 상세페이지에 반영할 방향을 적어주세요.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Textarea
                value={rolloutRequest}
                onChange={(event) => setRolloutRequest(event.target.value)}
                placeholder="예: 제품은 잘 보이는데 카피가 너무 과장되어 보여요. 나머지는 더 신뢰감 있게, 리뷰/근거 중심으로 만들고 CTA는 덜 튀게 해주세요."
              />
              <Button onClick={onGenerateRest} disabled={generating}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                나머지 상세페이지 만들기
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">전부 성공 시 최대 {Math.max(0, 8 - project.sections.length)}{단위} 차감.</strong><br />
                이 요청은 S2 이후 섹션 생성 프롬프트에 함께 반영됩니다. 먼저 히어로 1장을 확인한 뒤 확장하며, 성공한 이미지만 차감됩니다.
              </p>
            </CardContent>
          </Card>
        </div>
        ) : null}
      </div>
    </section>
  );
}

const quickEditPresets = [
  ["카피 강화", "헤드라인과 핵심 문구를 더 명확하고 구매전환 중심으로 강화해주세요. 근거 없는 수치나 효능은 추가하지 마세요."],
  ["디자인 강화", "전체 톤앤매너는 유지하되 정보 배치, 여백, 타이포 리듬을 더 세련되고 완성도 있게 바꿔주세요."],
  ["CTA 강화", "CTA 영역을 더 잘 보이게 하고 구매 불안을 줄이는 짧은 신뢰 문구를 함께 배치해주세요."],
  ["중복 레이아웃 줄이기", "다른 섹션과 반복되어 보이지 않도록 제품 위치, 카드 구조, 정보 흐름을 다르게 재구성해주세요."],
  ["안전 표현", "과장되거나 효능을 단정하는 표현은 줄이고 식품/건강 카테고리에 안전한 표현으로 완화해주세요."]
];

export function SectionResultCard({
  section,
  index,
  projectTitle,
  onEditSection,
  editing,
  disabled
}: {
  section: SectionResult;
  index: number;
  projectTitle: string;
  onEditSection: (sectionId: string, editRequest: string, model: Model) => void;
  editing: boolean;
  disabled: boolean;
}) {
  const 단위 = useCreditUnit();
  const [editRequest, setEditRequest] = React.useState("");
  // 수정 칸을 펼쳤는가. 카드가 들고 있어야 수정이 끝나거나 실패해도 그대로 남는다.
  const [editOpen, setEditOpen] = React.useState(false);
  const [editModel, setEditModel] = React.useState<Model>("openai");
  const revisions = React.useMemo(() => ensureSectionRevisions(section), [section]);
  const currentIndex = Math.max(0, revisions.findIndex((revision) => revision.imageUrl === section.imageUrl));
  const [revisionIndex, setRevisionIndex] = React.useState(currentIndex);
  const activeRevision = revisions[revisionIndex] || revisions[0];

  React.useEffect(() => {
    setRevisionIndex(currentIndex);
  }, [currentIndex, revisions.length]);

  function addPreset(text: string) {
    setEditRequest((current) => current ? `${current}\n${text}` : text);
  }

  function moveRevision(step: number) {
    if (revisions.length <= 1) return;
    setRevisionIndex((current) => (current + step + revisions.length) % revisions.length);
  }

  return (
    <Card className="flex flex-col overflow-hidden shadow-none">
      <div className="relative aspect-[9/16] border-b border-border bg-muted">
        {activeRevision?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeRevision.imageUrl} alt={`${section.name} ${activeRevision.label}`} className="h-full w-full object-cover" />
        ) : (
          <PlaceholderThumb index={index} />
        )}
        {revisions.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-md transition hover:bg-card"
              onClick={() => moveRevision(-1)}
              aria-label="이전 이미지 보기"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-foreground shadow-md transition hover:bg-card"
              onClick={() => moveRevision(1)}
              aria-label="다음 이미지 보기"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 rounded-md bg-foreground/85 px-2 py-1 text-xs font-bold text-background">
              <span>{activeRevision.label}</span>
              <span>{revisionIndex + 1} / {revisions.length}</span>
            </div>
          </>
        ) : null}
      </div>
      {/* 섹션 이름이 두 줄이어도 단추 줄이 옆 카드와 맞게, 설명이 남는 높이를 가진다. */}
      <CardContent className="flex flex-1 flex-col gap-3 p-3">
        {revisions.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {revisions.map((revision, revisionPosition) => (
              <button
                key={revision.id}
                type="button"
                className={cn(
                  "h-7 shrink-0 rounded-full border border-border bg-card px-2 text-[11px] font-bold text-muted-foreground",
                  // 고른 것이 배경과 같은 색이라 안 보였다. 저장소의 짝을 쓴다(2026-09-22).
                  revisionPosition === revisionIndex && "border-primary bg-primary text-primary-foreground"
                )}
                onClick={() => setRevisionIndex(revisionPosition)}
              >
                {revision.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{section.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{section.purpose}</p>
          <p className="mt-2 text-xs"><strong>원본 참조:</strong> {section.source}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => activeRevision?.imageUrl && downloadDataUrl(activeRevision.imageUrl, buildImageFileName(projectTitle, section, index, activeRevision.label))}
          disabled={!activeRevision?.imageUrl}
        >
          <Download className="size-4" />
          이미지 다운로드
        </Button>
        {/*
          **수정 칸은 펼쳐서 쓴다**(2026-09-23 화면 검수). 전에는 카드마다 요청 칸·
          빠른 요청 다섯·모델 고르기·단추가 늘 펼쳐져, 여덟 장이면 같은 양식이
          여덟 번 반복됐다. 펼침은 카드가 들고 있다 — `editing` 에 묶으면 수정이
          끝나는 순간(실패해도) 칸이 접혀 방금 적은 요청이 가려졌다(독립 리뷰).
        */}
        <details
          className="group rounded-md border border-border bg-muted/40"
          open={editOpen}
          onToggle={(event) => setEditOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            이 섹션 수정하기
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
        <div className="grid gap-2 border-t border-border p-2">
          <label className="text-xs font-bold text-muted-foreground">섹션 수정 요청</label>
          <Textarea
            value={editRequest}
            onChange={(event) => setEditRequest(event.target.value)}
            placeholder="예: 이 섹션은 헤드라인을 줄이고, 제품 이미지를 오른쪽으로 옮겨 다른 섹션과 덜 반복되게 해주세요."
            className="min-h-20 text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {quickEditPresets.map(([label, text]) => (
              <Button key={label} type="button" variant="secondary" size="sm" onClick={() => addPreset(text)}>
                {label}
              </Button>
            ))}
          </div>
          <OptionGroup
            label="수정 모델"
            value={editModel}
            options={[["openai", models.openai.label], ["google", models.google.label]]}
            onChange={(value) => setEditModel(value as Model)}
          />
          <Button
            type="button"
            onClick={() => onEditSection(section.id, editRequest, editModel)}
            disabled={disabled || editing}
          >
            {editing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            이 섹션 수정
          </Button>
          <p className="text-xs leading-4 text-muted-foreground">수정 이미지가 성공하면 1{단위} 차감됩니다.</p>
        </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function GenerationProgressPanel({
  progress,
  modelLabel,
  count,
  currentIndex,
  onCancel
}: {
  progress: GenerationProgress;
  modelLabel: string;
  count: number;
  currentIndex: number;
  onCancel: () => void;
}) {
  const 단위 = useCreditUnit();
  const isLongWait = progress.elapsedSeconds >= 120;
  const generationTitle = count > 1
    ? `${count}장 중 ${currentIndex}번째 이미지 생성중입니다.`
    : `${modelLabel} · ${count}장 생성`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-card/55 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-primary bg-card/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-primary">생성 진행 중</p>
            <h2 className="mt-1 text-base font-bold">{generationTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{count > 1 ? `${modelLabel} · ` : ""}경과 {formatDuration(progress.elapsedSeconds)}</p>
          </div>
          {/*
            **아는 것만 센다**(2026-09-22). 전에는 경과 시간으로 퍼센트를
            지어내 4~96 사이에 가뒀다. 늦어지면 96% 에 붙어 「예상 5초 남음」을
            영원히 되풀이했다. 지금은 전사 배치처럼 실제로 셀 수 있는 구간에만
            숫자가 있다.
          */}
          <div className="text-right">
            {progress.kind === "determinate" ? (
              <strong className="block text-2xl leading-none">{progress.percent}%</strong>
            ) : null}
            <span className="mt-1 block text-xs text-muted-foreground">{progress.note}</span>
          </div>
        </div>
        {progress.kind === "determinate" ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${progress.percent ?? 0}%` }}
            />
          </div>
        ) : (
          /* 진척을 모르는 구간이다. 채우는 대신 흐르게 둔다 — 상세페이지와 같은 방식이다. */
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 w-1/3 animate-[pdp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        )}
        <div className="mt-3 grid grid-cols-[160px_minmax(0,1fr)] gap-3 text-sm max-sm:grid-cols-1">
          <div className="rounded-md bg-primary px-3 py-2 font-bold text-primary-foreground">{progress.label}</div>
          <div className="rounded-md border border-border bg-card px-3 py-2 leading-relaxed text-muted-foreground">
            {isLongWait && modelLabel === models.openai.label
              ? "정밀형은 이미지 편집 요청이 2분 이상 걸릴 수 있습니다. 특히 긴 상세페이지 캡처나 참조 이미지가 여러 장이면 응답 시간이 길어질 수 있어요."
              : progress.tip}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground max-sm:flex-col max-sm:items-stretch">
          <span>
            성공 시 현재 요청에서 최대 {count}{단위} 차감됩니다. 취소는 화면의 대기만 멈추며, 이미 외부 API에 전달돼 완료된 이미지는 차감될 수 있습니다.
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            요청 취소
          </Button>
        </div>
      </div>
    </div>
  );
}

export function estimateGenerationSeconds(model: Model, count: number) {
  const setupSeconds = 24;
  const perImageSeconds = model === "google" ? 78 : 65;
  return setupSeconds + Math.max(1, count) * perImageSeconds;
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}초`;
  return `${minutes}분 ${rest.toString().padStart(2, "0")}초`;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

