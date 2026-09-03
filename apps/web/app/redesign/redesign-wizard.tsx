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
import { splitFilesToStrips, runTranscription } from "./transcribe-client";
import { SavedImagePicker } from "../create/SavedImagePicker";
import { SaveImagesToLibrary } from "../_components/save-to-library";
import { copyText, randomId } from "../../lib/browser-safe";

type Model = "openai" | "google";
type View = "dashboard" | "workspace" | "results";

const REDESIGN_STEPS: StepDefinition[] = [
  { id: "dashboard", label: "대시보드", desc: "지난 작업" },
  { id: "workspace", label: "리디자인 작업", desc: "섹션 고치기" },
  { id: "results", label: "결과 확인", desc: "내보내기" },
];

type SectionResult = {
  id: string;
  name: string;
  purpose: string;
  source: string;
  prompt: string;
  imageUrl?: string;
  revisions?: SectionRevision[];
};

type SectionRevision = {
  id: string;
  imageUrl: string;
  label: string;
  createdAt: string;
  request?: string;
  model?: Model;
};

type Project = {
  id: string;
  title: string;
  channel: string;
  model: Model;
  count: number;
  ratio: string;
  status: string;
  files: string[];
  request: string;
  createdAt: string;
  sections: SectionResult[];
  analysis?: unknown;
  savedAt?: string;
};

type KnowledgeItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  text: string;
  createdAt: string;
  indexed?: boolean;
  chunks?: number;
  documentId?: string;
  reason?: string;
};

type GenerationPlan = {
  model: Model;
  count: number;
  displayCount?: number;
  displayIndex?: number;
  startedAt: number;
};

type GenerationProgress = {
  percent: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: string;
  tip: string;
};

type GenerationSummary = {
  label: string;
  requested: number;
  succeeded: number;
  failed: number;
  uncertain: number;
  skipped: number;
  finishedAt: number;
};

type ServerConfig = {
  serverOpenaiKeyConfigured: boolean;
  serverGoogleKeyConfigured: boolean;
  knowledgeConfigured: boolean;
  knowledgeDocuments: number;
  knowledgeChunks: number;
  canManageKnowledge: boolean;
};

const knowledgeStorageKey = "hanirum-knowledge-items";
const projectDbName = "hanirum-redesign-projects";
const projectStoreName = "projects";

const models = {
  openai: {
    label: "OpenAI Image 2.0",
    id: "gpt-image-2-2026-04-21"
  },
  google: {
    label: "Google Nano Banana 2",
    id: "gemini-3.1-flash-image-preview"
  }
};

const baseSections = [
  ["S1 히어로", "3초 안에 제품, 타겟, 핵심 약속, CTA를 전달합니다.", "제품컷, 대표 USP"],
  ["S2 문제 공감", "고객이 자기 상황이라고 느끼는 체크리스트를 배치합니다.", "사용 전 고민 문구"],
  ["S3 베네핏 3개", "기능 나열을 체감 언어로 바꿔 기억 구조를 만듭니다.", "기능 설명, 사용 장점"],
  ["S4 USP 차별점", "경쟁 제품 대비 선택 이유를 한 문장으로 압축합니다.", "소재, 구성, 가격"],
  ["S5 근거/신뢰", "결과, 조건, 해석의 3단 구조로 신뢰를 설계합니다.", "인증, 수치, 테스트"],
  ["S6 사용법", "선택지를 2~3개로 줄여 구매 후 사용 장벽을 낮춥니다.", "루틴, 구성품"],
  ["S7 후기 카드", "실제 리뷰가 있을 때 사용감 문장 후기 카드로 구성합니다.", "리뷰, 평점"],
  ["S8 FAQ/오퍼", "마지막 구매 저항을 해소하고 CTA로 마무리합니다.", "배송, AS, 혜택"]
];

const commerceTips = [
  "첫 화면은 제품명보다 '누구의 어떤 문제를 해결하는지'가 먼저 보여야 이탈이 줄어듭니다.",
  "상세페이지의 수치는 조건이 함께 있을 때 신뢰가 생깁니다. 기간, 대상, 기준을 같이 적어주세요.",
  "구매전환을 높이는 CTA는 '구매하기'만 반복하기보다 혜택, 안심, 한정 이유를 번갈아 보여주는 편이 좋습니다.",
  "제품 구성이 복잡하면 선택지가 많아 보여 구매가 밀립니다. 대표 구성 1개와 비교 구성 1~2개로 압축해보세요.",
  "리뷰는 별점보다 사용감 문장이 강합니다. 고객이 실제로 말할 법한 짧은 문장 카드가 스캔에 유리합니다.",
  "고가 상품은 장점보다 불안 제거가 먼저입니다. 배송, 교환, AS, 사용법, 보증을 초반부터 노출하세요.",
  "혜택은 마지막에만 두지 말고 히어로, 근거 후, 후기 후, 마지막 CTA에 리듬 있게 반복하면 좋습니다.",
  "제품컷은 예쁘게 보이는 것보다 크기, 질감, 구성품, 사용 상황이 이해되는 쪽이 구매에 더 가깝습니다.",
  "스마트스토어와 쿠팡은 브랜드 서사보다 스캔 속도가 중요합니다. 제목, 불릿, 근거, CTA가 빨리 잡혀야 합니다.",
  "건강/뷰티/식품 카테고리는 효능을 단정하기보다 원료, 사용감, 섭취/사용 루틴, 고객 상황 중심으로 풀어야 안전합니다.",
  "상세페이지 한 장에는 메시지 하나만 담는 편이 좋습니다. 여러 주장을 한 화면에 넣으면 모두 약해집니다.",
  "구매 저항은 가격 때문만은 아닙니다. 나에게 맞을지, 사용이 쉬운지, 믿을 수 있는지가 먼저 해결되어야 합니다."
];

const demoProjectTitles = new Set([
  "프리미엄 영양제 상세페이지 리디자인",
  "소형 가전 제품 USP 강화 작업",
  "뷰티 브랜드 첫 화면 3초 이해 개선"
]);

function makeProject(overrides: Partial<Project> = {}): Project {
  const model = overrides.model || "openai";
  const count = overrides.count || 1;
  return {
    id: overrides.id || `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: overrides.title || "스마트스토어 상세페이지 리디자인",
    channel: overrides.channel || "스마트스토어",
    model,
    count,
    ratio: "9:16",
    status: overrides.status || "완료",
    files: overrides.files || ["original-detail.pdf"],
    request: overrides.request || "전환율 중심으로 리디자인",
    createdAt: overrides.createdAt || new Date().toISOString(),
    sections:
      overrides.sections ||
      baseSections.slice(0, count).map(([name, purpose, source], index) => ({
        id: `S${index + 1}`,
        name,
        purpose,
        source,
        prompt: [
          `model_label: ${models[model].label}`,
          `model_id: ${models[model].id}`,
          "",
          `section: ${name}`,
          `purpose: ${purpose}`,
          "9:16 세로형 상세페이지 섹션. 원본 제품컷과 핵심 USP를 보존하고 구매전환 중심으로 리디자인."
        ].join("<br>")
      }))
  };
}

function loadProjects() {
  return [];
}

function loadKnowledgeItems() {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(knowledgeStorageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as KnowledgeItem[];
    return parsed.slice(0, 5).filter((item) => item.name && item.text);
  } catch {
    localStorage.removeItem(knowledgeStorageKey);
    return [];
  }
}

export function RedesignWizard() {
  const [view, setView] = React.useState<View>("dashboard");
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [activeProject, setActiveProject] = React.useState<Project | null>(null);
  const [selectedModel, setSelectedModel] = React.useState<Model>("openai");
  const [channel, setChannel] = React.useState("스마트스토어");
  const [count, setCount] = React.useState(1);
  const [ratio, setRatio] = React.useState("9:16");
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
        try {
          setToast("원본 상세페이지를 전사하는 중입니다(작은 글씨까지 확인).");
          const strips = await splitFilesToStrips(files);
          const r = await runTranscription(strips, {
            provider: selectedModel,
            signal: abortController.signal,
            onProgress: (d, t) => setToast(`전사 진행 ${d}/${t} 배치`),
          });
          transcript = r.transcript;
          if (r.failedBatches) setToast(`일부 구간 전사 실패(${r.failedBatches}) — 가능한 범위로 진행합니다.`);
        } catch {
          transcript = null; // graceful degradation
        }
        transcriptCacheRef.current = { key: transcriptCacheKey, transcript };
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
      form.append("count", String(outputCount));
      form.append("startSection", String(startSection));
      form.append("rolloutRequest", outputRolloutRequest);
      if (transcript) form.append("transcript", transcript);

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
          <Badge variant={serverConfig.serverOpenaiKeyConfigured ? "green" : "default"}>OpenAI {serverConfig.serverOpenaiKeyConfigured ? "서버 연결" : "서버 미설정"}</Badge>
          <Badge variant={serverConfig.serverGoogleKeyConfigured ? "green" : "default"}>Google {serverConfig.serverGoogleKeyConfigured ? "서버 연결" : "서버 미설정"}</Badge>
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
            count={count}
            setCount={setCount}
            ratio={ratio}
            setRatio={setRatio}
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

async function fetchServerConfig(): Promise<ServerConfig> {
  try {
    const response = await fetch("/api/redesign/config");
    if (!response.ok) throw new Error("config fetch failed");
    return await response.json();
  } catch {
    return {
      serverOpenaiKeyConfigured: false,
      serverGoogleKeyConfigured: false,
      knowledgeConfigured: false,
      knowledgeDocuments: 0,
      knowledgeChunks: 0,
      canManageKnowledge: false
    };
  }
}

async function readApiResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};

  try {
    const data = JSON.parse(text);
    if (data?.usage) window.dispatchEvent(new CustomEvent("studio-usage-updated", { detail: data.usage }));
    return data;
  } catch {
    return {
      error: simplifyPlainTextError(text, response.status)
    };
  }
}

function simplifyPlainTextError(text: string, status: number) {
  const message = text.trim() || "요청 처리 중 오류가 발생했습니다.";
  if (status === 413 || message.toLowerCase().includes("request entity too large")) {
    return "이미지 데이터가 너무 커서 섹션 수정 요청을 보낼 수 없습니다. 수정용 이미지를 압축해 다시 시도했지만, 계속 실패하면 해당 섹션을 다시 생성해 주세요.";
  }
  return message.slice(0, 500);
}

function reportClientLog(event: string, payload: Record<string, unknown> = {}) {
  fetch("/api/redesign/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    keepalive: true
  }).catch(() => {
    // Logging must never interrupt generation.
  });
}

async function openProjectDb() {
  if (typeof indexedDB === "undefined") return null;

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(projectDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(projectStoreName)) {
        db.createObjectStore(projectStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSavedProjects() {
  const db = await openProjectDb();
  if (!db) return [];

  return new Promise<Project[]>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readonly");
    const store = transaction.objectStore(projectStoreName);
    const request = store.getAll();
    request.onsuccess = () => {
      const projects = (request.result as Project[])
        .filter((project) => project?.id && project.sections?.length)
        .filter((project) => !isDemoProject(project))
        .sort((a, b) => new Date(b.savedAt || b.createdAt).getTime() - new Date(a.savedAt || a.createdAt).getTime());
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

function isDemoProject(project: Project) {
  return demoProjectTitles.has(project.title) && project.sections.every((section) => !section.imageUrl);
}

async function saveProjectToDb(project: Project) {
  const db = await openProjectDb();
  if (!db) throw new Error("브라우저 저장소를 열 수 없습니다.");

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readwrite");
    transaction.objectStore(projectStoreName).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteProjectFromDb(projectId: string) {
  const db = await openProjectDb();
  if (!db) throw new Error("브라우저 저장소를 열 수 없습니다.");

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readwrite");
    transaction.objectStore(projectStoreName).delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function projectDisplayTitle(project: Partial<Project>) {
  const inferred = inferTitleFromAnalysis(project.analysis);
  if (inferred) return inferred;
  const current = String(project.title || "").trim();
  if (current && !current.includes(new Date().getFullYear().toString())) return current;
  return current || `${project.channel || "스마트스토어"} 상세페이지 리디자인`;
}

function mergeGeneratedProject(baseProject: Project, generatedProject: Project): Project {
  const sections = [...baseProject.sections];
  for (const generatedSection of generatedProject.sections) {
    const existingIndex = sections.findIndex((section) => section.id === generatedSection.id);
    if (existingIndex >= 0) sections[existingIndex] = generatedSection;
    else sections.push(generatedSection);
  }

  sections.sort((a, b) => sectionSortNumber(a.id) - sectionSortNumber(b.id));

  return {
    ...baseProject,
    title: projectDisplayTitle(baseProject) || projectDisplayTitle(generatedProject),
    status: generatedProject.status,
    count: sections.length,
    sections,
    analysis: generatedProject.analysis || baseProject.analysis,
    createdAt: baseProject.createdAt || generatedProject.createdAt
  };
}

function sectionSortNumber(sectionId: string) {
  const sectionNumber = Number(sectionId.replace(/\D/g, ""));
  return Number.isFinite(sectionNumber) ? sectionNumber : 999;
}

function downloadDataUrl(url: string, fileName: string) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildImageFileName(projectTitle: string, section: SectionResult, index: number, revisionLabel = "") {
  const ext = imageExtension(section.imageUrl || "");
  const parts = [
    projectTitle || "redesign",
    section.id || `S${index + 1}`,
    section.name || "section",
    revisionLabel && revisionLabel !== "원본" ? revisionLabel : ""
  ].filter(Boolean);
  return `${sanitizeDownloadName(parts.join("-"))}.${ext}`;
}

function imageExtension(url: string) {
  const mime = url.match(/^data:([^;]+);/)?.[1] || "";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  return "png";
}

function sanitizeDownloadName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "redesign-image";
}

async function compressImageForRequest(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  try {
    const image = await loadDataUrlImage(dataUrl);
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return dataUrl;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await canvasToDataUrl(canvas, "image/jpeg", 0.84);
  } catch {
    return dataUrl;
  }
}

function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("수정용 이미지를 압축하지 못했습니다."));
    image.src = dataUrl;
  });
}

async function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("이미지 압축에 실패했습니다."));
    }, type, quality);
  });
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 변환에 실패했습니다."));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(",")[1] || "";
  return Math.round((payload.length * 3) / 4);
}

function addSectionRevision(section: SectionResult, nextImageUrl: string, nextPrompt: string, request: string, model: Model): SectionResult {
  const history = ensureSectionRevisions(section);
  const nextRevision: SectionRevision = {
    id: `revision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    imageUrl: nextImageUrl,
    label: `수정 ${history.length}`,
    createdAt: new Date().toISOString(),
    request,
    model
  };

  return {
    ...section,
    imageUrl: nextImageUrl,
    prompt: nextPrompt,
    revisions: [...history, nextRevision]
  };
}

function ensureSectionRevisions(section: SectionResult): SectionRevision[] {
  const revisions = section.revisions?.length
    ? section.revisions
    : section.imageUrl
      ? [{
          id: `${section.id}-original`,
          imageUrl: section.imageUrl,
          label: "원본",
          createdAt: section.id
        }]
      : [];

  if (section.imageUrl && revisions.every((revision) => revision.imageUrl !== section.imageUrl)) {
    return [
      ...revisions,
      {
        id: `${section.id}-current-${revisions.length}`,
        imageUrl: section.imageUrl,
        label: `수정 ${revisions.length}`,
        createdAt: new Date().toISOString()
      }
    ];
  }

  return revisions;
}

function inferTitleFromAnalysis(analysis: unknown) {
  if (!analysis || typeof analysis !== "object" || !("product_inferred" in analysis)) return "";
  const product = (analysis as { product_inferred?: Record<string, unknown> }).product_inferred || {};
  const brand = pickAnalysisText(product, ["brand_name", "brand", "manufacturer", "maker"]);
  const productName = pickAnalysisText(product, ["product_name", "name", "product", "title"]);
  const category = pickAnalysisText(product, ["category", "product_category"]);

  if (brand && productName) return productName.includes(brand) ? `${productName} 리디자인` : `${brand} ${productName} 리디자인`;
  if (productName) return `${productName} 리디자인`;
  if (category) return `${category} 상세페이지 리디자인`;
  return "";
}

function pickAnalysisText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function extractKnowledgeText(files: File[]) {
  if (files.length === 0) return "";

  const chunks: string[] = [];
  for (const file of files.slice(0, 5)) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      chunks.push(await extractPdfText(file));
      continue;
    }
    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".md")) {
      chunks.push(await file.text());
    }
  }

  return chunks
    .map((chunk, index) => `# 지식파일 ${index + 1}\n${chunk}`)
    .join("\n\n")
    .slice(0, 120000);
}

async function indexKnowledgeFile(name: string, text: string): Promise<{ indexed: boolean; chunks: number; documentId?: string; reason?: string }> {
  if (!text.trim()) return { indexed: false, chunks: 0, reason: "추출된 텍스트가 없습니다." };

  const response = await fetch("/api/redesign/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, text })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "지식파일 인덱싱 실패");
  return {
    indexed: Boolean(data.indexed),
    chunks: Number(data.chunks || 0),
    documentId: data.documentId,
    reason: data.reason
  };
}

async function deleteIndexedKnowledge(documentId?: string) {
  if (!documentId) return;
  await fetch("/api/redesign/knowledge", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId })
  });
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, 80);
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) pages.push(`[${file.name} p.${pageNumber}] ${text}`);
    if (pages.join("\n").length > 120000) break;
  }

  return pages.join("\n");
}

async function normalizeFilesForUpload(files: File[]) {
  const output: File[] = [];
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      output.push(...(await renderPdfToImages(file)));
    } else if (file.type.startsWith("image/")) {
      output.push(...(await renderImageToReferenceFiles(file)));
    }
  }
  return output.slice(0, 4);
}

async function renderImageToReferenceFiles(file: File) {
  const image = await loadImageElement(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) throw new Error("업로드 이미지를 읽지 못했습니다.");

  const isLongDetailPage = naturalHeight / naturalWidth > 2.2;
  const sliceCount = isLongDetailPage ? Math.min(4, Math.ceil(naturalHeight / naturalWidth / 1.8)) : 1;
  const files: File[] = [];

  for (let index = 0; index < sliceCount; index += 1) {
    const sourceY = Math.floor((naturalHeight / sliceCount) * index);
    const sourceHeight = index === sliceCount - 1 ? naturalHeight - sourceY : Math.floor(naturalHeight / sliceCount);
    files.push(await cropImageToPngFile({
      image,
      sourceX: 0,
      sourceY,
      sourceWidth: naturalWidth,
      sourceHeight,
      fileName: file.name,
      index
    }));
  }

  URL.revokeObjectURL(image.src);
  return files;
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 파일을 브라우저에서 열 수 없습니다."));
    image.src = URL.createObjectURL(file);
  });
}

async function cropImageToPngFile({
  image,
  sourceX,
  sourceY,
  sourceWidth,
  sourceHeight,
  fileName,
  index
}: {
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  fileName: string;
  index: number;
}) {
  const maxWidth = 1200;
  const maxHeight = 1800;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("이미지 변환 캔버스를 만들지 못했습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("이미지를 PNG로 변환하지 못했습니다."));
    }, "image/png");
  });

  const safeName = fileName.replace(/\.[^.]+$/i, "");
  return new File([blob], `${safeName}-reference-${index + 1}.png`, { type: "image/png" });
}

async function renderPdfToImages(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, 4);
  const pages: File[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PDF 페이지를 이미지로 변환하지 못했습니다."));
      }, "image/png");
    });
    pages.push(new File([blob], `${file.name.replace(/\.pdf$/i, "")}-page-${pageNumber}.png`, { type: "image/png" }));
  }

  return pages;
}

function Dashboard({
  projects,
  onNew,
  onOpenProject,
  onDeleteProject,
  onKnowledge,
  knowledgeCount,
  serverConfig
}: {
  projects: Project[];
  onNew: () => void;
  onOpenProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onKnowledge: () => void;
  knowledgeCount: number;
  serverConfig: ServerConfig;
}) {
  const averageImageCount = projects.length > 0
    ? (projects.reduce((sum, project) => sum + project.count, 0) / projects.length).toFixed(1)
    : "-";

  return (
    <section>
      <Topbar eyebrow="DASHBOARD">
        {serverConfig.canManageKnowledge ? <Button variant="secondary" onClick={onKnowledge}><FileText className="size-4" />지식파일 등록 {knowledgeCount > 0 ? `(${knowledgeCount})` : ""}</Button> : null}
        <Button onClick={onNew}><Sparkles className="size-4" />새 프로젝트 생성</Button>
      </Topbar>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] gap-4 max-xl:grid-cols-1">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>최근 리디자인 프로젝트</CardTitle>
              <CardDescription>업로드한 원본 자료를 기준으로 생성된 작업 목록</CardDescription>
            </div>
            <Badge variant="green">6~8장 기본</Badge>
          </CardHeader>
          <CardContent className="grid gap-3">
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="grid grid-cols-[52px_minmax(0,1fr)_40px] items-center gap-3 rounded-md border border-border bg-card p-3 transition hover:border-primary hover:bg-primary/30"
                >
                  <button
                    type="button"
                    className="contents text-left"
                    onClick={() => onOpenProject(project)}
                    aria-label={`${project.title} 열기`}
                  >
                    <MiniThumb />
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">{project.title}</strong>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{project.channel}</span>
                        <span>{project.count}장</span>
                        <span>{project.ratio}</span>
                        <span>{models[project.model].label}</span>
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteProject(project)}
                    aria-label={`${project.title} 삭제`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-border bg-card/60 p-6 text-center">
                <div>
                  <ImageIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
                  <strong className="text-sm">아직 작업한 리디자인 작업이 없습니다.</strong>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    새 프로젝트를 생성하면 이곳에 최근 작업이 표시됩니다.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>오늘의 작업 상태</CardTitle>
                <CardDescription>전환 설계 중심으로 생성 품질을 추적</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <Stat label="최근" value={String(projects.length)} sub="프로젝트" />
              <Stat label="평균" value={averageImageCount} sub="이미지 장수" />
              <Stat label="기본" value="9:16" sub="출력 비율" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>사전 지식 라이브러리</CardTitle>
                <CardDescription>관리자가 등록하고 승인된 회원이 사용하는 공통 지식</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>등록 문서</span>
                <Badge variant={knowledgeCount > 0 ? "green" : "default"}>{knowledgeCount}개</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>RAG 청크</span>
                <Badge variant={serverConfig.knowledgeChunks > 0 ? "green" : "default"}>{serverConfig.knowledgeChunks.toLocaleString()}개</Badge>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                <span>사용 권한</span>
                <Badge variant="green">승인 회원</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Workspace(props: {
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
  channel: string;
  setChannel: (channel: string) => void;
  count: number;
  setCount: (count: number) => void;
  ratio: string;
  setRatio: (ratio: string) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  request: string;
  setRequest: (request: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  knowledgeCount: number;
  serverConfig: ServerConfig;
  useSharedKnowledge: boolean;
  setUseSharedKnowledge: (value: boolean) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  const {
    selectedModel,
    setSelectedModel,
    channel,
    setChannel,
    count,
    setCount,
    ratio,
    setRatio,
    files,
    setFiles,
    request,
    setRequest,
    inputRef,
    knowledgeCount,
    serverConfig,
    useSharedKnowledge,
    setUseSharedKnowledge,
    generating,
    onGenerate
  } = props;

  return (
    <section>
      <Topbar eyebrow="REDESIGN WORKSPACE">
        <div className="flex flex-col items-end gap-1">
          <Button onClick={() => onGenerate()} disabled={generating}>{generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}리디자인 생성</Button>
          <span className="text-[11px] text-muted-foreground">전부 성공 시 최대 {count}장 차감</span>
        </div>
      </Topbar>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>기존 상세페이지 자료 업로드</CardTitle>
                <CardDescription>이미지 또는 PDF를 첨부하면 원본 정보와 전환 저해 요소를 분석합니다.</CardDescription>
              </div>
              <Badge variant="green">대용량 가능</Badge>
            </CardHeader>
            <CardContent>
              <button
                className="grid min-h-64 w-full place-items-center rounded-md border border-dashed border-primary bg-card/60 p-6 text-center"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setFiles(Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf"));
                }}
              >
                <span>
                  <span className="mx-auto mb-3 grid size-14 place-items-center rounded-md border border-border bg-card text-primary">
                    <Upload className="size-7" />
                  </span>
                  <strong>이미지 또는 PDF를 여기에 놓기</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">원본 제품컷, 수치, 리뷰, 인증, 오퍼 문구를 최대한 보존합니다.</span>
                </span>
              </button>
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
              <div className="mt-3">
                {/* 라이브러리에 이미 있는 그림을 디스크에서 다시 찾게 하지 않는다. */}
                <SavedImagePicker
                  label="라이브러리에서 불러오기"
                  onPick={(file) => setFiles([...files, file])}
                />
              </div>
              {files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <Badge key={file.name} variant="default">
                      {file.type === "application/pdf" ? <FileText className="mr-1 size-3" /> : <FileImage className="mr-1 size-3" />}
                      {file.name}
                    </Badge>
                  ))}
                </div>
              )}
              <label className="mt-4 block text-xs font-bold text-muted-foreground">추가 요청사항</label>
              <Textarea value={request} onChange={(event) => setRequest(event.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong>공통 사전 지식 사용</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    관리자가 등록한 지식파일을 검색해 생성 프롬프트에 반영합니다.
                  </p>
                </div>
                <Badge variant={knowledgeCount > 0 ? "green" : "default"}>{knowledgeCount}개 등록</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", useSharedKnowledge && "bg-foreground text-background")}
                  onClick={() => setUseSharedKnowledge(true)}
                >
                  사용
                </button>
                <button
                  type="button"
                  className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", !useSharedKnowledge && "bg-foreground text-background")}
                  onClick={() => setUseSharedKnowledge(false)}
                >
                  사용 안 함
                </button>
              </div>
              {useSharedKnowledge ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  승인된 회원 권한으로 공통 지식을 사용합니다. 별도 접근 키는 필요하지 않습니다.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>이미지 생성 모델</CardTitle>
                <CardDescription>작업마다 사용할 모델을 선택합니다.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(["openai", "google"] as const).map((model) => (
                <button
                  key={model}
                  className={cn("rounded-md border border-border bg-card p-3 text-left", selectedModel === model && "border-primary ring-4 ring-primary")}
                  onClick={() => setSelectedModel(model)}
                >
                  <strong className="block text-sm">{models[model].label}</strong>
                  <code className="mt-1 block break-words text-[11px] text-muted-foreground">{models[model].id}</code>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>생성 옵션</CardTitle>
                <CardDescription>상세페이지 섹션 단위로 생성</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <OptionGroup label="결과 장수" value={String(count)} options={[["1", "히어로 1장"], ["8", "기본 6~8장"]]} onChange={(value) => setCount(Number(value))} />
              <OptionGroup label="출력 비율" value={ratio} options={[["9:16", "9:16"], ["1080×1920", "1080×1920"]]} onChange={setRatio} />
              <ChannelOptionGroup value={channel} onChange={setChannel} />
              <div className="rounded-md bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                <strong className="text-foreground">예상 이미지 크레딧: 최대 {count}장</strong><br />
                실제로 생성에 성공한 이미지 수만큼만 차감됩니다. 실패한 결과는 차감되지 않습니다.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function ChannelOptionGroup({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const channels = [
    {
      name: "스마트스토어",
      points: ["스캔 쉬운 구성", "상품명/USP/혜택/리뷰/인증을 빠르게 노출", "네이버 쇼핑 사용자가 비교 구매한다는 전제", "과장보다 신뢰, 리뷰, 혜택 중심"]
    },
    {
      name: "쿠팡",
      points: ["더 빠른 구매 판단 중심", "첫 화면에서 핵심 정보와 가격/구성/배송/후기 신뢰를 강하게", "긴 브랜드 스토리보다 왜 지금 사야 하는지 압축", "썸네일처럼 잘 읽히는 굵은 카피와 정보 카드가 유리"]
    },
    {
      name: "자사몰",
      points: ["브랜드 톤앤매너와 스토리 비중이 더 큼", "제품 차별화, 브랜드 신뢰, 보증, 후기 흐름을 더 여유 있게 구성", "단순 구매보다 브랜드 설득과 재구매까지 고려"]
    },
    {
      name: "와디즈",
      points: ["문제 제기 → 해결책 → 제작 이유 → 검증 → 리워드/FAQ 흐름", "제품 탄생 배경, 개발 과정, 상세 검증, 리워드 구성이 중요", "왜 이 제품이 새롭고 믿을 만한가를 더 서사적으로 보여줌"]
    }
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label className="block text-xs font-bold text-muted-foreground">판매 채널</label>
        <button
          type="button"
          className="grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
          onClick={() => setOpen(true)}
          aria-label="판매 채널 설명 보기"
        >
          <CircleHelp className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {channels.map((channel) => (
          <button
            key={channel.name}
            className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", value === channel.name && "bg-foreground text-background")}
            onClick={() => onChange(channel.name)}
          >
            {channel.name}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>판매 채널별 생성 기준</DialogTitle>
            <DialogDescription>
              판매 채널을 선택하면 해당 채널이 이미지 생성 프롬프트에 들어가고, AI가 구성과 문구 톤을 채널에 맞춰 조정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-4">
            <div className="rounded-md border border-primary bg-primary p-3 text-sm leading-relaxed text-primary">
              채널별 고객의 구매 맥락이 다르기 때문에, 같은 상품이라도 첫 화면의 정보 우선순위와 설득 흐름이 달라집니다.
            </div>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {channels.map((channel) => (
                <div key={channel.name} className="rounded-md border border-border bg-card p-4">
                  <h3 className="mb-3 text-base font-bold">{channel.name}</h3>
                  <ul className="grid gap-2 text-sm leading-relaxed text-muted-foreground">
                    {channel.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>확인</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Results({
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

function SectionResultCard({
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
            options={[["openai", "OpenAI Image 2.0"], ["google", "Nano Banana 2"]]}
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

function GenerationProgressPanel({
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
            {isLongWait && modelLabel.includes("OpenAI")
              ? "OpenAI Image 2.0은 이미지 편집 요청이 2분 이상 걸릴 수 있습니다. 특히 긴 상세페이지 캡처나 참조 이미지가 여러 장이면 응답 시간이 길어질 수 있어요."
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

function Topbar({ eyebrow, title, children }: { eyebrow: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
      <div>
        <p className="mb-1 text-xs font-bold text-muted-foreground">{eyebrow}</p>
        {title ? <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-normal max-md:text-2xl">{title}</h1> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function estimateGenerationSeconds(model: Model, count: number) {
  const setupSeconds = 24;
  const perImageSeconds = model === "google" ? 78 : 65;
  return setupSeconds + Math.max(1, count) * perImageSeconds;
}

function generationPhase(percent: number, elapsedSeconds: number) {
  if (percent >= 96) return elapsedSeconds >= 120 ? "최종 최적화 중" : "마무리 작업";
  if (percent < 15) return "원본 변환";
  if (percent < 32) return "프롬프트 구성";
  if (percent < 76) return "이미지 API 처리";
  return "결과 수신 준비";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}초`;
  return `${minutes}분 ${rest.toString().padStart(2, "0")}초`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-h-24 flex-col justify-between rounded-md border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="text-2xl">{value}</strong>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function OptionGroup({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-muted-foreground">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            className={cn("min-h-9 rounded-md border border-border bg-card px-2 text-xs font-bold", value === optionValue && "bg-foreground text-background")}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniThumb() {
  return (
    <div className="relative h-[68px] w-[52px] overflow-hidden rounded-md border border-border bg-muted">
      <div className="absolute left-2 right-2 top-2 h-4 rounded bg-foreground" />
      <div className="absolute bottom-2 left-2 right-2 h-7 rounded-md bg-gradient-to-br from-primary to-lime-300" />
    </div>
  );
}

function PlaceholderThumb({ index }: { index: number }) {
  return (
    <div className="absolute inset-0 p-3">
      <div className={cn("mb-2 h-2 rounded-full bg-foreground", index % 2 === 0 && "w-2/3")} />
      <div className="mb-1 h-1.5 rounded-full bg-muted" />
      <div className="h-1.5 w-3/4 rounded-full bg-muted" />
      <div className="absolute bottom-3 left-3 right-3 h-[42%] rounded-md bg-gradient-to-br from-primary to-lime-300" />
    </div>
  );
}
