/**
 * 비용 표의 **이름표**(관리자 화면 전용 — 회원 화면에 업체 이름을 안 내는 시험(`model-name.test.ts`)이
 * `admin` 폴더만 비켜 간다). 모르는 키는 그대로 보인다 — 지어낸 이름으로 덮으면 새 기능이 어디서
 * 돈을 쓰는지 못 알아본다.
 */

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (글)",
  openai: "OpenAI (글·웹검색·임베딩)",
  google: "Google (글)",
  fal: "fal (그림)",
  apify: "Apify (유튜브 자막)",
  other: "기타",
};

/** 작업 키 = 예약 resource 에서 id 를 뺀 것(`lib/ai-cost/keys.ts`). */
const OPERATION_LABEL: Record<string, string> = {
  "sns": "카드뉴스 · 그림",
  "sns:plan": "카드뉴스 · 기획·원고",
  "sns:caption": "카드뉴스 · 게시글 문구",
  "sns:layout-analysis": "카드뉴스 · 칸 읽기",
  "poster": "포스터 · 그림",
  "poster:plan": "포스터 · 기획",
  "poster:review": "포스터 · 검수",
  "easy:decide": "쉬운 만들기 · 판정",
  "cs:ask": "AI 도우미",
  "pdp:analyze": "상세페이지 · 분석",
  "pdp:plan": "상세페이지 · 글로 기획",
  "pdp:style-reference": "상세페이지 · 참고 그림 분석",
  "pdp:image": "상세페이지 · 그림",
  "pdp:batch": "상세페이지 · 여러 장",
  "pdp:key-visual": "상세페이지 · 대표 그림",
  "character:candidates": "캐릭터 · 후보",
  "character:angles": "캐릭터 · 각도",
  "character:view": "캐릭터 · 한 장",
  "redesign:transcribe": "리디자인 · 읽기",
  "redesign:generate": "리디자인 · 만들기",
  "redesign:edit": "리디자인 · 고치기",
  "ad:export": "광고 내보내기",
  "ad:export:cutout": "광고 내보내기 · 배경 제거",
  "admin:knowledge": "관리자 · 지식 올리기",
  "unbound": "문맥 없음(입구 확인 필요)",
};

export const aiProviderLabel = (key: string) => PROVIDER_LABEL[key] ?? key;
export const aiOperationLabel = (key: string) => OPERATION_LABEL[key] ?? key;
