# 쉽게 모드 후속 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 2026-10-07 운영 배포(#263, 4848eac7) 뒤 남은 다섯 가지를 고친다 — 내부 오류 글 숨기기, `route.ts` 나누기, 100개 밖 옛 결과물 안내, 카드뉴스 장 번호 단추 재등장, 쉽게 설명서 + 도우미 색인(옛 판 자동 정리).

**사용자 승인(2026-10-07 13:16):** 계획 그대로, 색인 옛 판은 (나) 스크립트가 스스로 지운다. 「또 다른 오류가 발생되서는 절대 안됩니다」 — 모든 작업은 동작을 바꾸는 곳만 바꾸고, 바꾼 것마다 실패하는 시험을 먼저 쓴다.

**Spec:** 별도 설계서 없음. 근거는 `docs/superpowers/specs/2026-10-07-easy-ai-assistant-stage2-design.md`(2차 설계)와 2차 최종 리뷰 · 보안 리뷰(장부 `.superpowers/sdd/2026-10-07-easy-ai-assistant-stage2/progress.md` 끝부분).

## Global Constraints

- UI 글 · 프롬프트 · 사실 문장 글자 안에 줄표(—) 금지(`app/__tests__/ui-text-dash.test.ts`; 주석 · 시험은 예외)
- 새 파일에 업체 SDK import 금지(`lib/__tests__/ai-cost-call-sites.test.ts`), 새 LLM 호출 없음
- 처음 만들기 경로 0줄: `apps/web/app/api/poster/**`, `apps/web/app/api/sns/**`, `packages/**`, `apps/web/app/poster/**`, `apps/web/app/sns/**` (`git diff --stat origin/master -- <경로>` 가 비어야 한다)
- 돈 흐름(예약 · 정산 · 차감) 변경 없음. DB 스키마 변경 없음(색인 DB 는 행 삭제만, Task 4)
- `easy-client.tsx` ≤ 800, 모든 파일 ≤ 800, 함수 ≤ 50줄 권고, 불변 패턴, `console.log` 금지(`console.error`/`warn` 은 기존 패턴대로)
- 커밋 `<type>(easy|guide|scripts): <한국어>` + 꼬리 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, 푸시 안 함
- 검증: `cd apps/web && npx vitest run app/easy app/api/easy lib/easy app/library app/guide lib/cs` + 지킴 시험(ui-text-dash · upload-rights-notice · ai-cost-call-sites · generate-wiring) + `pnpm -r typecheck` + 바꾼 파일 eslint + 핵심 수정 하나를 되돌려 시험이 깨지는지(뮤테이션)

## Review Focus

1. 사용자에게 **보여야 하는** 안내(크레딧 부족 · 권한 · 「대화를 찾을 수 없습니다」 · 2000자 · 판단 단계가 낸 우리 문장)가 Task 1 뒤에도 그대로 보인다
2. Task 6 의 나누기 뒤 응답 본문 · 상태 코드 · 저장 줄 순서 · 예약/정산 호출이 바이트 단위로 같다(시험이 소스 글자를 읽는 배선 시험 포함)
3. Task 4 는 **새 판을 넣는 데 성공한 그 문서 이름**의 옛 판만, `kind='guide'` 만 지운다. 넣기가 실패하면 아무것도 안 지운다. 관리자가 올린 다른 지식 문서는 건드리지 않는다
4. Task 3 의 단추 숨기기가 실패한 단추 답(다시 눌러야 하는 경우)의 단추까지 숨기지 않는다
5. Task 2 의 새 안내가 「조회 실패(잠시 뒤 다시)」와 「100개 밖(오래됨)」을 정확히 가른다

---

### Task 1: 예상 못 한 오류의 원문을 화면에 보내지 않는다

**Files:**
- Modify: `apps/web/app/api/easy/generate/route.ts` (끝의 `return fail(error instanceof Error ? error.message : …)`, 약 637줄)
- Modify: `apps/web/app/api/easy/conversations/route.ts` (17줄 근처), `apps/web/app/api/easy/conversations/[id]/route.ts` (11줄 근처), `apps/web/app/api/easy/works/route.ts` (24줄 근처)
- Modify(필요하면): `apps/web/lib/easy/store.ts` — 사용자에게 보여야 하는 「대화를 찾을 수 없습니다.」(약 273줄)를 알아볼 수 있게(예: 이름 붙은 오류 클래스나 404 표시)
- Test: 각 라우트의 기존 시험 파일에 더한다(없으면 `apps/web/app/api/easy/__tests__/` 에 새로)

**요구:**
- `EasyStepError` 가 아닌 예외(Supabase 원문 · 업체 SDK 오류 · `chat.ts` 의 「무슨 뜻인지 가리지 못했습니다: <모델 출력>」 등)는 응답 `message` 에 원문을 싣지 않는다. 일반 문장(라우트마다 지금 있는 fallback 문장을 쓴다: 「만들지 못했습니다.」 등 — 「잠시 뒤 다시 시도해 주세요.」를 덧붙여도 된다)만 보내고 원문은 `console.error("[easy] …", error)` 로 서버 기록에 남긴다
- `EasyStepError` 처리 갈래는 **그대로**(크레딧 · 권한 · code · retryable 동작 변화 0)
- 사용자에게 보여야 하는 우리 문장은 그대로 보인다: 「대화를 찾을 수 없습니다.」(대화 하나 · 만들기 라우트), 입력 검사 문장(2000자 등 — 이미 `fail()` 로 일찍 나가는 것), 그 밖에 라우트가 일부러 `throw new Error("<사용자용 문장>")` 하는 곳이 있으면 모두 찾아(grep `throw new Error(` in `app/api/easy`, `lib/easy`) 목록을 보고서에 적고 사용자용이면 지킨다. 상태 코드는 지금과 같게
- 대화에 남기는 실패 줄(`failureRowMessage`)은 이미 일반 문장이다 — 바꾸지 않는다
- 시험: 각 라우트에서 (a) Supabase 같은 원문 오류 → 응답에 원문 없음 · 일반 문장 · 같은 상태 코드, (b) 사용자용 문장(대화를 찾을 수 없음) → 그대로, (c) `EasyStepError`(402) → 그대로

### Task 2: 100개 밖 옛 결과물은 「잠시 뒤 다시」가 아니라 사실대로 말한다

**Files:** `apps/web/lib/easy/image-list.ts`(66-84 근처, 100개 상한), `apps/web/lib/easy/edit-target.ts`(39 `확인못함`), `apps/web/lib/easy/see-turn.ts`(보기 대상), `apps/web/app/easy/image-numbers.ts`(필요하면 상태 이름), 시험 각 파일

**요구:**
- 지금 `unknown` 은 두 까닭이 섞여 있다: (1) 조회 실패(잠깐 — 「잠시 뒤 다시」가 맞다), (2) 최근 100개 밖이라 안 읽음(기다려도 안 된다). 둘을 가른다(예: 사실에 `unreadOld: Set<번호>` 를 따로 두거나 entry 에 까닭을 단다 — 결과물 번호 · 화면 이름표 · `madeImage` · `lastIsImage` · `doneImageNumbers` 는 지금과 같게)
- (2) 를 고치려 하면: 「결과물 N 은 오래되어 이 대화에서는 고칠 수 없습니다. 라이브러리에서 그 이미지를 열어 고쳐 주세요.」 — **라이브러리에서 실제로 그 이미지를 열어 고칠 수 있는지 코드로 확인하고**(라이브러리 화면 → 이미지 만들기/고치기로 가는 길), 안 되면 실제로 되는 길로 문장을 맞춘다. 줄표 금지. 크레딧 0(지금처럼 `replyTurn`)
- (2) 를 보라고 하면(see): 그 대상은 못 본 것으로 — 지금 규칙(고른 것 중 하나도 못 보면 `failed` → `SEE_FAILED`)은 유지하되, 고른 것이 모두 (2) 면 SEE_FAILED 대신 「오래된 결과물이라 볼 수 없습니다」류 사실 문장이 낫다면 그렇게(판단은 구현자, 보고서에 적는다). 지어내지 않는다는 원칙 유지
- 시험: 101개 이상 결과에서 1번 고치기 → 새 문장 · 값 0, 조회 실패 → 기존 「잠시 뒤 다시」 그대로, 번호 · 이름표 불변

### Task 3: 장 번호 물음에 답한 뒤 화면에서 단추가 다시 보이지 않는다

**Files:** `apps/web/app/easy/use-cardnews-after.ts`(126-140 근처 `cardAsk`), 필요하면 `apps/web/lib/easy/cardnews-after-turn.ts`(응답에 저장한 사용자 줄을 실어 보내기), 시험

**배경:** 2차 Task 10 고침 1 — 서버는 장 물음에 다시 그리기(card_redo)로 답하면 사용자 줄을 `;pick=` 없이 남겨 물음을 닫는다. 그런데 화면이 제 손으로 붙인 사용자 줄에는 `;pick=` 이 남아 `answerableAskId` 의 [물음, 단추 답] 대체 규칙으로 단추가 새로고침 전까지 다시 보인다(눌러도 값은 0).

**요구:**
- 서버가 물음을 닫은 그 응답(`cardAsk` 가 온 장 물음 답)에서는 화면의 사용자 줄도 서버가 저장한 것과 같게(표시 없이) 바꾸거나, 서버가 응답에 저장한 줄을 실어 화면이 그것으로 바꾼다 — 둘 중 더 작은 쪽
- **실패한 단추 답의 단추는 지금처럼 다시 보여야 한다**(Review Focus 4 — 다시 눌러야 한다)
- 시험: 장 물음 → 「2번」 단추 → `cardAsk` 응답 뒤 `answerableAskId` 가 undefined(화면 줄 기준). 실패 응답이면 단추가 남는다

### Task 4: 도우미 색인 스크립트가 같은 설명서의 옛 판을 스스로 지운다

**Files:** `scripts/index-guide.mjs`(145-170), 시험 `apps/web/lib/cs/__tests__/index-guide-script.test.ts`(이 시험은 스크립트 글자를 읽는다 — 그 방식에 맞춰 더한다)

**요구:**
- `packages/**` 는 고치지 않는다. 스크립트 안에서 같은 DB 드라이버(redesign-core `rag.ts` 의 `getSql` 이 쓰는 것과 같은 것 — 확인해서)로 `DATABASE_URL` 에 붙는다
- 문서 하나를 `indexKnowledgeDocument` 로 넣어 `indexed: true` 와 `documentId` 를 받은 **뒤에만**, `DELETE FROM knowledge_documents WHERE kind = 'guide' AND name = <그 이름> AND id <> <documentId> RETURNING id` 로 옛 판을 지운다(조각은 `ON DELETE CASCADE`). 지운 수를 찍는다
- 넣기가 실패한 문서는 그 이름의 옛 판을 안 지운다(옛 판이라도 남아 있어야 도우미가 답한다)
- `--dry` 는 아무것도 안 지우고, 지울 옛 판 수를 셀 수 있으면 「지울 옛 판 N개」를 찍는다(DB 가 없으면 생략)
- 비밀 값 · 접속 문자열을 찍지 않는다
- 시험: 지우기 줄이 성공한 넣기 뒤에만 있고 `kind = 'guide'` · `name` · `id <>` 조건을 다 갖는지(스크립트 글자 시험), `--dry` 갈래에 DELETE 가 없는지

### Task 5: 쉽게 설명서에 이번 기능을 쉬운 말로 더한다

**Files:** `apps/web/app/guide/easy/page.tsx`(219줄), 시험 `apps/web/app/guide/__tests__/`(쉽게 쪽 시험이 있으면 더한다)

**요구:** 지금 설명서 모양(카드 · 제목 · 짧은 문장)을 그대로 따라 다음을 더한다. 사실만 적는다(코드로 확인한 동작):
- AI 가 묻고, 단추나 말로 답하면 처음 주문을 이어 간다. 새로고침해도 물음이 남는다
- 만든 결과물에 「이미지 1」 · 「카드뉴스 2」처럼 번호가 붙는다. 「이미지 2 배경만 바꿔줘」 · 「아까 첫 번째 거」처럼 번호로 골라 고친다. 어느 것인지 모르면 AI 가 되묻는다. 고치기는 이미지 만들기처럼 크레딧이 든다
- 「방금 거 어때?」처럼 물으면 AI 가 그림을 보고 답한다(크레딧 0). 볼 수 없으면 볼 수 없었다고 말한다
- 「광고 소재」는 먼저 무엇을 원하는지 묻고, 네이버 · 구글 · 카카오 규격별이면 「광고 소재」 화면으로 안내한다
- 라이브러리 「과정 보기」로 쉽게 대화를 다시 연다
- 크레딧 안내: 이미지가 만들어질 때만 크레딧이 든다(만들기 · 고치기 · 카드뉴스). 대화 · 물음 · 이미지 보고 답하기는 0
- 줄표 금지(`ui-text-dash`), 설명서 목차 시험(`index-coverage.test.ts`) 통과

### Task 6: `generate/route.ts` 를 동작 그대로 나눈다

**Files:** `apps/web/app/api/easy/generate/route.ts`(790줄) → 갈래별 도우미를 `apps/web/lib/easy/` 아래 새 파일로(예: `turn-target.ts`(번호 물음 · 고치기 길), `turn-see.ts`(보기), `turn-image.ts`(이미지 만들기 길) — 이름 · 나눔은 구현자가 코드에 맞게). 소스 글자를 읽는 배선 시험(`app/api/easy/__tests__/generate-wiring.test.ts` 등)은 옮긴 곳을 읽게 고친다 — **단언을 약하게 하지 않는다**

**요구:**
- 순수 옮기기. 응답 본문 · 상태 코드 · 저장 줄 순서 · 예약/정산 호출 순서 · 오류 갈래가 그대로다. 로직 · 문장 · 순서를 「온 김에」 고치지 않는다
- 나눈 뒤 `route.ts` 는 500줄 안팎 이하, 새 파일은 각 400줄 이하, `turn()` 은 지금보다 확실히 짧게
- Task 1 · 2 뒤에 한다(같은 파일)
- 검증: 쉽게 시험 전부가 **고치지 않은 채로**(배선 시험의 파일 경로만 예외) 통과. 배선 시험이 읽던 「라우트에 이 글자가 있다 / 없다」 단언은 옮긴 파일에서 같은 뜻으로 지킨다. 보고서에 옮긴 함수 목록 · 줄 수 전후를 적는다

---

## 끝난 뒤 (컨트롤러)

1. 브랜치 전체 최종 리뷰(가장 좋은 모델) + 보안 리뷰 → 한 번의 수정 · 재검토
2. CI 전체를 로컬에서(`pnpm test` · `pnpm -r typecheck` · `pnpm lint` · DB 검사 4종 · audit · cost-forecast)
3. PR → 검사 → 병합 → `docs/DEPLOY.md` 「매 배포」 → 배포 확인(이번 문구 빌드 안에) → 운영에서 Task 1 · 5 확인(설명서 화면 200 · 새 문장)
4. 도우미 색인: `--dry` 로 13쪽 · 지울 옛 판 수 확인 → 실제 실행(서버 `app.env` 의 `DATABASE_URL` · `OPENAI_API_KEY` 를 화면에 안 찍고 환경변수로만) → 옛 판 0 · 새 문장 검색 확인
5. 개발 일지 PR
