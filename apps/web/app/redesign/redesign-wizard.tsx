"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
  Library as LibraryIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  StepBar,
  Textarea,
  cn,
  type StepDefinition,
} from "@fixup/ui";
import {
  IMAGE_LOOKS,
  IMAGE_LOOK_HINT,
  IMAGE_LOOK_LABEL,
  type ImageLook,
} from "@fixup/shared";
import { splitFilesToStrips, runTranscription } from "./transcribe-client";
import { SavedImagePicker } from "../create/SavedImagePicker";
import { SaveImagesToLibrary } from "../_components/save-to-library";
import { copyText, randomId } from "../../lib/browser-safe";
import {
  MAX_REFERENCE_IMAGES,
  REDESIGN_STEPS,
  baseSections,
  commerceTips,
  demoProjectTitles,
  knowledgeStorageKey,
  loadKnowledgeItems,
  loadProjects,
  makeProject,
  models,
  projectDbName,
  projectStoreName,
  type GenerationPlan,
  type GenerationProgress,
  type GenerationSummary,
  type KnowledgeItem,
  type Model,
  type Project,
  type SectionResult,
  type SectionRevision,
  type ServerConfig,
  type View,
} from "./redesign-model";
import { fetchServerConfig, readApiResponse, reportClientLog, simplifyPlainTextError } from "./redesign-api";
import { deleteProjectFromDb, isDemoProject, loadSavedProjects, openProjectDb, saveProjectToDb } from "./redesign-storage";
import {
  addSectionRevision,
  ensureSectionRevisions,
  inferTitleFromAnalysis,
  mergeGeneratedProject,
  pickAnalysisText,
  projectDisplayTitle,
  sectionSortNumber,
} from "./redesign-project";
import {
  blobToDataUrl,
  buildImageFileName,
  canvasToDataUrl,
  compressImageForRequest,
  cropImageToPngFile,
  deleteIndexedKnowledge,
  downloadDataUrl,
  estimateDataUrlBytes,
  extractKnowledgeText,
  extractPdfText,
  imageExtension,
  indexKnowledgeFile,
  loadDataUrlImage,
  loadImageElement,
  normalizeFilesForUpload,
  renderImageToReferenceFiles,
  renderPdfToImages,
  sanitizeDownloadName,
} from "./redesign-files";
import { CharacterOptionGroup, ChannelOptionGroup, Dashboard, Workspace } from "./redesign-panels";
import { GenerationProgressPanel, Results, estimateGenerationSeconds, formatDuration, generationPhase, isAbortError } from "./redesign-results";
import { Topbar } from "./redesign-bits";



export function RedesignWizard() {
  const [view, setView] = React.useState<View>("dashboard");
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [activeProject, setActiveProject] = React.useState<Project | null>(null);
  const [selectedModel, setSelectedModel] = React.useState<Model>("openai");
  const [channel, setChannel] = React.useState("스마트스토어");
  // 캐릭터 만들기에서 만든 등장인물. 고르면 섹션마다 같은 사람이 나온다.
  const [characterId, setCharacterId] = React.useState("");
  const [count, setCount] = React.useState(1);
  const [ratio, setRatio] = React.useState("9:16");
  // 기본은 원본의 결을 따라가는 auto. 리디자인은 남의 페이지를 다시 그리는 일이라
  // 원본이 사진이면 사진이 나오는 것이 자연스럽다.
  const [look, setLook] = React.useState<ImageLook>("auto");
  const [files, setFiles] = React.useState<File[]>([]);
  const [knowledgeItems, setKnowledgeItems] = React.useState<KnowledgeItem[]>([]);
  const [request, setRequest] = React.useState(
    "첫 화면에서 제품의 차별점이 바로 보이게 하고, 구매 불안을 줄이는 근거 섹션을 강화해주세요. 과장 표현은 피하고 스마트스토어에 맞춰 스캔이 쉬운 구성으로 정리해주세요."
  );
  const [serverConfig, setServerConfig] = React.useState<ServerConfig>({
    serverOpenaiKeyConfigured: false,
    serverGoogleKeyConfigured: false,
    knowledgeConfigured: false,
    knowledgeDocuments: 0,
    knowledgeChunks: 0,
    canManageKnowledge: false
  });
  const [useSharedKnowledge, setUseSharedKnowledge] = React.useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generationPlan, setGenerationPlan] = React.useState<GenerationPlan | null>(null);
  const [generationProgress, setGenerationProgress] = React.useState<GenerationProgress | null>(null);
  const [generationSummary, setGenerationSummary] = React.useState<GenerationSummary | null>(null);
  const [editingSectionId, setEditingSectionId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState("");
  const [rolloutRequest, setRolloutRequest] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const knowledgeInputRef = React.useRef<HTMLInputElement>(null);
  const generationAbortRef = React.useRef<AbortController | null>(null);
  const retryRequestKeysRef = React.useRef<Record<string, string>>({});
  const transcriptCacheRef = React.useRef<{ key: string; transcript: string | null } | null>(null);

  React.useEffect(() => {
    const initial = loadProjects();
    setProjects(initial);
    setActiveProject(initial[0] ?? null);
    setUseSharedKnowledge(localStorage.getItem("hanirum-use-shared-knowledge") === "true");
    setKnowledgeItems(loadKnowledgeItems());
    fetchServerConfig().then(setServerConfig);
    loadSavedProjects().then((savedProjects) => {
      if (savedProjects.length === 0) return;
      setProjects(savedProjects);
      setActiveProject(savedProjects[0]);
    });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  React.useEffect(() => {
    if (!generating || !generationPlan) {
      setGenerationProgress(null);
      return;
    }

    const totalSeconds = estimateGenerationSeconds(generationPlan.model, generationPlan.count);
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - generationPlan.startedAt) / 1000));
      const rawPercent = (elapsedSeconds / totalSeconds) * 100;
      const percent = Math.min(96, Math.max(4, Math.round(rawPercent)));
      const remainingSeconds = Math.max(5, totalSeconds - elapsedSeconds);
      const tip = commerceTips[Math.floor(elapsedSeconds / 7) % commerceTips.length];
      setGenerationProgress({
        percent,
        elapsedSeconds,
        remainingSeconds,
        phase: generationPhase(percent, elapsedSeconds),
        tip
      });
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [generating, generationPlan]);

  const currentProject = activeProject || projects[0];

  React.useEffect(() => {
    try {
      localStorage.setItem(knowledgeStorageKey, JSON.stringify(knowledgeItems));
    } catch {
      setToast("지식파일 텍스트가 커서 일부 저장에 실패했습니다. 파일 수나 크기를 줄여주세요.");
    }
  }, [knowledgeItems]);

  React.useEffect(() => {
    localStorage.setItem("hanirum-use-shared-knowledge", String(useSharedKnowledge));
  }, [useSharedKnowledge]);

  async function generate(
    nextCount = count,
    nextRolloutRequest = "",
    startSection = 1,
    baseProject?: Project | null,
    displayCount = nextCount,
    displayIndex = 1
  ): Promise<Project | null> {
    const outputCount = typeof nextCount === "number" && Number.isFinite(nextCount) ? nextCount : count;
    const outputRolloutRequest = typeof nextRolloutRequest === "string" ? nextRolloutRequest : "";

    if (files.length === 0) {
      setToast("기존 상세페이지 이미지 또는 PDF를 먼저 업로드해주세요.");
      setView("workspace");
      return null;
    }

    const hasKey = selectedModel === "openai" ? serverConfig.serverOpenaiKeyConfigured : serverConfig.serverGoogleKeyConfigured;
    if (!hasKey) {
      setToast(`${models[selectedModel].label} 운영자 서버 키가 설정되지 않았습니다.`);
      return null;
    }

    if (outputCount > 1 && !baseProject) {
      reportClientLog("generate-sequence:start", {
        model: selectedModel,
        count: outputCount,
        startSection
      });
      let workingProject: Project | null = null;
      let completed = 0;
      for (let sectionNumber = startSection; sectionNumber < startSection + outputCount; sectionNumber += 1) {
        const nextProject = await generate(1, outputRolloutRequest, sectionNumber, workingProject, outputCount, sectionNumber - startSection + 1);
        if (!nextProject) break;
        workingProject = nextProject;
        completed += 1;
      }
      setGenerationSummary({
        label: "리디자인 일괄 생성",
        requested: outputCount,
        succeeded: completed,
        failed: 0,
        uncertain: completed < outputCount ? 1 : 0,
        skipped: Math.max(0, outputCount - completed - (completed < outputCount ? 1 : 0)),
        finishedAt: Date.now(),
      });
      setToast(`일괄 생성 결과: 성공 ${completed}장${completed < outputCount ? ` · 확인 필요 1장 · 미시도 ${Math.max(0, outputCount - completed - 1)}장` : ""}. 성공한 이미지만 차감됐습니다.`);
      return workingProject;
    }

    reportClientLog("generate:start", {
      model: selectedModel,
      count: outputCount,
      startSection,
      files: files.length,
      append: Boolean(baseProject)
    });
    setGenerationPlan({
      model: selectedModel,
      count: outputCount,
      displayCount,
      displayIndex,
      startedAt: Date.now()
    });
    setGenerating(true);
    setToast("원본 자료를 이미지 생성용 PNG로 변환하는 중입니다.");
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    const requestIdentity = [
      "generate",
      selectedModel,
      startSection,
      outputCount,
      baseProject?.id || "new",
      channel,
      ratio,
      // 결을 바꿨으면 다른 요청이다. 안 넣으면 실패 후 결만 바꿔 다시 눌렀을 때
      // 같은 멱등 키로 나가 서버가 같은 요청으로 본다.
      look,
      request,
      outputRolloutRequest,
      files.map((file) => `${file.name}:${file.size}`).join(","),
    ].join("|");
    const requestKey = retryRequestKeysRef.current[requestIdentity] ?? randomId();
    retryRequestKeysRef.current[requestIdentity] = requestKey;
    let outcomeKnown = false;

    try {
      const form = new FormData();
      const uploadFiles = await normalizeFilesForUpload(files);
      if (abortController.signal.aborted) throw new DOMException("생성 요청을 취소했습니다.", "AbortError");

      let transcript: string | null = null;
      const transcriptCacheKey = files.map((f) => `${f.name}:${f.size}`).join(",");
      if (transcriptCacheRef.current?.key === transcriptCacheKey) {
        transcript = transcriptCacheRef.current.transcript;
      } else {
        /**
         * **끝까지 간 전사만 캐시에 넣는다.**
         *
         * 중단은 예외를 던지지 않고 이미 끝난 배치까지만 이어붙여 정상으로
         * 돌아온다. 그것을 성공한 것과 같은 열쇠로 넣어 두면, 설정만 바꿔 다시
         * 만들 때 전사 단계를 건너뛰고 **잘린 텍스트를 영구히 재사용한다** —
         * 새로고침 전까지 몇 번을 눌러도 같은 결과가 나온다.
         */
        let complete = false;
        try {
          setToast("원본 상세페이지를 전사하는 중입니다(작은 글씨까지 확인).");
          const strips = await splitFilesToStrips(files);
          const r = await runTranscription(strips, {
            provider: selectedModel,
            signal: abortController.signal,
            onProgress: (d, t) => setToast(`전사 진행 ${d}/${t} 배치`),
          });
          transcript = r.transcript;
          complete = r.complete;
          if (r.failedBatches) setToast(`일부 구간 전사 실패(${r.failedBatches}) — 가능한 범위로 진행합니다.`);
        } catch {
          transcript = null; // graceful degradation
        }
        // 못 다 읽은 것은 남기지 않는다. 다음 번에 처음부터 다시 읽는다.
        if (complete) transcriptCacheRef.current = { key: transcriptCacheKey, transcript };
      }

      setToast("원본 분석과 실제 이미지 생성을 시작합니다.");
      const knowledgeText = useSharedKnowledge
        ? knowledgeItems
            .map((item, index) => `# 등록 지식파일 ${index + 1}: ${item.name}\n${item.text}`)
            .join("\n\n")
            .slice(0, 60000)
        : "";
      uploadFiles.forEach((file) => form.append("files", file));
      form.append("knowledgeText", knowledgeText);
      form.append("useKnowledge", String(useSharedKnowledge));
      form.append("request", request);
      form.append("model", selectedModel);
      form.append("channel", channel);
      form.append("ratio", ratio);
      form.append("look", look);
      form.append("count", String(outputCount));
      form.append("startSection", String(startSection));
      form.append("rolloutRequest", outputRolloutRequest);
      if (transcript) form.append("transcript", transcript);
      if (characterId) form.append("characterId", characterId);

      const response = await fetch("/api/redesign/generate", {
        method: "POST",
        headers: { "x-idempotency-key": requestKey },
        body: form,
        signal: abortController.signal
      });
      const data = await readApiResponse(response);
      reportClientLog("generate:response", {
        ok: response.ok,
        status: response.status,
        count: outputCount,
        startSection,
        generated: data.project?.sections?.length || 0,
        warning: data.project?.warning || ""
      });
      if (!response.ok) {
        outcomeKnown = true;
        delete retryRequestKeysRef.current[requestIdentity];
        throw new Error(data.error || "생성 요청 실패");
      }
      if (!data.project?.sections?.length) {
        throw new Error(data.project?.warning || "생성 응답은 성공했지만 표시할 이미지가 없습니다. 서버 로그의 generated/failed 값을 확인해주세요.");
      }

      const project: Project = {
        ...data.project,
        title: projectDisplayTitle(data.project),
        sections: data.project.sections.map((section: Record<string, string>) => ({
          id: section.section_id,
          name: section.name,
          purpose: section.purpose,
          source: section.source,
          prompt: section.prompt,
          imageUrl: section.imageUrl
        }))
      };
      const finalProject = baseProject ? mergeGeneratedProject(baseProject, project) : project;
      const nextProjects = [finalProject, ...projects].filter((candidate, index, list) => (
        list.findIndex((item) => item.id === candidate.id) === index
      )).slice(0, 8);
      setProjects(nextProjects);
      setActiveProject(finalProject);
      setView("results");
      outcomeKnown = true;
      delete retryRequestKeysRef.current[requestIdentity];
      const succeeded = Math.min(outputCount, project.sections.length);
      setGenerationSummary({
        label: "리디자인 생성",
        requested: outputCount,
        succeeded,
        failed: Math.max(0, outputCount - succeeded),
        uncertain: 0,
        skipped: 0,
        finishedAt: Date.now(),
      });
      setToast(data.project.warning || `${models[selectedModel].label}로 ${succeeded}장 생성 완료 · 성공한 이미지만 차감됐습니다.`);

      /**
       * **만든 즉시 서버에 올린다.**
       *
       * 옆의 '작업 저장'은 브라우저 IndexedDB 라, 기기를 옮기거나 브라우저
       * 데이터를 지우면 사라진다. 다른 도구는 전부 서버에 남는데 여기만
       * 달랐다. 이번에 만든 섹션만 골라 올리고, 같은 작업의 것은 `sourceId`
       * 로 라이브러리에서 한 줄에 모인다.
       *
       * **기다리지 않는다.** 올리기가 늦거나 실패해도 사용자는 방금 만든
       * 그림을 바로 봐야 한다. 실패해도 '라이브러리에 저장' 버튼이 그대로
       * 남아 있어 손으로 올릴 수 있다.
       */
      void autoSaveSections(finalProject, project.sections);
      return finalProject;
    } catch (error) {
      reportClientLog("generate:error", {
        count: outputCount,
        startSection,
        message: error instanceof Error ? error.message : "unknown"
      });
      const uncertain = !outcomeKnown || isAbortError(error);
      setGenerationSummary({
        label: isAbortError(error) ? "리디자인 요청 취소" : "리디자인 생성",
        requested: outputCount,
        succeeded: 0,
        failed: uncertain ? 0 : outputCount,
        uncertain: uncertain ? outputCount : 0,
        skipped: 0,
        finishedAt: Date.now(),
      });
      if (isAbortError(error)) setToast("생성 요청을 취소했습니다. 서버 처리 여부는 사용량에서 확인해 주세요.");
      else setToast(error instanceof Error ? error.message : "이미지 생성 중 오류가 발생했습니다.");
      return null;
    } finally {
      if (generationAbortRef.current === abortController) generationAbortRef.current = null;
      setGenerating(false);
    }
  }

  async function generateRemainingSections() {
    const baseProject = currentProject;
    if (!baseProject?.sections.length) {
      await generate(8, rolloutRequest);
      return;
    }

    let workingProject = baseProject;
    const existingSectionNumbers = new Set(
      workingProject.sections
        .map((section) => Number(section.id.replace(/\D/g, "")))
        .filter((sectionNumber) => Number.isFinite(sectionNumber))
    );
    const missingSections = Array.from({ length: 8 }, (_, index) => index + 1)
      .filter((sectionNumber) => !existingSectionNumbers.has(sectionNumber));

    reportClientLog("generate-rest:start", {
      existing: workingProject.sections.length,
      missing: missingSections.join(",")
    });

    if (missingSections.length === 0) {
      setToast("이미 8장 상세페이지가 생성되어 있습니다.");
      return;
    }

    let completed = 0;
    for (const [index, sectionNumber] of missingSections.entries()) {
      setToast(`S${sectionNumber} 섹션을 생성합니다.`);
      const nextProject = await generate(1, rolloutRequest, sectionNumber, workingProject, missingSections.length, index + 1);
      if (!nextProject) break;
      workingProject = nextProject;
      completed += 1;
    }
    setGenerationSummary({
      label: "나머지 섹션 생성",
      requested: missingSections.length,
      succeeded: completed,
      failed: 0,
      uncertain: completed < missingSections.length ? 1 : 0,
      skipped: Math.max(0, missingSections.length - completed - (completed < missingSections.length ? 1 : 0)),
      finishedAt: Date.now(),
    });
    setToast(`나머지 섹션 결과: 성공 ${completed}장${completed < missingSections.length ? ` · 확인 필요 1장 · 미시도 ${Math.max(0, missingSections.length - completed - 1)}장` : ""}. 성공한 이미지만 차감됐습니다.`);
  }

  function openProject(project: Project) {
    setActiveProject(project);
    setView("results");
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(`'${projectDisplayTitle(project)}' 작업을 삭제할까요?`);
    if (!confirmed) return;

    try {
      await deleteProjectFromDb(project.id);
      setProjects((current) => current.filter((candidate) => candidate.id !== project.id));
      setActiveProject((current) => current?.id === project.id ? null : current);
      setToast("작업을 삭제했습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "작업 삭제 중 오류가 발생했습니다.");
    }
  }

  async function registerKnowledgeFiles(nextFiles: File[]) {
    const selected = nextFiles.slice(0, 5);
    if (selected.length === 0) return;
    if (!serverConfig.canManageKnowledge) {
      setToast("지식파일 등록은 관리자만 할 수 있습니다.");
      return;
    }

    setToast("지식파일을 읽고 RAG 인덱싱을 준비하는 중입니다.");
    try {
      const items: KnowledgeItem[] = [];
      for (const file of selected) {
        const text = await extractKnowledgeText([file]);
        const indexResult = await indexKnowledgeFile(file.name, text);
        items.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          type: file.type || "file",
          size: file.size,
          text: text.slice(0, 18000),
          createdAt: new Date().toISOString(),
          indexed: indexResult.indexed,
          chunks: indexResult.chunks,
          documentId: indexResult.documentId,
          reason: indexResult.reason
        });
      }
      const filtered = items.filter((item) => item.text.trim().length > 0);
      setKnowledgeItems((current) => [...filtered, ...current].slice(0, 5));
      const indexedCount = filtered.filter((item) => item.indexed).length;
      setToast(indexedCount > 0 ? `${indexedCount}개 지식파일을 RAG로 인덱싱했습니다.` : `${filtered.length}개 지식파일을 로컬 fallback으로 등록했습니다.`);
      fetchServerConfig().then(setServerConfig);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "지식파일 등록 중 오류가 발생했습니다.");
    }
  }

  async function deleteKnowledgeItem(item: KnowledgeItem) {
    if (!serverConfig.canManageKnowledge) {
      setToast("지식파일 삭제는 관리자만 할 수 있습니다.");
      return;
    }

    setKnowledgeItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await deleteIndexedKnowledge(item.documentId);
      setToast("지식파일을 삭제했습니다.");
      fetchServerConfig().then(setServerConfig);
    } catch {
      setToast("화면 목록에서는 삭제했지만 RAG 저장소 삭제 확인은 실패했습니다.");
    }
  }

  async function saveCurrentProject(project?: Project | null) {
    const targetProject = project || currentProject;
    if (!targetProject) {
      setToast("저장할 작업이 없습니다.");
      return;
    }

    const savedProject = { ...targetProject, title: projectDisplayTitle(targetProject), savedAt: new Date().toISOString(), status: "저장됨" };
    try {
      await saveProjectToDb(savedProject);
      setProjects((current) => [savedProject, ...current.filter((candidate) => candidate.id !== savedProject.id)].slice(0, 20));
      setActiveProject(savedProject);
      setToast("작업을 저장했습니다. 대시보드에서 다시 열 수 있습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "작업 저장 중 오류가 발생했습니다.");
    }
  }

  /**
   * 결과물을 계정 라이브러리에 올린다.
   *
   * 옆의 '작업 저장'은 브라우저 IndexedDB 에 두는 것이라 기기를 옮기면 안 보이고
   * 브라우저를 지우면 사라진다. 이쪽은 서버의 내 계정에 남는다.
   *
   * 자동으로 올리지 않는다 — 실험 삼아 돌린 것까지 쌓이면 목록이 쓰레기로 찬다.
   */
  /**
   * 방금 만든 섹션만 서버 라이브러리에 올린다.
   *
   * 전체를 다시 올리지 않는다 — 여덟 섹션이면 같은 그림을 서른여섯 번
   * 올리게 된다. `sourceId` 가 같으면 서버가 이어 붙인다.
   *
   * **조용히 실패한다.** 자동 저장이 사용자의 작업을 막아서는 안 된다.
   * 못 올렸으면 '라이브러리에 저장' 버튼이 그대로 남아 있다.
   */
  async function autoSaveSections(project: Project, sections: SectionResult[]) {
    const images = sections
      .map((section) => /^data:([^;]+);base64,(.*)$/.exec(section.imageUrl || ""))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => ({ mimeType: match[1] ?? "image/png", base64: match[2] ?? "" }))
      .filter((image) => image.base64.length > 0);

    if (images.length === 0) return;

    try {
      await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: projectDisplayTitle(project),
          tool: "redesign",
          sourceId: project.id,
          images,
        }),
      });
    } catch {
      // 삼킨다. 손으로 올릴 길이 남아 있다.
    }
  }

  async function saveProjectToLibrary(project?: Project | null) {
    const target = project || currentProject;
    const withImages = (target?.sections ?? []).filter((section) => section.imageUrl);
    if (!target || withImages.length === 0) {
      setToast("라이브러리에 저장할 이미지가 아직 없습니다.");
      return;
    }

    setToast("라이브러리에 저장하는 중…");
    try {
      const images = withImages.map((section) => {
        const [, mimeType = "image/png", base64 = ""] =
          /^data:([^;]+);base64,(.*)$/.exec(section.imageUrl || "") ?? [];
        return { base64, mimeType };
      });

      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: projectDisplayTitle(target),
          tool: "redesign",
          // 같은 작업의 섹션은 라이브러리에서 한 줄로 모인다. 이 값이 없으면
          // 섹션마다 새 줄이 되어 같은 페이지가 여덟 줄로 흩어진다.
          sourceId: target.id,
          images,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; imageCount?: number; message?: string };

      setToast(
        body.ok
          ? `라이브러리에 ${body.imageCount ?? images.length}장을 저장했습니다. 다른 기기에서도 보입니다.`
          : body.message ?? "라이브러리에 저장하지 못했습니다.",
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "라이브러리에 저장하지 못했습니다.");
    }
  }

  async function editSection(sectionId: string, editRequest: string, model: Model) {
    const project = currentProject;
    const section = project?.sections.find((candidate) => candidate.id === sectionId);
    const trimmedEditRequest = editRequest.trim();
    if (!project || !section) {
      setToast("수정할 섹션을 찾지 못했습니다.");
      return;
    }
    if (!section.imageUrl) {
      setToast("저장된 이미지가 없는 섹션은 수정할 수 없습니다. 다시 생성한 뒤 시도해주세요.");
      return;
    }
    const hasKey = model === "openai" ? serverConfig.serverOpenaiKeyConfigured : serverConfig.serverGoogleKeyConfigured;
    if (!hasKey) {
      setToast(`${models[model].label} 운영자 서버 키가 설정되지 않았습니다.`);
      return;
    }
    if (!trimmedEditRequest) {
      setToast("섹션 수정 요청을 입력하거나 빠른 입력 버튼을 선택해주세요.");
      return;
    }

    setEditingSectionId(sectionId);
    setGenerationPlan({ model, count: 1, startedAt: Date.now() });
    setGenerating(true);
    setToast(`${section.name} 섹션을 수정하고 있습니다.`);
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    const requestIdentity = ["edit", project.id, sectionId, model, trimmedEditRequest, section.imageUrl.length].join("|");
    const requestKey = retryRequestKeysRef.current[requestIdentity] ?? randomId();
    retryRequestKeysRef.current[requestIdentity] = requestKey;
    let outcomeKnown = false;

    try {
      const requestImageUrl = await compressImageForRequest(section.imageUrl);
      reportClientLog("edit-section:start", {
        model,
        sectionId,
        imageBytes: estimateDataUrlBytes(requestImageUrl)
      });
      const response = await fetch("/api/redesign/edit-section", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": requestKey },
        body: JSON.stringify({
          model,
          imageUrl: requestImageUrl,
          request: trimmedEditRequest,
          section,
          project: { title: projectDisplayTitle(project), channel: project.channel, request: project.request }
        }),
        signal: abortController.signal
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        outcomeKnown = true;
        delete retryRequestKeysRef.current[requestIdentity];
        throw new Error(data.error || "섹션 수정 실패");
      }

      const updatedProject: Project = {
        ...project,
        sections: project.sections.map((candidate) => (
          candidate.id === sectionId
            ? addSectionRevision(candidate, data.imageUrl, data.prompt || candidate.prompt, trimmedEditRequest, model)
            : candidate
        )),
        status: project.savedAt ? "수정됨" : project.status
      };
      setActiveProject(updatedProject);
      setProjects((current) => [updatedProject, ...current.filter((candidate) => candidate.id !== updatedProject.id)].slice(0, 20));
      outcomeKnown = true;
      delete retryRequestKeysRef.current[requestIdentity];
      setGenerationSummary({ label: "섹션 수정", requested: 1, succeeded: 1, failed: 0, uncertain: 0, skipped: 0, finishedAt: Date.now() });
      setToast(`${section.name} 수정 완료 · 성공한 이미지 1장만 차감됐습니다. 마음에 들면 작업 저장을 눌러주세요.`);
    } catch (error) {
      reportClientLog("edit-section:error", {
        sectionId,
        message: error instanceof Error ? error.message : "unknown"
      });
      const uncertain = !outcomeKnown || isAbortError(error);
      setGenerationSummary({
        label: isAbortError(error) ? "섹션 수정 요청 취소" : "섹션 수정",
        requested: 1,
        succeeded: 0,
        failed: uncertain ? 0 : 1,
        uncertain: uncertain ? 1 : 0,
        skipped: 0,
        finishedAt: Date.now(),
      });
      if (isAbortError(error)) setToast("섹션 수정 요청을 취소했습니다. 서버 처리 여부는 사용량에서 확인해 주세요.");
      else setToast(error instanceof Error ? error.message : "섹션 수정 중 오류가 발생했습니다.");
    } finally {
      if (generationAbortRef.current === abortController) generationAbortRef.current = null;
      setEditingSectionId(null);
      setGenerating(false);
    }
  }

  function cancelGeneration() {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setEditingSectionId(null);
    setGenerating(false);
    setToast("요청을 취소했습니다. 이미 서버에 전달된 외부 API 요청은 잠시 후 로그에 완료될 수 있습니다.");
  }

  return (
    <div className="min-w-0">
      {/* 단계 표시줄 — 이전에는 자체 248px 사이드바가 셸 안에 또 있었다(내비 중복).
          셸이 좌측 내비를 제공하므로 여기서는 이 도구의 3단계만 표시한다. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StepBar steps={REDESIGN_STEPS} current={view} onJump={(id) => setView(id as View)} />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant={serverConfig.serverOpenaiKeyConfigured ? "green" : "default"}>정밀형 {serverConfig.serverOpenaiKeyConfigured ? "서버 연결" : "서버 미설정"}</Badge>
          <Badge variant={serverConfig.serverGoogleKeyConfigured ? "green" : "default"}>속도형 {serverConfig.serverGoogleKeyConfigured ? "서버 연결" : "서버 미설정"}</Badge>
          {/* 보관소가 준비된 것과 지식이 들어 있는 것은 다르다. 예전에는 0건이어도
              "연결"이라 떠서, 쓰이지 않는 기능이 켜져 있는 것처럼 보였다. */}
          <Badge
            variant={
              !serverConfig.knowledgeConfigured
                ? "default"
                : serverConfig.knowledgeDocuments > 0
                  ? "green"
                  : "outline"
            }
            title="등록된 자료가 있을 때만 리디자인 생성에 반영됩니다"
          >
            공통 지식{" "}
            {!serverConfig.knowledgeConfigured
              ? "미설정"
              : serverConfig.knowledgeDocuments > 0
                ? `${serverConfig.knowledgeDocuments}건`
                : "등록된 자료 없음"}
          </Badge>
        </div>
      </div>

      {generationSummary ? (
        <div
          className={cn(
            "mb-5 rounded-lg border px-4 py-3 text-sm",
            generationSummary.failed || generationSummary.uncertain || generationSummary.skipped
              ? "border-warning/25 bg-warning/5"
              : "border-primary/20 bg-primary/5"
          )}
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong>{generationSummary.label} 결과</strong>
            <Badge variant="green">성공 {generationSummary.succeeded}장</Badge>
            {generationSummary.failed ? <Badge variant="destructive">실패 {generationSummary.failed}장</Badge> : null}
            {generationSummary.uncertain ? <Badge variant="outline">처리 여부 확인 필요 {generationSummary.uncertain}장</Badge> : null}
            {generationSummary.skipped ? <Badge variant="secondary">미시도 {generationSummary.skipped}장</Badge> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            성공한 {generationSummary.succeeded}장만 이미지 크레딧에서 차감됩니다.
            {generationSummary.failed || generationSummary.skipped ? " 실패하거나 시작하지 않은 이미지는 차감되지 않습니다." : ""}
            {generationSummary.uncertain ? " 취소·네트워크 중단 요청은 서버에서 완료됐을 수 있으므로 페이지를 새로고침해 상단 사용량을 확인해 주세요." : ""}
          </p>
        </div>
      ) : null}

      <div className="min-w-0">
        {view === "dashboard" && (
          <Dashboard
            projects={projects}
            onNew={() => setView("workspace")}
            onOpenProject={openProject}
            onDeleteProject={deleteProject}
            onKnowledge={() => setKnowledgeOpen(true)}
            knowledgeCount={Math.max(knowledgeItems.length, serverConfig.knowledgeDocuments)}
            serverConfig={serverConfig}
          />
        )}
        {view === "workspace" && (
          <Workspace
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            channel={channel}
            setChannel={setChannel}
            characterId={characterId}
            setCharacterId={setCharacterId}
            count={count}
            setCount={setCount}
            ratio={ratio}
            setRatio={setRatio}
            look={look}
            setLook={setLook}
            files={files}
            setFiles={setFiles}
            request={request}
            setRequest={setRequest}
            inputRef={inputRef}
            knowledgeCount={Math.max(knowledgeItems.length, serverConfig.knowledgeDocuments)}
            serverConfig={serverConfig}
            useSharedKnowledge={useSharedKnowledge}
            setUseSharedKnowledge={setUseSharedKnowledge}
            generating={generating}
            onGenerate={() => generate()}
          />
        )}
        {view === "results" && (
          <Results
            project={currentProject}
            rolloutRequest={rolloutRequest}
            setRolloutRequest={setRolloutRequest}
            onToast={setToast}
            onSave={() => saveCurrentProject(currentProject)}
            onSaveToLibrary={() => void saveProjectToLibrary(currentProject)}
            onEditSection={editSection}
            onGenerateRest={generateRemainingSections}
            generating={generating}
            editingSectionId={editingSectionId}
          />
        )}
      </div>

      <Dialog open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사전 지식 파일 등록</DialogTitle>
            <DialogDescription>관리자가 등록한 PDF/TXT/MD 지식파일은 승인된 회원의 리디자인에 공통 적용됩니다.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-4">
            <button
              className="flex min-h-28 items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card/70 p-4 text-sm"
              onClick={() => knowledgeInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                registerKnowledgeFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <FileText className="size-5 text-primary" />
              PDF, TXT, MD 지식파일 등록
            </button>
            <input
              ref={knowledgeInputRef}
              hidden
              multiple
              type="file"
              accept=".pdf,.txt,.md,text/*,application/pdf"
              onChange={(event) => registerKnowledgeFiles(Array.from(event.target.files || []))}
            />
            {knowledgeItems.length > 0 ? (
              <div className="grid gap-2">
                {knowledgeItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs">
                    <span className="min-w-0 truncate">
                      <FileText className="mr-1 inline size-3 text-primary" />
                      {item.name}
                      <span className="ml-2 text-muted-foreground">{item.text.length.toLocaleString()}자</span>
                      <Badge className="ml-2" variant={item.indexed ? "green" : "default"}>
                        {item.indexed ? `RAG ${item.chunks || 0} chunks` : "로컬 fallback"}
                      </Badge>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => deleteKnowledgeItem(item)}>
                      삭제
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                등록된 지식파일이 없습니다. 관리자가 등록하면 승인된 회원의 생성 요청에 반영할 수 있습니다.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setKnowledgeOpen(false)}>완료</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl">
          {toast}
        </div>
      )}
      {generating && generationProgress && generationPlan && (
        <GenerationProgressPanel
          progress={generationProgress}
          modelLabel={models[generationPlan.model].label}
          count={generationPlan.displayCount || generationPlan.count}
          currentIndex={generationPlan.displayIndex || 1}
          onCancel={cancelGeneration}
        />
      )}
    </div>
  );
}

