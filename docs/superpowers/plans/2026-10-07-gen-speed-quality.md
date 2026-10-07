# 상세페이지 · 카드뉴스 생성 속도 · 품질 · 크레딧 묶임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**배경:** 사용자 보고(2026-10-07): 카드뉴스 마지막 장이 오래 걸림 · 엔딩이 늘 같은 문구 · 상세페이지 기획이 처음부터 오래 걸림 · 상세페이지 이미지 생성 중 401/404/422. 읽기 전용 조사(운영 DB · Caddy · journal · fal 상태 API) 결과로 원인이 확정된 것만 고친다. 사용자 지시: 「발견했지만 아직 개선 안 한 것들이 중요하면 개선」, 「분리해서 새 브랜치로」.

## 조사로 확정된 원인

- 상세페이지 한 장 다시 만들기(`apps/web/app/api/pdp/images/route.ts` ~216-223)가 품질검수 불합격(`PDP_IMAGE_QA_REJECTED`, 422)일 때 실패 정산에 `completionConfirmed` 를 넘기지 않아 `credit_finalize` 가 needs_review 로 보내 1크레딧이 계속 묶인다(일괄 경로는 true 를 넘겨 바로 풀린다). fal 은 이미지를 돌려줬고 우리가 버렸으니 「끝났음」이 확실하다.
- 상세페이지 기획(analyze · plan-from-text)의 Claude 호출이 120초 제한에 걸리면 SDK `maxRetries: 2` 로 같은 요청을 두 번 더 기다려(약 6분) 그 뒤에야 OpenAI 로 넘어간다(`apps/web/lib/pdp/providers.ts` ~204). 오늘 7건 중 6건.
- 상세페이지 품질검수가 무슨 결함으로 불합격시켰는지 기록이 없다(nano-banana 일반판 3/3 불합격의 원인을 알 수 없음).
- 카드뉴스 만들기(`apps/web/lib/sns/queued-flow.ts` `startQueuedFlow` ~240-426)가 카드 장면 프롬프트(`writeImagePrompt`, Claude)를 한 장씩 차례로 다 쓴 뒤에야 첫 장을 fal 에 보낸다(오늘 224초, 그동안 진행 표시 없음).
- 카드뉴스 엔딩: 일반 화면은 엔딩 원고를 AI 가 쓰지 않고 코드가 「핵심 내용을 기억해 주세요」 · 빈 본문 · 고정 `intent` / `visualBrief` 를 넣는다(`apps/web/lib/sns/actual-flow.ts` ~89-100). 엔딩 자리 참고 그림이 없으면 표지 · 속지 그림을 쓰지 않고 참고 없이(text-to-image) 그린다(`packages/sns-core/src/image-prompt.ts` `selectReferencesForRole` ~86-91, `queued-flow.ts` ~193). 「쉽게」에는 이를 메우는 코드가 있다(`apps/web/app/easy/cardnews-ending.ts`).
- 카드뉴스 fal 한 장이 이례적으로 늦어도(오늘 446초) 화면은 말없이 「만드는 중」.

## 규칙 (모든 Task)

- 돈: 사용자는 결과물을 받지 못하면 차감되지 않는다(사용자 원칙). 예약 · 확정 · 환불 의미를 바꾸지 않는다 — Task 1 의 `completionConfirmed` 한 칸만 예외.
- 화질 결정(「장면 프롬프트는 길이 제한 없이 자세히」 등)은 바꾸지 않는다. 모델 · 단가 · 카드 한 장씩 fal 제출(설계상 일부러)은 바꾸지 않는다 — 여러 장 동시 제출은 사용자 결정 대기.
- 로그아웃 범위(global → local)는 사용자 결정 대기 — 이번에 안 바꾼다.
- 줄표(—) 금지(화면 글 · 프롬프트 글), 새 파일에 업체 SDK import 금지, 불변 패턴, 파일 ≤ 800줄, `console.log` 금지(기록은 `apps/web/lib/easy/log-text.ts` 의 `errorLogText`).
- TDD: 실패하는 시험 먼저, 뮤테이션 확인. 스테이징은 자기 파일만 경로를 적어서.
- 다른 터미널과 분리: 이 브랜치(`fix/gen-speed-quality`)에서만. `packages/**` 는 Task 4 에서 꼭 필요할 때만, 그 함수를 쓰는 곳을 모두 확인한 뒤.

### Task 1: 상세페이지 한 장 다시 만들기의 검수 불합격이 크레딧을 묶지 않는다

`apps/web/app/api/pdp/images/route.ts` 의 실패 정산에서, 품질검수 불합격(fal 이 이미지를 돌려줬고 우리가 버린 경우)일 때 일괄 경로와 같이 `completionConfirmed: true` 로 정산한다. fal 자체 실패 · 시간 초과처럼 끝났는지 모르는 경우는 지금처럼 둔다(그것이 needs_review 의 본뜻). 일괄 경로(`images/batch`)와 같은 판정을 쓰는지 대조한다. 시험: 단건 QA 불합격 → 정산 인자에 completionConfirmed true, 사용 0 · 예약 풀림 기대(가능하면 credit 함수 계약 시험), fal 실패 → 지금 그대로.

### Task 2: 상세페이지 기획이 시간 초과 때 6분을 버리지 않는다

`apps/web/lib/pdp/providers.ts` 기획 · 검수 호출(analyze · plan-from-text 의 blueprint · review · 다시 쓰기)에서, Claude 가 제한 시간에 걸리면 같은 요청을 다시 기다리지 않고 바로 예비(OpenAI)로 넘어간다. 과부하(429 · 529) 같은 짧은 재시도가 유효한 경우의 처리는 지금과 같게 두는 쪽을 우선한다(SDK 재시도 옵션 · 우리 쪽 감싸기 중 범위가 좁은 쪽). 비용 기록(recordFrom)은 그대로. 기록에 「기획 시간 초과 → 예비」 한 줄. 제한 시간 값 자체는 바꾸지 않는다(측정 전). 시험: 시간 초과 1회 → 재시도 없이 예비 호출, 429 → 지금처럼.

### Task 3: 상세페이지 검수 불합격 까닭을 서버 기록에 남긴다

`packages/pdp-core` 의 QA 판정(`pdp.qa.ts` `isBlockingDefect`) 결과로 불합격이 나면, 그 결함 종류(브랜드 · 로고 · 수치 · 제목 오타 · 왜곡 등의 분류 이름 · 짧은 설명)를 `apps/web` 쪽(라우트 · lib/pdp)에서 `errorLogText` 로 한 줄 기록한다(사용자 글 원문 · 이미지 주소는 넣지 않는다). packages 를 바꾸지 않고 오류 객체의 내부 상세에서 읽을 수 있으면 그렇게. 화면 응답은 그대로.

### Task 4: 카드뉴스 만들기의 장면 프롬프트를 동시에 쓰고, 첫 장을 먼저 보낸다

`apps/web/lib/sns/queued-flow.ts` `startQueuedFlow`: 카드 장면 프롬프트를 동시에 최대 3개까지 쓴다(결과 순서 · 카드별 입력은 그대로). 실패 처리(한 장이 실패하면 지금 어떻게 하는지)와 비용 기록, 예비 모델 넘어가기는 지금과 같게. Anthropic 동시 호출 한도와 서버 메모리(911MB)를 고려해 3을 넘기지 않는다. 시험: 6장 → 동시 실행 수 ≤ 3, 결과 순서 보존, 한 장 실패 시 지금과 같은 결과. (선택: 프롬프트가 다 써지기 전 1번을 먼저 제출하는 파이프라인은 하지 않는다 — 구조 변경이 커서.)

### Task 5: 카드뉴스 엔딩을 내용에 맞게 쓰고, 엔딩 그림이 없으면 속지 · 표지 그림을 쓴다

(a) 엔딩 원고: `apps/web/lib/sns/actual-flow.ts` 의 고정 문구 대신, 원고가 나온 직후 엔딩 원고를 AI 가 쓴다 — 「쉽게」 `apps/web/app/easy/cardnews-ending.ts`(`endingPrompt` · `fallbackEnding`)를 재사용하거나 같은 방식. 실패하면 지금 고정 문구로 물러난다(화면이 멈추지 않게). 엔딩 `intent` · `visualBrief` 도 내용에서. 비용은 기존 원고 단계 계량 안.
(b) 엔딩 참고 그림: 엔딩 자리 그림이 없으면 속지(없으면 표지) 그림을 쓴다 — 「쉽게」 `styleSlots` 규칙. 이 판정을 쓰는 비용 예상(`cost-estimate.ts`) · 화면 자리 표시(`slot-rows.ts`)가 같은 결과를 내게(화면 · 장부가 어긋나지 않게) 한 곳에서 정한다. `packages/sns-core` `selectReferencesForRole` 을 바꿔야 하면 그 함수를 쓰는 곳(sns · easy · layout)을 모두 확인하고 시험한다.
시험: 엔딩 원고가 내용에 따라 달라짐(가짜 provider), 실패 시 고정 문구, 엔딩 그림 없음 → 속지 그림 사용(edit), 비용 예상 일치.

### Task 6: 카드뉴스 한 장이 3분을 넘으면 늦어지고 있다고 알린다

카드뉴스 화면(`apps/web/app/sns/[id]/project-client.tsx` 등)과 「쉽게」 카드뉴스 진행 표시에서, 한 장의 생성이 3분을 넘으면 「그림 업체가 늦어지고 있습니다. 조금만 더 기다려 주세요.」류 안내를 보인다(자동 재제출 · 취소는 하지 않는다 — 이중 과금). 시각 기준은 실제 fal 제출 시각(카드 데이터에 없으면 상태가 generating 으로 바뀐 것을 처음 본 시각). 시험.
