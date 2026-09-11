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
import { randomId } from "../../lib/browser-safe";
export type Model = "openai" | "google";
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
};

export type Project = {
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
  count: number;
  displayCount?: number;
  displayIndex?: number;
  startedAt: number;
};

export type GenerationProgress = {
  percent: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: string;
  tip: string;
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
 * 화면에 보이는 이름은 **성질**이다. 업체·모델 이름을 적지 않는다 —
 * 어디에 무엇을 쓰는지가 이 서비스의 결론이라, 적어 두면 가입 한 번으로
 * 넘어간다. 진짜 정체는 아래 `id` 다 — 서버에 보낼 값이라 지울 수 없다.
 */
export const models = {
  openai: {
    label: "정밀형",
    id: "gpt-image-2-2026-04-21"
  },
  google: {
    label: "속도형",
    id: "gemini-3.1-flash-image-preview"
  }
};

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

export const commerceTips = [
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
