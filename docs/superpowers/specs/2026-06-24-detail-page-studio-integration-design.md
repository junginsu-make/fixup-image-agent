# AI 상세페이지 스튜디오 통합 설계서 (AI Detail Page Studio Integration Design)

- 작성일: 2026-06-24
- 상태: 승인됨 (사용자 전체 승인)
- 대상 저장소: `IrumHahn/redesign-maker-10`, `IrumHahn/pdp-maker-201`

---

## 1. 목표 (Goal)

두 개의 AI 상세페이지 도구를 **하나의 통합 서비스 플랫폼("AI 상세페이지 스튜디오")**으로 합친다.

- **redesign-maker-10** — 기존 상세페이지(이미지/PDF)를 분석해 **리디자인**하는 도구
- **pdp-maker-201** — 상품 사진 1장으로 상세페이지를 **새로 생성**하는 도구

### 핵심 원칙 (확정)

1. **백엔드/AI/비즈니스 로직은 최대한 보존한다.** 각 시스템의 특장점과 성능을 유지하기 위해 핵심 로직(프롬프트, 모델 호출, RAG, 인물 검증 루프 등)은 거의 수정하지 않는다.
2. **프론트엔드는 사용자 편의성·직관성을 위해 전면 재설계한다.** 필요하면 두 도구의 UI를 새 디자인 시스템으로 다시 만든다.
3. **공통 셸 + 독립 동작.** 두 도구는 하나의 통합 UI 안에서 모드로 전환되지만, 내부적으로는 독립 동작한다(상태·저장·AI 호출 분리). 도구 간 데이터 병합은 하지 않으며, "통합 라이브러리"는 조회만 합친다.
4. **단일 pnpm 모노레포 + 단일 Vercel 배포.**

---

## 2. 전체 아키텍처 (Architecture)

원칙: **백엔드는 패키지로 "이사"만 하고 로직은 보존, 프론트는 신규 작성.**

```
detail-page-studio/  (pnpm 모노레포, 단일 배포)
├─ apps/web/                     ★ 신규 통일 프론트엔드 (Next.js, 단일 배포 대상)
│   ├─ app/
│   │   ├─ page.tsx              통합 홈 (도구 선택)
│   │   ├─ create/               PDP "새로 만들기" 화면 (재설계)
│   │   ├─ redesign/             "리디자인" 화면 (재설계)
│   │   ├─ library/              통합 작업 라이브러리 (양쪽 IndexedDB 조회)
│   │   ├─ settings/             통합 API 키 설정 허브
│   │   └─ api/
│   │       ├─ pdp/*             → packages/pdp-core 로 위임 (얇은 핸들러)
│   │       └─ redesign/*        → packages/redesign-core 로 위임 (얇은 핸들러)
│   └─ (packages/ui 의 공통 디자인 시스템 사용)
│
├─ packages/pdp-core/            ★ pdp-maker 백엔드 보존
│     - pdp.service.ts (AI 엔진), 프롬프트, 타입, 인물 검증 루프
│     - 출처: pdp-maker-201/apps/web/lib/pdp-server/* + packages/shared/src/pdp.ts
│
├─ packages/redesign-core/       ★ redesign 백엔드 보존
│     - generate / edit-section / knowledge 비즈니스 로직
│     - rag.ts (Neon pgvector), knowledge-access.ts, 섹션 프롬프트 템플릿
│     - 출처: redesign-maker-10/src/app/api/* + src/lib/*
│
├─ packages/ui/                  ★ 공통 디자인 시스템 (shadcn 기반, 토큰, 다크모드)
└─ packages/shared/              교차 타입 (통합 설정 스키마, 라이브러리 아이템 등 최소 신규)
```

### 보존 vs 신규 구분

| 구분 | 처리 |
|---|---|
| pdp `pdp.service.ts`, 프롬프트, 인물검증 | **보존** (그대로 이식) |
| redesign `generate`/`edit`/`knowledge` 로직, `rag.ts`, `knowledge-access.ts`, 프롬프트 | **보존** (그대로 이식) |
| API 라우트 핸들러 본문 | 호출 가능한 함수로 **추출**, `apps/web` 핸들러는 얇은 어댑터 |
| 두 도구의 프론트엔드 UI | **신규 작성** (공통 디자인 시스템) |
| pdp 레거시(테니스/QR/소싱 Prisma/`apps/api`) | **제거** |

두 core 패키지는 서로를 호출하지 않는다(독립 동작).

---

## 3. 프론트엔드 / 정보구조 (Frontend / IA)

```
/            홈: 히어로 + 큰 카드 2개("새로 만들기" / "리디자인") + 최근 작업 + 설정 진입
/create      PDP 플로우: 업로드 → 처리 → 에디터(레이어·재생성·내보내기)  ※ 재설계 UI
/redesign    리디자인 플로우: 대시보드 → 작업공간 → 결과(섹션별 편집·다운로드) ※ 재설계 UI
/library     통합 작업 라이브러리: 양쪽 결과를 한 화면에서 조회·열기·삭제
/settings    통합 키 허브: OpenAI / Google(Gemini) / 지식베이스 키 한 곳 관리
```

- **공통 디자인 시스템(`packages/ui`)**: shadcn/ui(new-york) 기반으로 통일. 다크모드·반응형·접근성 토큰 관리. (두 repo 모두 shadcn 계열이라 이식 부담 적음)
- **Tailwind 버전 통일**: redesign(v4) vs pdp(v3) → **v4로 표준화**(프론트 신규 작성으로 자연 해소).
- **상태/저장**: 각 도구의 기존 IndexedDB 저장소(`hanirum-redesign-projects`, `hanirum-pdp-maker`)는 **그대로 유지**. 통합 라이브러리는 두 저장소를 **읽기 전용으로 합쳐 표시**(병합 아님).

---

## 4. 통합 API 키 설정 허브 (Unified Settings)

문제: 두 백엔드의 키 주입 방식이 다름.
- **pdp-core**: `X-Gemini-Api-Key` 헤더
- **redesign-core**: 폼 필드 `openaiKey`/`googleKey` + 지식베이스 `accessKey`/`adminKey`

해결: 프론트에 **통합 설정 스키마 1개 + 백엔드별 주입 어댑터**(백엔드 보존).

```
[통합 설정] localStorage 단일 스키마
  { openaiKey, googleKey, knowledgeAccessKey, knowledgeAdminKey }
        │
        ├─ pdp 호출 시      → X-Gemini-Api-Key: googleKey 헤더로 변환
        └─ redesign 호출 시 → openaiKey/googleKey/... 폼 필드로 변환
```

- 사용자는 한 화면에서 키를 입력, 각 도구는 필요한 키만 사용.
- 기존 "클라이언트 저장(BYO 키)" 관행 유지, 서버 환경변수 키도 폴백 지원.

---

## 5. 데이터 흐름 · 에러 처리 · 환경변수

**데이터 흐름** (두 흐름 평행, 교차 없음):
```
프론트 → /api/pdp/*      → pdp-core      → Gemini
프론트 → /api/redesign/* → redesign-core → OpenAI/Gemini + Neon(RAG)
```

**에러 처리**: 각 백엔드의 기존 타입드 에러 매핑(pdp `PdpErrorCode`, redesign `humanizeProviderError`)을 **보존**, 프론트에서 공통 토스트/에러 UI로 표시.

**환경변수(합집합)**: `DATABASE_URL`(redesign RAG), `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_ANALYSIS_MODEL`, `KNOWLEDGE_ACCESS_KEYS`, `KNOWLEDGE_ADMIN_KEY`. 사용자 BYO 키는 프론트에서 주입.

**완료 기준(테스트/검증)**: 두 repo 모두 테스트 부재 → ① `pnpm build` + `typecheck` 통과, ② 두 도구 핵심 플로우 수동 검증, ③ 키 검증 엔드포인트(`validate-key`) 동작 확인.

---

## 6. 리스크 / 사전 정리 사항

1. **빌드 도구 이질성**: npm(redesign) vs pnpm(pdp), Next 'latest' vs 14.2.5, Tailwind v4 vs v3 → 모노레포에서 **pnpm + 단일 Next/Tailwind 버전 표준화**.
2. **pdp 레거시 제거**: 테니스/QR/소싱 Prisma/`apps/api` 등 PDP 무관 상속 코드 삭제(보존은 PDP·redesign 핵심 로직에만 적용).
3. **미래 날짜 모델 ID**(`gpt-image-2-2026-...`, `gemini-3.1-pro-preview` 등): 보존 원칙에 따라 **그대로 유지**(동작은 키/모델 권한 의존).
4. **코드 확보**: 두 GitHub repo를 새 모노레포로 `git clone` 하여 이식. (현재 작업 폴더는 비어 있음, git/node/npm 사용 가능, pnpm은 corepack으로 활성화)

---

## 7. 환경 사전 점검 결과 (2026-06-24)

- git 2.54.0 ✓ / Node v24.17.0 ✓ / npm 11.13.0 ✓ / GitHub 접속 ✓
- pnpm 미설치 → `corepack enable pnpm` 으로 활성화 예정
- 작업 폴더 `C:\Users\PC\Desktop\coding\Detail Page` 비어 있음 → 모노레포 루트로 사용

---

## 8. 구현 단계 개요 (상세 플랜은 별도 작성)

1. 환경 셋업: 모노레포 스캐폴드, pnpm 활성화, git 초기화
2. 두 repo 클론 → 백엔드 로직을 `packages/pdp-core`, `packages/redesign-core`로 이식(레거시 제거)
3. `packages/ui` 공통 디자인 시스템 구축
4. `apps/web` 신규 프론트엔드: 홈 → 설정 허브 → 두 도구 화면 → 통합 라이브러리
5. API 라우트 얇은 어댑터 + 키 주입 어댑터 연결
6. 빌드·타입체크·플로우 검증
7. Vercel 단일 배포 구성

각 단계는 `/auto` 스킬로 단계별 구현·검증하며 진행한다.
