/**
 * 리디자인이 다루는 **것들의 모양과 기본값.**
 *
 * 화면 파일이 2,589줄이었다. 이 저장소의 규칙은 최대 800줄이다 — 한 파일이
 * 그만큼 커지면 어디에 무엇이 있는지 아무도 못 찾고, 고칠 때마다 관계없는
 * 코드를 함께 읽게 된다.
 *
 * **동작은 한 줄도 바꾸지 않았다.** 자리만 옮겼다.
 */

import type { StepDefinition } from "@fixup/ui";
import { VISIBLE_IMAGE_MODEL_IDS, imageModelName } from "@fixup/shared";
import { REDESIGN_FAL_MODEL, analysisProviderFor, redesignFalModelFor, type AnalysisProvider } from "../../lib/redesign/model-choice";

/*
  화면은 **그림 모델**(표준형·디테일형·속도형)을 고른다(2026-10-08). 원본을 읽는
  분석 AI 는 그 모델을 따른다 — 한 벌은 서버와 함께 쓰는 `lib/redesign/model-choice.ts`.
*/
export { analysisProviderFor, redesignFalModelFor, REDESIGN_FAL_MODEL } from "../../lib/redesign/model-choice";

/** 분석 AI(업체). 서버에 보내고 저장된 작업이 들고 있는 **내부값**이다. */
export type Model = AnalysisProvider;
export type View = "dashboard" | "workspace" | "results";

/**
 * 그림 생성에 실제로 실리는 원본 장수.
 *
 * **`redesign-core` 의 `MAX_REFERENCE_IMAGES` 와 같은 값이어야 한다.** 여기서
 * 가져오지 않는 이유는 그 꾸러미가 서버 전용이기 때문이다 — 화면이 import 하면
 * `node:crypto` 와 업체 호출까지 브라우저 묶음에 딸려 온다.
 *
 * 두 값이 어긋나면 화면이 거짓말을 한다. `__tests__/reference-limit.test.ts`
 * 가 둘을 맞춰 놓는다.
 */
export const MAX_REFERENCE_IMAGES = 4;

export const REDESIGN_STEPS: StepDefinition[] = [
  { id: "dashboard", label: "대시보드", desc: "지난 작업" },
  { id: "workspace", label: "리디자인 작업", desc: "섹션 고치기" },
  { id: "results", label: "결과 확인", desc: "내보내기" },
];

export type SectionResult = {
  id: string;
  name: string;
  purpose: string;
  source: string;
  prompt: string;
  imageUrl?: string;
  revisions?: SectionRevision[];
};

export type SectionRevision = {
  id: string;
  imageUrl: string;
  label: string;
  createdAt: string;
  request?: string;
  model?: Model;
  /** 이 수정을 그린 그림 모델. 옛 기록에는 없다. */
  imageModel?: string;
};

import type { FailedSection } from "./failed-sections";

export type Project = {
  id: string;
  title: string;
  channel: string;
  model: Model;
  /** 실제로 그린 그림 모델. 옛 작업에는 없다 — 그때는 `model` 에서 읽는다(`projectImageModelName`). */
  imageModel?: string;
  count: number;
  ratio: string;
  status: string;
  files: string[];
  request: string;
  createdAt: string;
  sections: SectionResult[];
  /**
   * **어느 장이 왜 안 만들어졌나**(F-7-8).
   *
   * 코어는 이미 이유를 만든다 — 실패한 섹션에는 제공자가 준 말이, 시도조차
   * 못 한 섹션에는 「앞 섹션이 실패해 시도하지 않았습니다」가 붙는다. 그런데
   * 화면에 이 칸이 없어서 **한 번도 안 읽혔다.** 사용자는 집계 숫자만 보고
   * 여덟 장을 통째로 다시 만들었다.
   */
  failedSections?: FailedSection[];
  /**
   * **안 쓰인 참조가 있으면 그 사실**(N-9, 설계 §1 불변조건 7).
   *
   * 참조를 상한에서 자르는 것 자체는 맞다. 문제는 **안 알리는 것**이었다 —
   * 각도를 넷 고르고 원본이 세 장이면 각도 하나가 말없이 빠지고, 사용자는
   * 결과가 왜 다른지 알 길이 없다.
   */
  referenceNotice?: string;
  analysis?: unknown;
  savedAt?: string;
};

export type KnowledgeItem = {
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

export type GenerationPlan = {
  model: Model;
  /** 고른 그림 모델. 없으면 `model` 에서 읽는다. */
  imageModel?: string;
  count: number;
  displayCount?: number;
  displayIndex?: number;
  startedAt: number;
};

/**
 * 대기 화면이 말하는 것.
 *
 * **퍼센트는 선택이다**(2026-09-22). 전에는 `percent` 가 필수라 모르는 구간
 * 에서도 값을 지어내야 했다 — 경과 시간으로 채우고 4~96 사이에 가뒀다.
 * 지금은 아는 구간(전사 배치)에만 있다. 판단은 `generation-progress.ts` 다.
 */
export type GenerationProgress = {
  kind: "determinate" | "indeterminate";
  percent?: number;
  /** 지금 하는 일. */
  label: string;
  /** 시간에 대해 할 수 있는 말. 할 말이 없으면 빈 문자열이다. */
  note: string;
  elapsedSeconds: number;
};

export type GenerationSummary = {
  label: string;
  requested: number;
  succeeded: number;
  failed: number;
  uncertain: number;
  skipped: number;
  finishedAt: number;
};

export type ServerConfig = {
  serverOpenaiKeyConfigured: boolean;
  serverGoogleKeyConfigured: boolean;
  knowledgeConfigured: boolean;
  knowledgeDocuments: number;
  knowledgeChunks: number;
  canManageKnowledge: boolean;
};

export const knowledgeStorageKey = "hanirum-knowledge-items";
export const projectDbName = "hanirum-redesign-projects";
export const projectStoreName = "projects";

/**
 * 작업·계획에 붙일 그림 모델 이름. 옛 작업(`imageModel` 없음)은 그때 그린
 * 모델 — openai 면 표준형, google 이면 디테일형 — 으로 읽는다.
 */
export function projectImageModelName(target: { model: Model; imageModel?: string }): string {
  return imageModelName(redesignFalModelFor(target.model, target.imageModel));
}

/** 한 분석 AI 키로 쓸 수 있는 그림 모델들의 이름 — 「디테일형·속도형」. 서버 연결 딱지에 쓴다. */
export function providerModelNames(provider: Model): string {
  return VISIBLE_IMAGE_MODEL_IDS.filter((id) => analysisProviderFor(id) === provider).map(imageModelName).join("·");
}

/**
 * 고른 그림 모델로 만들 수 있나 — **분석 AI 의 서버 키**를 본다. 안 되면 회원에게
 * 할 말, 되면 빈 문자열. 키는 분석 AI 것이지만 말은 고른 모델 이름으로 한다.
 */
export function missingServerKeyMessage(config: ServerConfig, imageModel: string): string {
  const provider = analysisProviderFor(imageModel);
  const configured = provider === "openai" ? config.serverOpenaiKeyConfigured : config.serverGoogleKeyConfigured;
  return configured ? "" : `${imageModelName(imageModel)} 운영자 서버 키가 설정되지 않았습니다.`;
}

export const baseSections = [
  ["S1 히어로", "3초 안에 제품, 타겟, 핵심 약속, CTA를 전달합니다.", "제품컷, 대표 USP"],
  ["S2 문제 공감", "고객이 자기 상황이라고 느끼는 체크리스트를 배치합니다.", "사용 전 고민 문구"],
  ["S3 베네핏 3개", "기능 나열을 체감 언어로 바꿔 기억 구조를 만듭니다.", "기능 설명, 사용 장점"],
  ["S4 USP 차별점", "경쟁 제품 대비 선택 이유를 한 문장으로 압축합니다.", "소재, 구성, 가격"],
  ["S5 근거/신뢰", "결과, 조건, 해석의 3단 구조로 신뢰를 설계합니다.", "인증, 수치, 테스트"],
  ["S6 사용법", "선택지를 2~3개로 줄여 구매 후 사용 장벽을 낮춥니다.", "루틴, 구성품"],
  ["S7 후기 카드", "실제 리뷰가 있을 때 사용감 문장 후기 카드로 구성합니다.", "리뷰, 평점"],
  ["S8 FAQ/오퍼", "마지막 구매 저항을 해소하고 CTA로 마무리합니다.", "배송, AS, 혜택"]
];

export const demoProjectTitles = new Set([
  "프리미엄 영양제 상세페이지 리디자인",
  "소형 가전 제품 USP 강화 작업",
  "뷰티 브랜드 첫 화면 3초 이해 개선"
]);

export function makeProject(overrides: Partial<Project> = {}): Project {
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
          `model_label: ${projectImageModelName({ model, imageModel: overrides.imageModel })}`,
          `model_id: ${redesignFalModelFor(model, overrides.imageModel)}`,
          "",
          `section: ${name}`,
          `purpose: ${purpose}`,
          "9:16 세로형 상세페이지 섹션. 원본 제품컷과 핵심 USP를 보존하고 구매전환 중심으로 리디자인."
        ].join("<br>")
      }))
  };
}

export function loadProjects() {
  return [];
}

export function loadKnowledgeItems() {
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
