# 서버 처리 오류 원문 가리기 (카드뉴스 · 다양하게 나머지 · 기타) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** 실패할 때 데이터베이스 · 업체 SDK · 환경변수 이름 같은 내부 오류 원문이 화면으로 가는 서버 처리 31곳을 고친다. 2026-10-07 쉽게 · 다양하게 후속 정리(#280)와 같은 규칙.

**사용자 승인(2026-10-07 18:03):** 「분리해서 지금 개선해야 하는 것을 개선, 새 브랜치로」. 캐릭터(`app/api/characters/**`) 3곳과 사진 올리기(`app/api/reference-images/**`) 2곳은 다른 터미널 작업(이미지 첨부 통합 · 캐릭터)과 겹칠 수 있어 **이번에 제외**한다.

**Spec:** 별도 설계서 없음. 기준은 #280 의 규칙(아래)과 그 구현 — `apps/web/app/api/poster/projects/[id]/edit/route.ts` 의 `editFailure`, `apps/web/lib/easy/log-text.ts` 의 `errorLogText`.

## 규칙 (모든 Task)

1. 라우트마다 그 라우트와 부르는 lib 에서 나올 수 있는 오류 · 오류 응답을 표로 만든다: 문장 · 상태 코드 · 사용자용인가.
2. **사용자용 문장(우리가 일부러 쓴 한국어 안내, 입력 검증, 404, 크레딧 · 권한 · 운영자 멈춤, 업체 혼잡 `FalPoolBusyError` · `FalPoolUnavailableError`, 과금 뒤 실패 `PosterChargedError` 류)은 문장 · 상태 코드 · 다른 칸 모두 그대로**.
3. 예상 못 한 오류(Supabase · 저장소 · fal · LLM SDK · zod 원문 · 설정 오류의 환경변수 이름)는 그 라우트가 지금 쓰는 일반 문장(fallback)으로 바꾸고, **상태 코드는 그대로**, 원문은 `console.error("[영역] …", errorLogText(error))` 로 서버 기록에만.
4. **돈 흐름(예약 · 확정 · 환불 · 정산) 0줄 변경**. 화면(클라이언트) 파일 0줄 변경 — 화면이 `message` 외에 무엇을 읽는지(상태 코드 · `kind` · `retryable` · `missing` · `detail`)는 grep 으로 확인하고, 화면이 읽는 칸은 지우지 않는다.
5. `packages/**`, `apps/web/app/api/characters/**`, `apps/web/app/api/reference-images/**`, 화면 컴포넌트 0줄.
6. 이미 #280 에서 고친 라우트(`easy/generate`, `easy/cardnews`, `poster/projects/[id]/{edit,generate,plan,review,status}`)는 grep 에 걸려도 사용자용 갈래일 가능성이 크다 — 확인만 하고 원문이 새는 곳이 실제로 있을 때만 고친다.
7. 시험: 라우트마다 최소 (a) 원문 오류 → 응답에 원문 없음 · 같은 상태 코드 · 일반 문장, (b) 사용자용 문장 하나 → 그대로. 기존 시험 파일에 더하거나 새로 만든다. 줄표(—) 금지(`ui-text-dash`).
8. 커밋은 영역마다 하나 이상, `fix(<영역>): <한국어>` + 꼬리 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 스테이징은 자기 파일만 경로를 적어서.

### Task 1: 카드뉴스 서버 처리 16곳

`apps/web/app/api/sns/**/route.ts` 중 원문을 보내는 곳: layout(analyze · apply · deck-preview · decks · decks/[id] · preview · templates · templates/[id]), projects(route · [id] · [id]/caption · [id]/cards/[index] · [id]/generate · [id]/plan · [id]/status · [id]/stop). 카드뉴스 화면(`app/sns/**`)과 쉽게 카드뉴스(`lib/easy/cardnews-steps.ts` 등 relay → `EasyStepError`)가 응답을 어떻게 읽는지 확인한다 — 특히 status(폴링)는 상태 코드를 바꾸지 않는다.

### Task 2: 그 밖 15곳

`ad/export`, `admin/cost-plans`, `admin/works`, `candidates`, `pdp/style-references`, `poster/projects/route.ts`, `poster/projects/[id]/route.ts`, `poster/projects/[id]/images/[index]/file`, `poster/projects/[id]/select`, `poster/projects/[id]/stop`, `poster/references`, `reference-sets/route.ts`, `reference-sets/[id]`, `showcase/manage`, `sources/route.ts`, `sources/[id]` (+ 규칙 6 의 확인). 관리자 화면(`admin`)은 운영자만 보지만 같은 규칙.
