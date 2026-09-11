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
import {
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
import { buildImageFileName, downloadDataUrl } from "./redesign-files";
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
  if (!project) {
    return <Card><CardContent>아직 생성된 프로젝트가 없습니다.</CardContent></Card>;
  }
  const showRollout = project.sections.length < 8;
  const title = projectDisplayTitle(project);
  const downloadableSections = project.sections.filter((section) => section.imageUrl);
  const facts = Array.isArray((project?.analysis as any)?.verified_facts)
    ? ((project!.analysis as any).verified_facts as string[])
    : [];

  function downloadAllImages() {
    if (downloadableSections.length === 0) {
      onToast("다운로드할 이미지가 없습니다.");
      return;
    }

    downloadableSections.forEach((section, index) => {
      window.setTimeout(() => {
        downloadDataUrl(section.imageUrl || "", buildImageFileName(title, section, index));
      }, index * 250);
    });
    onToast(`${downloadableSections.length}개 이미지를 다운로드합니다.`);
  }

  return (
    <section>
      <Topbar eyebrow="RESULTS" title={title}>
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
        <SaveImagesToLibrary
          images={downloadableSections.map((section, index) => ({
            fileUrl: section.imageUrl as string,
            title: `리디자인 ${index + 1}`,
          }))}
          disabled={downloadableSections.length === 0}
        />
        <Button variant="secondary" onClick={() => onToast("히어로 1장 재생성은 다음 단계에서 연결할 예정입니다.")}><RefreshCw className="size-4" />히어로 다시 생성</Button>
        <Button onClick={downloadAllImages} disabled={downloadableSections.length === 0}><Download className="size-4" />전체 다운로드</Button>
      </Topbar>

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
          <CardHeader>
            <div>
              <CardTitle>리디자인 결과 {project.sections.length}장</CardTitle>
              <CardDescription>저장하면 대시보드의 최근 프로젝트에서 다시 열 수 있습니다.</CardDescription>
            </div>
            <Badge variant="green">{models[project.model].label}</Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 max-2xl:grid-cols-2 max-lg:grid-cols-1">
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
                <strong className="text-foreground">전부 성공 시 최대 {Math.max(0, 8 - project.sections.length)}장 차감.</strong><br />
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
  const [editRequest, setEditRequest] = React.useState("");
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
    <Card className="overflow-hidden shadow-none">
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
      <CardContent className="grid gap-3 p-3">
        {revisions.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {revisions.map((revision, revisionPosition) => (
              <button
                key={revision.id}
                type="button"
                className={cn(
                  "h-7 shrink-0 rounded-full border border-border bg-card px-2 text-[11px] font-bold text-muted-foreground",
                  revisionPosition === revisionIndex && "border-primary bg-primary text-primary"
                )}
                onClick={() => setRevisionIndex(revisionPosition)}
              >
                {revision.label}
              </button>
            ))}
          </div>
        ) : null}
        <div>
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
        <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-2">
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
          <p className="text-[11px] leading-4 text-muted-foreground">수정 이미지가 성공하면 크레딧 1장이 차감됩니다.</p>
        </div>
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
  const isWaiting = progress.percent >= 96;
  const isLongWait = progress.elapsedSeconds >= 120;
  const generationTitle = count > 1
    ? `${count}장 중 ${currentIndex}번째 이미지 생성중입니다.`
    : `${modelLabel} · ${count}장 생성`;
  const statusLabel = isWaiting
    ? isLongWait
      ? "AI가 마무리 작업 중 · 조금 더 걸리고 있어요"
      : "AI가 마무리 작업 중"
    : `${progress.percent}%`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-card/55 p-4 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-primary bg-card/95 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-primary">생성 진행 중</p>
            <h2 className="mt-1 text-base font-bold">{generationTitle}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{count > 1 ? `${modelLabel} · ` : ""}경과 {formatDuration(progress.elapsedSeconds)}</p>
          </div>
          <div className="text-right">
            <strong className={cn("block leading-none", isWaiting ? "text-base" : "text-2xl")}>{statusLabel}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {isWaiting ? "AI가 이미지 최적화 작업을 진행중입니다." : `예상 ${formatDuration(progress.remainingSeconds)} 남음`}
            </span>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-[160px_minmax(0,1fr)] gap-3 text-sm max-sm:grid-cols-1">
          <div className="rounded-md bg-primary px-3 py-2 font-bold text-primary">{progress.phase}</div>
          <div className="rounded-md border border-border bg-card px-3 py-2 leading-relaxed text-muted-foreground">
            {isLongWait && modelLabel === models.openai.label
              ? "정밀형은 이미지 편집 요청이 2분 이상 걸릴 수 있습니다. 특히 긴 상세페이지 캡처나 참조 이미지가 여러 장이면 응답 시간이 길어질 수 있어요."
              : progress.tip}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground max-sm:flex-col max-sm:items-stretch">
          <span>
            성공 시 현재 요청에서 최대 {count}장이 차감됩니다. 취소는 화면의 대기만 멈추며, 이미 외부 API에 전달돼 완료된 이미지는 차감될 수 있습니다.
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

export function generationPhase(percent: number, elapsedSeconds: number) {
  if (percent >= 96) return elapsedSeconds >= 120 ? "최종 최적화 중" : "마무리 작업";
  if (percent < 15) return "원본 변환";
  if (percent < 32) return "프롬프트 구성";
  if (percent < 76) return "이미지 API 처리";
  return "결과 수신 준비";
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

