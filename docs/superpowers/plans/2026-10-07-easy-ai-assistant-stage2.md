# 「쉽게」를 AI 비서처럼 — 2차(D1~D5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「쉽게」가 정해진 화면 · 정해진 문장의 안내 데스크가 아니라 AI 비서처럼 굴게 한다 — 물음과 답이 대화에 남고(D1), 이 대화의 어느 이미지든 번호로 고치고(D2), 쓴 사진은 입력창에서 내리고(D3), 일하는 턴에도 AI 가 말하고(D4), 이미지에 대해 묻거나 볼 때만 AI 가 이미지를 본다(D5).

**Architecture:** 표(`easy_messages`)는 바꾸지 않고 줄 글(body)의 표시 한 벌(`app/easy/row-marks.ts`)로 물음 · 단추 답 · 안내 · 머리말을 알아본다. 서버는 물음 줄을 남기고(`lib/easy/ask-turn.ts`), 다음 턴에 줄을 거슬러 처음 말 · 답 · 고른 값 · 사진을 모은다(`app/easy/ask-chain.ts`) — 단추 답은 물음 줄에 적어 둔 판단으로 바로 간다(글 모델만 생략하고 0크레딧 판정 예약은 한다. 그 사이 사실이 바뀌었으면 판단 읽기와 같은 함수로 다시 본다). 결과물 번호(이미지 · 카드뉴스 · 지운 것 모두 대화 차례)는 화면과 서버가 같은 순수 함수(`app/easy/image-numbers.ts`)로 붙이고, 고칠 번호 검증은 줄 단위 · 이미지 번호일 때만(`lib/easy/edit-target.ts`)이다. AI 의 말은 판단과 같은 호출의 `reply` 이고, 이미지를 볼 때만 같은 판정 예약 안에서 두 번째 호출을 한다(`lib/easy/see-turn.ts`, 이미지 입력은 공용 어댑터 `lib/llm/structured.ts` 에만).

**Tech Stack:** Next.js 15 App Router · React 18 · TypeScript · vitest 4(+ react-test-renderer, jsdom 없음) · Anthropic/OpenAI 구조화 응답(`lib/llm/structured.ts`) · pnpm 9 워크스페이스

**Spec:** `docs/superpowers/specs/2026-10-07-easy-ai-assistant-stage2-design.md` (배경: 1차 설계 `docs/superpowers/specs/2026-10-06-easy-chat-flow-fix-design.md` · 1차 계획 `docs/superpowers/plans/2026-10-06-easy-chat-flow-fix-stage1.md`)

## Global Constraints

- **처음 만들기 경로 0줄 변경:** `apps/web/app/api/poster/**`, `apps/web/app/api/sns/**`, `packages/**`, `apps/web/app/poster/**`, `apps/web/app/sns/**` 는 한 줄도 바꾸지 않는다. 마지막 Task 에서 `git diff --stat $(git merge-base master HEAD) -- <그 경로들>` 이 비어 있어야 한다
- **DB 스키마 변경 없음.** `easy_messages` 의 칸(`id,conversation_id,role,body,work_id,created_at`)만 쓴다. 표시는 `body` 에 붙인다
- **표시 한 벌(설계 §3-0):** 물음 줄(도우미) `ask:<kind>:` + 필요하면 `;data=<encodeURIComponent(JSON)>` + 줄바꿈 + 보일 문장, kind = `kind` · `ratio` · `photo` · `reference` · `target` · `card` / 단추 답(사용자) 보일 글 끝에 `;pick=<encodeURIComponent(JSON)>` / 안내 줄(도우미) `guide:<kind>:`, kind = `detail` · `ad`(옛 `ad-guide:` 도 계속 읽는다) / 머리말 줄(도우미) `say:` / 고친 그림 줄 `;from=<encodeURIComponent(rowId)>`(고친 줄 표시 뒤, `;job=` 앞). 보일 글은 `visibleBody` 한 함수가 뗀다. **광고 물음은 1차 그대로 본문 완전일치**
- **옛 대화가 그대로 보이고 돈다.** 표시 없는 옛 줄(완전일치 상세페이지 안내 · `ad-guide:` 줄 · 빈 글의 그림 줄 · 물음 없는 대화)은 예전처럼 보이고 예전처럼 판단된다
- **`easy-client.tsx` ≤ 800줄** (지금 정확히 800). **첫 화면 Task(Task 5)가 묻기 상태 · 렌더를 `use-easy-asks.ts` · `_components/ask-row.tsx` 로 먼저 빼서 줄인다.** 화면을 고치는 Task 마다 끝에 `wc -l` 을 적는다
- **크기:** 새 파일 < 400줄, 새 함수 < 50줄, 기존 파일 < 800줄. `route.ts` 의 `turn()` 은 이미 길다 — 새 저장 · 조립은 `lib/easy/*` · `app/easy/*` 헬퍼로 빼고 라우트에는 부르는 줄만 둔다
- **UI · 프롬프트 문자열에 줄표 `—` 를 쓰지 않는다**(`app/__tests__/ui-text-dash.test.ts`). 「A. B」로 끊는다. 구역 제목의 `──`(U+2500)는 줄표가 아니다
- **공급자 SDK 를 새 파일에서 import 하지 않는다**(`apps/web/lib/__tests__/ai-cost-call-sites.test.ts`). 이미지 입력은 `lib/llm/structured.ts` 에만 더하고, 새 틀은 `lib/easy/chat-provider.ts` 에 `StructuredSpec` 으로 더한다
- **`generate-wiring.test.ts` 규칙을 지킨다:** `relay(` 단계 4개(`decide` · `project` · `plan` · `generate`), 첫 `role: "user"` 가 `createProject(` 앞, `(wants === "talk")` · `(wants === "detail_page")` 구간 글자, `easyAsk({` · `ratio: 고르기.ratio` · `easyTitle(prompt)` · `if (!conversation.title)`. **`route.ts` 안에 `role: "user"` 글자 · `relay(` 글자를 새로 쓰지 않는다**(주석 포함). 뒤집는 시험은 「물어볼 때는 대화에 아무것도 안 쌓는다」 · 「사진을 물을 때도 대화에 아무것도 안 쌓는다」 둘뿐이고, 까닭(사용자 결정 2차 D1)을 시험 주석에 적는다
- **불변:** 상태는 새 객체로 바꾼다(`{ ...current, [id]: value }`). 모을 때도 배열을 밀어 넣지 않고 새 배열을 만든다
- **크레딧 · 원가:** 물음 줄 저장은 예약 없이(값 0). **단추로 한 답은 판단 호출(글 모델)만 건너뛴다 — 0크레딧 `easy:decide` 판정 예약 · 정산은 그대로 한다**(2차 최종 리뷰 4: 운영자 멈춤 · 크레딧 확인이 그대로 걸리고, 뒤의 사진 읽기 · 역할 판단 · 끝 장 글의 원가가 이 예약(`bindAiCaller`)에 묶인다). D4 의 AI 말은 **같은 판단 호출**의 `reply`(추가 호출 없음, 빈 `reply` 로 다시 묻지 않는다 — 1차 A3 재질문은 `talk` 만). D5 의 「보고 답하기」는 **0크레딧 `easy:decide` 판정 예약이 닫히기 전에** 부른다 — 회원 크레딧이 아니라 회사 원가(계량기가 `[easy] 판단·읽기 … usd=` 로 적는다)
- **고정으로 남기는 문장:** 광고 물음(`AD_QUESTION`, 사용자 지정) · 사진 물음 문장 · 원고 실패 안내(`draftFailureMessage`) · 기본 「무엇을 만들어 드릴까요?」
- **만들기는 `image` 갈래만**(2차 최종 리뷰 1): 단추 답의 판단도 판단 읽기와 같은 사실(`availableWant`)로 다시 보고(`fitButtonDecision`), 프로젝트 만들기 바로 앞에서 `wants !== "image"` 면 짧은 안내 한 줄로 끝낸다 — 쓸 수 없게 된 갈래가 만들기로 새어 값이 나가지 않게
- **AI 글을 쓰는 때:** 판단 모델이 **지금 실행하는 갈래로** 쓴 `reply` 만(`aiText(decision, wants)`, 2차 최종 리뷰 b). 코드가 갈래를 바꿔 읽으면(고른 갈래가 이김 · revise↔image_edit · 갈래 물음 뒤 either→image) 코드 문장이다. AI 가 쓴 글은 저장 전에 표시 머리(`ask:` · `guide:` · `say:` · `ad-guide:` · `edit-request:`)를 푼다(`plainAiText`, 2차 최종 리뷰 c)
- **결과물 번호:** 이 대화의 결과물 줄 — 포스터 그림 줄 · 카드뉴스 줄 · 작업을 지운 줄 **모두**(`role: "image"` + `work_id`) — 에 나온 차례대로 1, 2, …. 표시도 데이터 SQL 도 안 보고 세므로 **운영의 옛 줄도 번호가 안 바뀌고**, 무엇을 지워도 뒤 번호가 당겨지지 않는다(2차 최종 리뷰 5). 고친 줄도 제 번호를 받는다. 화면은 「이미지 N」 · 「카드뉴스 N」(지운 것은 「결과물 N」), 판단 모델의 목록은 `#N 이미지 · …` / `#N 카드뉴스 · …` / `#N (지운 결과)`. 고치기(image_edit)의 번호는 **포스터 이미지 줄일 때만** — 카드뉴스 · 지운 번호는 값 없이 코드가 쓴 사실 문장
- **지난 대화 창:** 줄 수가 아니라 **사용자 말 8번** 단위로 자른다(한 말 뒤에 줄이 끝없이 붙는 대화를 위해 최대 40줄)
- **커밋:** 제목 `fix(easy): <한국어>` 또는 `feat(easy): <한국어>`, 둘째 `-m` 로 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. heredoc 쓰지 않는다. **푸시하지 않는다**
- **시험 명령:** 워크트리 뿌리(`C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow`)에서 `pnpm --filter @fixup/web exec vitest run <apps/web 기준 경로>`, 타입은 `pnpm --filter @fixup/web typecheck`
- **브라우저 도구는 한 메시지에 하나씩**, 다른 도구와 섞지 않는다
- **키 · 비밀은 출력하지 않는다.** 실제 모델 확인 스크립트는 키를 파일 안에서 읽는다
- **실제 모델 확인에서 FAIL 이 나오면 프롬프트를 몰래 고치지 않는다** — 출력 그대로 보고하고 결정을 묻는다

## Review Focus

1. **지난 물음의 단추(오래된 `answersRowId`)** — 물음 뒤에 다른 말이 이어졌는데 옛 물음 줄 id 로 단추 답이 오면 받지 않고 새 말로 본다(판단을 부르고, 물음 줄의 판단 · 고른 값 · 사진을 안 쓴다). 그래야 지금 맥락과 다른 지시에 값이 안 나간다. 단, **단추 답이 실패한 짝**(단추 답 줄 → 머리말 줄(있으면) → 실패 줄)만은 건너뛰어 그 물음에 다시 답할 수 있다 — 화면도 그 물음 줄에 단추를 다시 단다. → Task 1 「머리말이 낀 광고 단추 답 실패 짝도 건너뛴다」, Task 2 「지난 물음 줄 id · 없는 id · 광고 물음이면 받지 않는다」 · 「머리말 줄이 끼어든 단추 답 실패 짝도 건너뛴다」 · 「지금 답할 수 있는 물음 줄」, Task 4 「지난 물음 줄 id 로 온 단추 답은 새 말로 본다」, Task 5 「지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만 단추」
2. **머리말(AI 말) 줄 뒤의 실패** — 사용자 줄 → 머리말 줄 다음에 기획 · 생성 · 원고가 실패해도 실패 안내 줄이 남아야 한다(새로고침하면 답 없는 대화로 보이면 안 된다). → Task 1 「머리말 줄은 답으로 치지 않는다」, Task 9 「머리말 뒤에 기획이 실패해도 실패 줄이 남는다」
3. **표시가 섞이는 입력** — 자료 JSON 에 `;` · `,` · 줄바꿈 · 표시 글자가 있거나, 사용자가 `;pick=` 을 직접 쳐도, 고친 줄에 `;added=` · `;from=` · `;job=` 이 함께 있어도 서로 안 섞인다. → Task 1 「자료와 문장에 표시 글자 · 줄바꿈이 섞여도」 · 「친 말에 섞인 표시 글자는 풀어 둔다」, Task 7 「고친 줄 표시 · 넣은 사진 · 고친 대상 · 받을 정보가 안 섞인다」
4. **지운 결과 뒤의 번호와 줄 단위 고치기** — 결과물 번호는 이미지 · 카드뉴스 · 지운 것 모두 대화 차례라, 무엇을 지워도(운영의 표시 없는 옛 줄이어도) 뒤 번호가 그대로다. 「이미지 1 고쳐줘」는 같은 작업의 나중 줄(이미지 3 = 1 을 고친 것)이 아니라 이미지 1 줄의 그림을 고친다. 카드뉴스 번호 · 지운 번호는 고치지 않는다(값 없이 사실 문장). → Task 7 「지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다」, Task 8 「이미지 1 은 1번 줄의 그림을 고친다」 · 「카드뉴스 번호 · 지운 결과 번호는 값 없이 사실대로 답한다」
5. **답이 아닌 새 말에 옛 물음이 몰래 붙는 것** — 물음 뒤에 사용자가 다른 주문을 치면(판단이 답이라고 안 적으면) 앞 물음의 처음 말 · 단추로 고른 비율 · 물음 줄의 사진이 이번 주문에 붙지 않는다. → Task 2 「사슬이 없으면 옛 화면이 보낸 칸만 쓴다」, Task 4 「답이 아닌 새 주문에는 앞 물음의 처음 말 · 고른 값 · 사진을 안 붙인다」
6. **표시 없는 옛 줄** — 2026-10-07 전의 상세페이지 안내(완전일치) · `ad-guide:` 안내 · 빈 글의 포스터 그림 줄이 예전처럼 보이고(단추 포함) 번호를 받는다(번호는 표시를 안 본다). → Task 1 「표시 없는 옛 줄 · 그림 줄은 손대지 않는다」, Task 7 「표시 없는 옛 줄도 · 지운 작업 줄도 자리를 지킨다」, Task 10 「옛 완전일치 줄도 상세페이지 안내로 본다」
7. **쓸 수 없게 된 갈래로 새는 단추 답** — 물은 뒤 이미지를 지웠거나 원고가 사라졌는데 번호 · 장 단추가 오면, 판단 읽기와 같은 사실로 다시 보고 값 없이 사실만 말한다. 프로젝트 만들기는 `image` 갈래만 간다. → Task 2 「쓸 수 없게 된 단추 답은 다른 일로 새지 않고 사실 문장으로 끝낸다」, Task 4 「고칠 것이 사라진 번호 · 장 단추 답은 값 없이 사실만 말한다」 · Task 4 Step 6 의 막이 글자 확인
8. **말로 한 답의 되풀이 · 처음 말 잃기** — 모양 물음 뒤에는 무엇을 쳐도 같은 물음을 또 하지 않고, 갈래 물음 뒤 또 either 면 한 장으로, 번호 · 장 물음 바로 뒤 그 갈래면 `note` 가 없어도 답으로 본다. 사진 고르기가 열린 채 친 말은 그 물음의 답이고, 새로고침 뒤 말로 답하면 물음 줄의 사진을 센다. → Task 2 「말로 한 답의 갈래 정리」, Task 4 「모양 물음 뒤 말은 같은 물음을 다시 안 한다」 · 「갈래 물음 뒤 또 either 면 한 장으로」 · 「사진 고르기가 열린 채 말로 친 답」, Task 6 「새로고침 뒤 사진 물음에 말로 답하면 물음 줄의 사진을 센다」, Task 8 · 10 의 번호 · 장 말 답

## 되돌리기(롤백) 메모

2차는 1차와 같은 브랜치로 한 번에 배포한다. 되돌릴 곳(`master`)은 이 표시들을 모른다 — **되돌리면 표시가 붙은 줄이 글자 그대로 보인다**(「ask:ratio:」 머리 · `;pick=%7B…` 꼬리 · 「guide:ad:」 · 「say:」, 그리고 **1차의 광고 안내 줄 「ad-guide:」** — 1차도 같은 배포라 `master` 가 모른다). 그림 줄의 `edit-request:` · `;job=` 은 화면에 글자로 안 보이는 줄이라 그대로 둔다. 화면을 깔끔하게 되돌려야 하면 **사용자 승인을 받은 뒤에만** 운영 DB 에서 아래를 돌린다(표시만 떼고 보일 글을 남긴다 — 칸 · 표는 그대로).

순서: ① 바꿀 줄을 백업 표로 떠 둔다 ② **한 트랜잭션**으로 고친다 — 하나라도 실패하면 아무것도 안 바뀐다 ③ 화면을 확인한 뒤 백업 표를 지울지 사용자에게 묻는다(묻지 않고 지우지 않는다).

```sql
-- ① 백업: 바꿀 줄만 통째로 떠 둔다(되돌림을 다시 되돌릴 때 쓴다)
create table easy_messages_backup_20261007 as
  select * from easy_messages
   where (role = 'assistant' and (body like 'ask:%' or body like 'say:%' or body like 'guide:%' or body like 'ad-guide:%'))
      or (role = 'user' and strpos(body, ';pick=') > 0)
      or (role = 'image' and strpos(body, ';from=') > 0);

-- ② 한 트랜잭션
begin;
-- 물음 줄: 첫 줄(표시)을 떼고 보일 문장만 남긴다
update easy_messages set body = substring(body from position(E'\n' in body) + 1)
 where role = 'assistant' and body like 'ask:%' and position(E'\n' in body) > 0;
-- 머리말 줄: 'say:' 4글자를 뗀다
update easy_messages set body = substring(body from 5) where role = 'assistant' and body like 'say:%';
-- 상세페이지 안내 줄: 'guide:detail:' 13글자를 뗀다
update easy_messages set body = substring(body from 14) where role = 'assistant' and body like 'guide:detail:%';
-- 광고 안내 줄(2차): 'guide:ad:' 9글자를 뗀다
update easy_messages set body = substring(body from 10) where role = 'assistant' and body like 'guide:ad:%';
-- 광고 안내 줄(1차): 'ad-guide:' 9글자를 뗀다
update easy_messages set body = substring(body from 10) where role = 'assistant' and body like 'ad-guide:%';
-- 단추 답 줄: ';pick=' 부터 끝까지 뗀다
update easy_messages set body = left(body, strpos(body, ';pick=') - 1) where role = 'user' and strpos(body, ';pick=') > 0;
-- 고친 그림 줄: ';from=…' 을 뗀다(';job=' 앞까지)
update easy_messages set body = regexp_replace(body, ';from=[^;]*', '') where role = 'image' and strpos(body, ';from=') > 0;
commit;

-- ③ (사용자 확인 뒤, 승인을 받고) drop table easy_messages_backup_20261007;
```

## 정한 것 (설계가 열어 둔 자리)

- **reply 를 쓰는 때:** 판단 모델이 **지금 실행하는 갈래로** 쓴 `reply` 만 쓴다(`aiText(decision, wants)` — 2차 최종 리뷰 b). 코드가 갈래를 바꿔 읽은 경우(고른 갈래가 이김 · 판단 읽기의 revise↔image_edit · 갈래 물음 뒤 either→image · 고칠 것 없음 · 아직 안 만듦 · 만드는 중 · 없는 번호 · 지운 결과 · 카드뉴스 번호)는 고정 · 사실 문장 — 그때의 `reply` 는 다른 일을 하겠다고 쓴 글이다. 판단 읽기가 다른 **일하는** 갈래로 바꿔 읽으면 `reply` 를 아예 비운다(`availableWant`). 그 경우들은 프롬프트에 사실(결과물 목록 · 카드 장수 · 만드는 중)을 넣어 모델이 처음부터 `talk` 로 답하게 한다
- **물음 문장은 「?」가 어디든 들어 있으면 AI 글**(`askText` — 「세로로 할까요? 안 고르시면 정사각형으로 만듭니다.」처럼 물음 뒤에 설명이 붙어도), **머리말 · 안내 · 끝 문장은 비지 않았으면 AI 글**(`sayText`, 2차 최종 리뷰 3). 둘 다 `aiText` 를 지난 글만 받는다 — 아니면 고정 문장
- **사슬 잇기 표시 `cont`:** 물음 줄 자료에 「이 물음을 부른 말이 앞 물음의 답이었나」를 적는다. 답이 아닌 새 말에서 사슬이 끊겨 처음 말이 바뀐다
- **단추 답은 판단 모델 호출만 건너뛴다**(2차 최종 리뷰 4) — 0크레딧 판정 예약 · 정산은 한다. 운영자 멈춤 · 크레딧 확인이 걸리고, 뒤의 사진 읽기 · 역할 판단 · 끝 장 글의 원가가 이 예약(`bindAiCaller`)에 묶인다
- **단추 답의 갈래도 지금 사실로 다시 본다**(2차 최종 리뷰 1) — `fitButtonDecision` 이 판단 읽기와 같은 `availableWant` 를 지난다. 물은 뒤 고칠 이미지 · 원고가 사라져 갈래가 바뀌면 **다른 일로 새지 않고** 사실 문장으로 끝낸다(값 0). 프로젝트 만들기 바로 앞의 막이(`wants !== "image"` 면 안내 한 줄)가 한 번 더 막는다
- **결과물 번호는 표시를 안 본다**(2차 최종 리뷰 5) — 이미지 · 카드뉴스 · 지운 작업의 줄 모두 대화 차례대로 센다. 운영의 표시 없는 옛 줄도 데이터 SQL 없이 번호가 안 바뀐다. 이미지 고치기는 그 번호가 포스터 이미지 줄일 때만
- **말로 한 답의 갈래 정리**(`settleTypedAnswer`, 2차 최종 리뷰 6) — 바로 앞 물음의 갈래마다: 모양 물음 뒤에는 **무엇을 쳐도 모양을 다시 안 묻는다**(말한 비율이 없으면 정사각형) · 갈래 물음 뒤 또 `either` 면 `image`(답으로 본다) · 번호 물음 뒤 `image_edit`, 장 물음 뒤 `card_text`/`card_redo` 면 `note` 가 없어도 답(장 물음은 물을 때의 바라는 점을 `note` 로 쓴다). 프롬프트에도 물음 갈래마다 답하는 법을 한 줄씩 준다
- **사진 고르기가 열린 채 친 말**(2차 최종 리뷰 8) — 그 물음의 답으로 보낸다: 물음 줄 id + 손댄 줄의 쓰임 + `typed: true`(`photoTypedReply`). 서버는 판단 모델 없이 가고(판정 예약은 한다) 그 말을 처음 말 뒤에 잇는다. 입력창 안내 「위 사진 물음에 대한 답으로 보냅니다」는 그대로다
- **새로고침 뒤 말로 한 답의 사진 수**(2차 최종 리뷰 7) — 첨부가 비었고 물음 사슬에 사진 id 가 있으면 그 수를 판단 프롬프트의 붙인 장수로 준다. 그러면 「그 사진을 다시 붙여 주세요」 줄이 안 나간다
- **「어느 이미지?」 물음 신호:** 판단 모델이 `talk` + `note` = `ask_target`. 다 만든 이미지가 둘 이상일 때만 물음 줄(`ask:target`)이 된다
- **번호만 고르는 물음(이미지 · 카드 장)의 말 답(「2번」)은 만들기 지시에 넣지 않는다.** 카드 장 물음 뒤의 `card_text` · `card_redo` 는 `note` 에 `answer` 대신 고칠 내용을 적는다
- **D3 「같은 사진으로 하나 더」:** 첨부가 비었으면 만들지 않고 `talk` 로 「그 사진을 다시 붙여 주세요」라고 답한다(값이 나간 뒤에 사진 없는 이미지를 받지 않게)
- **D3 고치기 첨부:** 원래 작업의 **지킬 사진**(`preservedIds` · `personIds`)만 거른다. 따라 만들 사진 · 예전 고치기에 넣은 로고도 다시 붙이면 넣는다
- **D5 이미지 넘기기:** 결과 그림은 사본(`thumbPath`) 우선 · 운영은 서버가 서명한 주소(5분), 로컬은 `lib/poster/asset-bytes.ts` 의 `posterImageBytes` 로 읽은 base64(2차 최종 리뷰 e — 따로 짜지 않는다). 붙인 사진은 운영 서명 주소(조회가 준 것), 로컬은 같은 파일의 `referenceBytes`. 한 턴 4장까지
- **D5 보기가 실패하면**(2차 최종 리뷰 10) 판단의 짧은 답 대신 「지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.」(`SEE_FAILED`). 볼 것이 없었으면(없는 번호) 판단 모델의 답 그대로 — 그 답은 **혼자서도 뜻이 통하게** 쓰게 한다
- **카드 손보기 끝 문장(글 고치기 · 게시글)은 일을 마친 뒤 남는다**(2차 최종 리뷰 g) — 판단 모델에 「2번 장 글을 짧게 고쳤습니다」처럼 **끝난 일**로 쓰게 한다. 만들기 · 고치기 · 원고 머리말은 하는 중으로 쓴다
- **광고 안내 새 줄은 `guide:ad:`** 로 쓴다(옛 `ad-guide:` 는 계속 읽는다)
- **물음 응답은 옛 칸(`asked` · `kindAsk` · `photoAsk` · `needReference`)도 함께 싣는다** — 배포 사이에 열려 있던 옛 화면이 깨지지 않게. 옛 화면이 처음 말을 다시 보내도 지시에 두 번 안 붙는다
- **번호가 틀렸을 때(없음 · 지운 결과 · 카드뉴스 번호 · 못 만듦) · 만드는 중 · 고칠 것 없음의 답은 코드가 쓴 사실 문장**이다(호출 하나 더 안 든다). 설계 §2 D4 「문장은 AI 가」와 다른 **의도한 차이**다 — 설계 §3-2 · §4 에 적었다(2차 최종 리뷰 d)

---

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `apps/web/app/easy/row-marks.ts` (새) | 표시 한 벌 · `visibleBody` · `plainTyped` · `plainAiText` | 1 |
| `apps/web/app/easy/ad-ask.ts` | 안내 표시를 `row-marks.ts` 로(옛 `ad-guide:` 읽기 유지) · 단추 답 실패 짝 사이의 머리말 줄 건너뛰기 | 1 |
| `apps/web/lib/easy/failure-row.ts` | 머리말 줄은 답으로 안 친다 | 1 |
| `apps/web/app/easy/ask-chain.ts` (새) | 물음 자리(머리말 낀 실패 짝 포함) · 사슬 · 지시 조립 · 단추 답 받기 · 단추 판단 · 이번 턴 고른 값 · 지금 답할 물음 줄 · 말로 한 답 정리 | 2 |
| `apps/web/app/easy/chat.ts` (Task 2 몫) | `EasyDecision.target` · `availableWant` · `fitButtonDecision` · 판단 읽기의 `plainAiText` | 2 |
| `apps/web/app/easy/turn-words.ts` (새) | 물음 문장 · 머리말 문장(AI 글 우선, 없으면 고정) · `aiText` | 3 · 8 · 9 |
| `apps/web/lib/easy/ask-turn.ts` (새) | 사용자 줄 + 물음 줄 저장(`askTurn`), 안내 한 줄 턴(`replyTurn`) | 3 · 8 |
| `apps/web/app/api/easy/generate/route.ts` | 묻기 출구 저장 · 단추 답 · 사슬 · 이미지 목록 · 번호 고치기 · 머리말 · 보기 | 3 · 4 · 7 · 8 · 9 · 10 · 11 |
| `apps/web/app/easy/chat.ts` · `chat-facts.ts` | 물음 뒤 안내 · 사진 내림 · 이미지 목록 · 번호 · reply 규칙 · 지난 대화 창 · 카드 사실 · 보기 | 4 · 6 · 7 · 8 · 9 · 10 · 11 |
| `apps/web/lib/easy/judge.ts` | 이미지 목록 · 마지막 결과 · 카드 사실을 프롬프트로 | 7 · 8 · 10 |
| `apps/web/app/easy/ask-answers.ts` (새) | 단추 답 글 · 고른 값(화면) · 사진 고르기 중 말로 친 답(`photoTypedReply`) | 5 · 8 · 10 |
| `apps/web/app/easy/use-easy-asks.ts` (새) | 물음 줄에서 화면이 들고 있는 것(비율 토글 · 사진 고르기 · 레퍼런스) | 5 |
| `apps/web/app/easy/_components/ask-row.tsx` (새) | 물음 줄 밑 단추 · 고르기 | 5 · 8 · 10 |
| `apps/web/app/easy/easy-client.tsx` | 묻기 상태 · 렌더를 빼고 새 보내기 약속 · 첨부 비우기 · 번호 · 머리말 | 5 · 6 · 7 · 9 |
| `apps/web/app/easy/use-cardnews.ts` · `cardnews-state.ts` | 갈래 · 레퍼런스 물음 상태와 `continuingKind` 를 뺀다 | 5 |
| `apps/web/app/easy/turn-carry.ts` · `_components/cardnews-asks.tsx` | 지운다(새 약속에서 서버가 줄로 잇는다) | 5 |
| `apps/web/app/easy/__tests__/collect.test.ts` | 실패 뒤 입력창 되채우기 글자(`친말` → `보낼것`) | 5 |
| `apps/web/app/easy/_components/{kind-ask,ask-choice,photo-ask,reference-ask}.tsx` | 물음 글은 줄이 보이므로 단추 · 고르기만 | 5 |
| `apps/web/app/easy/_components/message.tsx` | 표시 뗀 글 · 물음 단추 자리 · 「이미지 N」 · 상세페이지 안내 표시 | 1 · 5 · 7 · 10 |
| `apps/web/app/easy/attachments-after.ts` (새) | 만들기에 쓴 턴인가(첨부 비우기) | 6 |
| `apps/web/lib/easy/image-edit-turn.ts` | 지킬 사진만 거르기 · 작업 대상 · 줄 단위 그림 · `;from=` · 머리말 | 6 · 8 · 9 |
| `apps/web/app/easy/row-image.ts` | `;from=` 쓰고 읽기 | 7 |
| `apps/web/app/easy/image-numbers.ts` (새) | 결과물 번호(이미지 · 카드뉴스 · 지운 것, 화면 · 서버 공용) · 이름표 | 7 |
| `apps/web/lib/easy/image-list.ts` (새) | 이 대화의 결과물 사실(갈래 · 상태 · 그림) | 7 |
| `apps/web/lib/easy/cardnews-steps.ts` | `cardnewsProjectIds`(카드뉴스 작업인가만 본다, 서명 없음) | 7 |
| `apps/web/app/easy/_components/load.ts` · `[id]/page.tsx` | 다시 열 때 결과물 이름표 | 7 |
| `apps/web/lib/easy/edit-target.ts` (새) | 고칠 번호 검증(줄 단위) · 「어느 이미지?」 물음 번호 | 8 |
| `apps/web/lib/easy/chat-provider.ts` | 틀에 `target` · `see`, 보고 답하기 틀 | 8 · 11 |
| `apps/web/lib/easy/cardnews-after-turn.ts` | 장 번호 물음 저장 · 끝 문장 reply 우선 | 4 · 10 |
| `apps/web/app/easy/detail-page.ts` | `guide:detail:` 도 상세페이지 안내 | 10 |
| `apps/web/lib/llm/structured.ts` | 이미지 입력 | 11 |
| `apps/web/app/easy/see-prompt.ts` (새) · `apps/web/lib/easy/see-turn.ts` (새) | 볼 것 고르기 · 보고 답하기 · 못 봤을 때 문장(`SEE_FAILED`). 그림 바이트는 `lib/poster/asset-bytes.ts` 를 다시 쓴다(고치지 않음) | 11 |

---
### Task 1: 표시 한 벌 — 물음 · 단추 답 · 안내 · 머리말 (설계 §3-0)

**Files:**
- Create: `apps/web/app/easy/row-marks.ts`
- Modify: `apps/web/app/easy/ad-ask.ts:1-2, 14-16, 36, 59-66, 119-131`
- Modify: `apps/web/app/easy/chat.ts:4`
- Modify: `apps/web/app/easy/_components/message.tsx:8, 175, 209`
- Modify: `apps/web/lib/easy/failure-row.ts:1, 234-239`
- Test: `apps/web/app/easy/__tests__/row-marks.test.ts` (새), `apps/web/lib/easy/__tests__/failure-row.test.ts` (더함), `apps/web/app/easy/__tests__/message-row.test.tsx` (더함), `apps/web/app/easy/__tests__/ad-ask.test.ts` (더함)

**Interfaces:**
- Consumes: 없음
- Produces (`apps/web/app/easy/row-marks.ts`):
  - `export const EASY_ASK_KINDS: readonly ["kind", "ratio", "photo", "reference", "target", "card"]`, `export type EasyAskKind`, `export type EasyGuideKind = "detail" | "ad"`
  - `export interface EasyAskRow { kind: EasyAskKind; data: Record<string, unknown>; text: string }`
  - `askBody(kind: EasyAskKind, text: string, data?: Record<string, unknown>): string`, `readAsk(message: { role; body }): EasyAskRow | undefined`
  - `withPick(text: string, pick: object): string`, `readPick(message): Record<string, unknown> | undefined`, `plainTyped(prompt: string): string`
  - `guideBody(kind: EasyGuideKind, text: string): string`, `readGuide(message): { kind: EasyGuideKind; text: string } | undefined`
  - `sayBody(text: string): string`, `isSayBody(body: string): boolean`, `visibleBody(message: { role; body }): string`
  - `plainAiText(text: string): string` — AI 가 쓴 글이 표시 머리(`ask:` · `guide:` · `say:` · `ad-guide:` · `edit-request:`)로 시작하면 첫 쌍점을 전각 「：」으로 바꿔 표시로 안 읽히게 한다(2차 최종 리뷰 c). Task 2 의 판단 읽기 · Task 11 의 보고 답하기가 쓴다
- `ad-ask.ts` 는 `visibleBody` 를 다시 내보낸다(옛 import 그대로 돈다). `adGuideBody(text)` 는 이제 `guide:ad:` 를 쓴다. 광고 물음 자리(`물음자리`)는 단추 답 실패 짝 사이의 머리말 줄을 건너뛴다(2차 최종 리뷰 2)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/row-marks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  askBody, guideBody, isSayBody, plainAiText, plainTyped, readAsk, readGuide, readPick, sayBody, visibleBody, withPick,
} from "../row-marks";
import { adGuideBody, isAdGuide, isAdQuestion } from "../ad-ask";
import { editAddedOf, editRequestOf, editRowBody, rowJobOf, withRowJob } from "../row-image";

/**
 * **줄 글의 표시 한 벌**(2026-10-07 2차 설계 §3-0). 표를 바꾸지 않고 물음 · 단추 답 · 안내 ·
 * 머리말을 알아본다. 그림 줄의 표시(`edit-request:` · `;added=` · `;job=`)와 섞이면 안 된다.
 */
const 도우미 = (body: string) => ({ role: "assistant" as const, body });
const 사용자 = (body: string) => ({ role: "user" as const, body });

describe("물음 줄 (2차 D1)", () => {
  it("갈래 · 자료 · 보일 문장을 쓰고 그대로 읽는다", () => {
    const body = askBody("photo", "사진을 어떻게 쓸지 알려 주세요.", { wants: "image", ids: ["a", "b"] });
    expect(readAsk(도우미(body))).toEqual({
      kind: "photo", data: { wants: "image", ids: ["a", "b"] }, text: "사진을 어떻게 쓸지 알려 주세요.",
    });
    expect(visibleBody(도우미(body))).toBe("사진을 어떻게 쓸지 알려 주세요.");
  });

  it("자료가 없으면 머리만 붙인다", () => {
    expect(askBody("ratio", "어떤 모양으로 만들까요?")).toBe("ask:ratio:\n어떤 모양으로 만들까요?");
    expect(readAsk(도우미("ask:ratio:\n어떤 모양으로 만들까요?"))).toEqual({ kind: "ratio", data: {}, text: "어떤 모양으로 만들까요?" });
  });

  /** Review Focus 3 — 자료에 쌍반점 · 쉼표 · 줄바꿈 · 표시 글자가 있어도 섞이지 않는다. */
  it("자료와 문장에 표시 글자 · 줄바꿈이 섞여도 그대로 읽는다", () => {
    const data = { note: "a;pick=b,c\nd;data=e", ids: ["x;y"] };
    const body = askBody("card", "몇 번 장인가요?\n예: 3번", data);
    expect(readAsk(도우미(body))).toEqual({ kind: "card", data, text: "몇 번 장인가요?\n예: 3번" });
  });

  it("사용자 줄 · 모르는 갈래 · 줄바꿈 없는 줄은 물음이 아니고, 깨진 자료는 비운다", () => {
    expect(readAsk(사용자("ask:ratio:\n어떤 모양?"))).toBeUndefined();
    expect(readAsk(도우미("ask:color:\n무슨 색?"))).toBeUndefined();
    expect(readAsk(도우미("ask:ratio:"))).toBeUndefined();
    expect(readAsk(도우미("ask:ratio:;data=%7B깨짐\n어떤 모양?"))).toEqual({ kind: "ratio", data: {}, text: "어떤 모양?" });
  });
});

describe("단추 답 (2차 D1)", () => {
  it("보일 글 끝에 고른 값을 붙이고, 보일 때는 뗀다", () => {
    const body = withPick("이미지 한 장", { kind: "image" });
    expect(readPick(사용자(body))).toEqual({ kind: "image" });
    expect(visibleBody(사용자(body))).toBe("이미지 한 장");
  });

  it("도우미 줄 · 표시 없는 사용자 줄에는 고른 값이 없다", () => {
    expect(readPick(도우미(withPick("x", { kind: "image" })))).toBeUndefined();
    expect(readPick(사용자("그냥 말"))).toBeUndefined();
  });

  /** Review Focus 3 — 사용자가 친 말에 표시 글자가 있어도 단추 답으로 읽히지 않는다. */
  it("친 말에 섞인 표시 글자는 풀어 둔다", () => {
    const typed = plainTyped("이건 ;pick=%7B%22kind%22%3A%22image%22%7D 장난");
    expect(readPick(사용자(typed))).toBeUndefined();
    expect(visibleBody(사용자(typed))).toBe(typed);
    expect(plainTyped("보통 말")).toBe("보통 말");
  });
});

describe("안내 줄 · 머리말 줄 (2차 §3-0)", () => {
  it("안내 줄은 갈래와 글을 읽고, 옛 ad-guide: 도 광고 안내로 읽는다", () => {
    expect(readGuide(도우미(guideBody("detail", "상세페이지는…")))).toEqual({ kind: "detail", text: "상세페이지는…" });
    expect(readGuide(도우미("ad-guide:옛 안내"))).toEqual({ kind: "ad", text: "옛 안내" });
    expect(visibleBody(도우미("ad-guide:옛 안내"))).toBe("옛 안내");
    expect(readGuide(사용자(guideBody("ad", "x")))).toBeUndefined();
  });

  it("광고 안내 줄은 이제 guide:ad: 로 쓰고 옛 줄도 알아본다", () => {
    expect(adGuideBody("안내")).toBe("guide:ad:안내");
    expect(isAdGuide(도우미("ad-guide:안내"))).toBe(true);
    expect(isAdGuide(도우미(adGuideBody("안내")))).toBe(true);
  });

  it("머리말 줄은 표시를 떼고 보인다", () => {
    expect(isSayBody(sayBody("만들겠습니다."))).toBe(true);
    expect(visibleBody(도우미(sayBody("만들겠습니다.")))).toBe("만들겠습니다.");
  });

  /** Review Focus 6 — 표시 없는 옛 줄은 그대로 보인다. 그림 줄의 표시는 이 파일이 안 건드린다. */
  it("표시 없는 옛 줄 · 그림 줄은 손대지 않는다", () => {
    expect(visibleBody(도우미("어떤 결로 할까요?"))).toBe("어떤 결로 할까요?");
    const 그림 = withRowJob(editRowBody("r2", ["logo-1"]), { requestRowId: "r2", falRequestId: "f", endpoint: "e" });
    expect(visibleBody({ role: "image", body: 그림 })).toBe(그림);
    expect(editRequestOf(그림)).toBe("r2");
    expect(editAddedOf(그림)).toEqual(["logo-1"]);
    expect(rowJobOf(그림)).toEqual({ requestRowId: "r2", falRequestId: "f", endpoint: "e" });
  });
});

/**
 * 2차 최종 리뷰 c — AI 가 쓴 글(말 답 · 끝 문장 · 보고 다시 쓴 답)이 표시 머리로 시작하면 저장한 줄이
 * 물음 · 머리말 · 안내로 읽힌다(머리말로 읽히면 실패 줄 규칙까지 틀어진다). 첫 쌍점만 전각으로 바꾼다.
 */
describe("AI 가 쓴 글의 표시 머리를 푼다", () => {
  it("표시 머리로 시작하면 표시로 안 읽히고, 보일 글은 거의 그대로다", () => {
    for (const text of ["ask:ratio:\n어떤 모양?", "say:만들겠습니다.", "guide:detail:상세", "ad-guide:광고", "edit-request:r1"]) {
      const plain = plainAiText(text);
      expect(readAsk(도우미(plain))).toBeUndefined();
      expect(readGuide(도우미(plain))).toBeUndefined();
      expect(isSayBody(plain)).toBe(false);
      expect(isAdGuide(도우미(plain))).toBe(false);
      expect(plain.startsWith("edit-request:")).toBe(false);
      expect(visibleBody(도우미(plain))).toBe(plain);
    }
    expect(plainAiText("say:만들겠습니다.")).toBe("say：만들겠습니다.");
  });

  it("보통 글 · 가운데 낀 표시 글자는 그대로 둔다", () => {
    expect(plainAiText("포스터를 만들겠습니다.")).toBe("포스터를 만들겠습니다.");
    expect(plainAiText("이렇게 say: 라고 쓰면")).toBe("이렇게 say: 라고 쓰면");
    expect(isAdQuestion(도우미(plainAiText("안녕하세요")))).toBe(false);
  });
});
```

`apps/web/app/easy/__tests__/ad-ask.test.ts` — 1~6줄 import 아래에 `import { sayBody } from "../row-marks";` 를 더하고, 「단추로 답했다가 실패한 뒤」 묶음의 「실패 줄이 아닌 답 뒤면 건너뛰지 않는다」 `it` **뒤**(묶음 안)에 넣는다:

```ts
  /**
   * 2차 최종 리뷰 2 — 2차부터 일하는 턴은 사용자 줄 → 머리말 줄(`say:`) → 그림 줄이다. 단추로 답한 턴이
   * 머리말 뒤에 실패하면 [물음, 단추 글, 머리말, 실패] 가 된다. 머리말은 답이 아니므로 건너뛴다.
   */
  it("단추 답 실패 짝 사이에 머리말 줄이 끼어도 건너뛴다", () => {
    const 머리말뒤실패 = [
      ...물은뒤, 줄("user", AD_CHOICE_IMAGE), 줄("assistant", sayBody("광고 이미지를 만들겠습니다.")),
      줄("assistant", failureRowBody(FAILED_TURN_GENERIC)),
    ];
    expect(adQuestionOrigin(머리말뒤실패)).toBe("겨울 화장품 광고 소재 만들어줘");
    expect(easyAdStep(AD_CHOICE_IMAGE, 머리말뒤실패)).toBe("image");
  });

  it("머리말 줄만 있고 실패 줄이 없으면(만들기가 이어진 턴) 건너뛰지 않는다", () => {
    expect(adQuestionOrigin([...물은뒤, 줄("user", AD_CHOICE_IMAGE), 줄("assistant", sayBody("만들겠습니다."))])).toBeUndefined();
  });
```

`apps/web/lib/easy/__tests__/failure-row.test.ts` — 맨 위 import 에 한 줄 더한다:

```ts
import { sayBody } from "../../../app/easy/row-marks";
```

`describe("실패 안내 줄 (B4)", …)` 묶음의 「두 번 불러도 한 번만 남긴다」 `it` **앞**에 넣는다:

```ts
  /** 2차 D4 · Review Focus 2 — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄. 머리말 뒤 실패도 남긴다. */
  it("머리말 줄은 답으로 치지 않는다 — 그 뒤 실패해도 실패 안내를 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: sayBody("포스터를 만들겠습니다.") });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody("x"));
  });

  it("머리말이 아닌 도우미 줄은 답이다 — 예전 그대로 실패 안내를 안 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "안녕" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: "안녕하세요" });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄).toHaveLength(2);
  });
```

`apps/web/app/easy/__tests__/message-row.test.tsx` — 11줄 import 아래에 한 줄 더한다:

```ts
import { askBody, sayBody, withPick } from "../row-marks";
```

파일 끝에 더한다:

```tsx
describe("표시를 뗀 글 (2차 §3-0)", () => {
  it("단추 답 줄은 고른 값 표시 없이 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "u", role: "user", body: withPick("이미지 한 장", { kind: "image" }) }} />); });
    expect(글()).toContain("이미지 한 장");
    expect(글()).not.toContain(";pick=");
  });

  it("머리말 줄 · 물음 줄은 표시 없이 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "s", role: "assistant", body: sayBody("만들겠습니다.") }} />); });
    expect(글()).toContain("만들겠습니다.");
    expect(글()).not.toContain("say:");
    act(() => { view.update(<EasyMessageRow message={{ id: "q", role: "assistant", body: askBody("ratio", "어떤 모양으로 만들까요?") }} />); });
    expect(글()).toContain("어떤 모양으로 만들까요?");
    expect(글()).not.toContain("ask:");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/row-marks.test.ts lib/easy/__tests__/failure-row.test.ts app/easy/__tests__/message-row.test.tsx app/easy/__tests__/ad-ask.test.ts`
Expected: FAIL — `Failed to resolve import "../row-marks"`

- [ ] **Step 3: `row-marks.ts` 를 만든다**

`apps/web/app/easy/row-marks.ts`:

```ts
import type { EasyMessage } from "./turn";

/**
 * **줄 글의 표시 한 벌**(2026-10-07 2차 설계 §3-0).
 *
 * 대화 표(`easy_messages`)는 바꾸지 않는다. 물음 · 단추 답 · 안내 · 머리말은 줄 글(body)에 붙인
 * 표시로 알아본다 — 1차의 `ad-guide:` · `;job=` 와 같은 방식이다.
 *
 *   물음 줄(도우미)   `ask:<kind>:` [+ `;data=<JSON>`] + 줄바꿈 + 보일 문장
 *   단추 답(사용자)   보일 글 + `;pick=<JSON>`
 *   안내 줄(도우미)   `guide:<kind>:` + 보일 글. 옛 `ad-guide:` 도 광고 안내로 읽는다
 *   머리말(도우미)    `say:` + 보일 글. 일하는 턴의 AI 말이다 — 실패 줄 규칙에서 답으로 안 친다
 *
 * JSON 은 `encodeURIComponent` 로 감싼다. 그러면 `;` · `,` · 줄바꿈이 표시 글자와 안 섞인다.
 * 화면 · 모델에 보낼 글은 `visibleBody` 한 곳에서 표시를 뗀다. 그림 줄의 표시
 * (`edit-request:` · `;added=` · `;from=` · `;job=`)는 `row-image.ts` 가 읽고, 여기서는 안 건드린다.
 */
type Row = Pick<EasyMessage, "role" | "body">;

export const EASY_ASK_KINDS = ["kind", "ratio", "photo", "reference", "target", "card"] as const;
export type EasyAskKind = (typeof EASY_ASK_KINDS)[number];
export type EasyGuideKind = "detail" | "ad";

export interface EasyAskRow {
  kind: EasyAskKind;
  /** 물을 때의 판단(갈래 · 말한 비율 · 사진 id 등). 서버가 쓴 값이다. */
  data: Record<string, unknown>;
  /** 보일 문장. */
  text: string;
}

const 물음머리 = "ask:";
const 자료머리 = ";data=";
const 고른머리 = ";pick=";
const 안내머리 = "guide:";
const 옛광고안내머리 = "ad-guide:";
const 머리말머리 = "say:";
const 안내갈래: readonly EasyGuideKind[] = ["detail", "ad"];

function 감싼다(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

/** 깨졌으면 비운다 — 표시 하나 때문에 줄이 안 보이면 안 된다. */
function 객체로푼다(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(text));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function askBody(kind: EasyAskKind, text: string, data: Record<string, unknown> = {}): string {
  const 자료 = Object.keys(data).length ? `${자료머리}${감싼다(data)}` : "";
  return `${물음머리}${kind}:${자료}\n${text}`;
}

export function readAsk(message: Row): EasyAskRow | undefined {
  if (message.role !== "assistant" || !message.body.startsWith(물음머리)) return undefined;
  const 줄끝 = message.body.indexOf("\n");
  if (줄끝 < 0) return undefined;
  const 머리 = message.body.slice(물음머리.length, 줄끝);
  const 칸 = 머리.indexOf(":");
  const kind = 칸 < 0 ? "" : 머리.slice(0, 칸);
  if (!(EASY_ASK_KINDS as readonly string[]).includes(kind)) return undefined;
  const 나머지 = 머리.slice(칸 + 1);
  const data = 나머지.startsWith(자료머리) ? 객체로푼다(나머지.slice(자료머리.length)) ?? {} : {};
  return { kind: kind as EasyAskKind, data, text: message.body.slice(줄끝 + 1) };
}

/** 단추로 한 답. 보일 글 끝에 고른 값을 붙인다 — 다음 물음이 이 값을 잇는다(`ask-chain.ts`). */
export function withPick(text: string, pick: object): string {
  return `${text}${고른머리}${감싼다(pick)}`;
}

export function readPick(message: Row): Record<string, unknown> | undefined {
  if (message.role !== "user") return undefined;
  const at = message.body.lastIndexOf(고른머리);
  return at < 0 ? undefined : 객체로푼다(message.body.slice(at + 고른머리.length));
}

/**
 * 사용자가 **친** 말에 표시 글자가 섞여 있으면 풀어 둔다. 안 그러면 「…;pick=…」을 친 말이
 * 단추 답으로 읽힌다(Review Focus 3). 서버가 받은 말에 한 번 건다.
 */
export function plainTyped(prompt: string): string {
  return prompt.split(고른머리).join("; pick=");
}

/** 도우미 줄 글의 맨 앞에서 표시로 읽히는 머리. `edit-request:` 는 그림 줄 표시지만 함께 막는다. */
const 표시머리들 = [물음머리, 안내머리, 머리말머리, 옛광고안내머리, "edit-request:"];

/**
 * **AI 가 쓴 글의 표시 머리를 푼다**(2차 최종 리뷰 c). 말 답 · 끝 문장 · 보고 다시 쓴 답은 표시 없이
 * 도우미 줄로 남는다 — 모델이 「say:…」 · 「ask:ratio:…」로 시작하는 글을 쓰면 그 줄이 머리말 · 물음으로
 * 읽힌다. 첫 쌍점만 전각 「：」으로 바꾼다(읽는 사람에게는 거의 같다). 사용자 말의 `plainTyped` 와 짝이다.
 */
export function plainAiText(text: string): string {
  const 머리 = 표시머리들.find((one) => text.startsWith(one));
  return 머리 ? `${머리.slice(0, -1)}：${text.slice(머리.length)}` : text;
}

export function guideBody(kind: EasyGuideKind, text: string): string {
  return `${안내머리}${kind}:${text}`;
}

export function readGuide(message: Row): { kind: EasyGuideKind; text: string } | undefined {
  if (message.role !== "assistant") return undefined;
  if (message.body.startsWith(옛광고안내머리)) return { kind: "ad", text: message.body.slice(옛광고안내머리.length) };
  const kind = 안내갈래.find((one) => message.body.startsWith(`${안내머리}${one}:`));
  return kind ? { kind, text: message.body.slice(`${안내머리}${kind}:`.length) } : undefined;
}

export function sayBody(text: string): string {
  return `${머리말머리}${text}`;
}

export function isSayBody(body: string): boolean {
  return body.startsWith(머리말머리);
}

/** 보일 글(화면 · 모델 모두). 표시를 뗀다. 그림 줄은 그대로 둔다. */
export function visibleBody(message: Row): string {
  if (message.role === "user") {
    const at = message.body.lastIndexOf(고른머리);
    return at < 0 ? message.body : message.body.slice(0, at);
  }
  if (message.role !== "assistant") return message.body;
  const ask = readAsk(message);
  if (ask) return ask.text;
  const guide = readGuide(message);
  if (guide) return guide.text;
  return isSayBody(message.body) ? message.body.slice(머리말머리.length) : message.body;
}
```

- [ ] **Step 4: `ad-ask.ts` 의 안내 표시를 `row-marks.ts` 로 옮긴다**

(a) 1~2줄 import 아래에 더한다:

```ts
import { guideBody, isSayBody, readGuide } from "./row-marks";
```

(b) 머리 주석의 아래 두 줄을 찾아:

```ts
 * **물음 줄 · 안내 줄은 대화에 남는다.** 물음 줄은 글이 `AD_QUESTION` 과 똑같은 도우미 줄,
 * 안내 줄은 글이 `ad-guide:` 로 시작하는 도우미 줄이다. 표에 칸을 더하지 않는다 —
```

이렇게 바꾼다:

```ts
 * **물음 줄 · 안내 줄은 대화에 남는다.** 물음 줄은 글이 `AD_QUESTION` 과 똑같은 도우미 줄,
 * 안내 줄은 글이 `guide:ad:`(옛 줄은 `ad-guide:`)로 시작하는 도우미 줄이다(`row-marks.ts`). 표에 칸을 더하지 않는다 —
```

(c) 36줄 `const 안내머리 = "ad-guide:";` 를 지운다.

(d) 119~131줄(`/** 안내 줄에 남길 글.` 부터 파일 끝까지)을 아래로 바꾼다:

```ts
/** 안내 줄에 남길 글. 화면이 이 표시를 보고 「광고소재 열기」를 단다(2차 §3-0 — `guide:ad:`). */
export function adGuideBody(text: string): string {
  return guideBody("ad", text);
}

/** 광고 안내 줄인가. 옛 `ad-guide:` 줄도 맞다. */
export function isAdGuide(message: Row): boolean {
  return readGuide(message)?.kind === "ad";
}

// 보일 글은 표시 한 벌이 뗀다(2차 §3-0). 옛 import 가 그대로 돌게 여기서도 내보낸다.
export { visibleBody } from "./row-marks";
```

(e) 59~66줄 `물음자리` 를 바꾼다 — 단추 답 실패 짝 사이에 머리말 줄이 끼어도 건너뛴다(2차 최종 리뷰 2. 2차부터 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄이라, 머리말 뒤에 실패하면 [물음, 단추 글, 머리말, 실패] 가 된다):

```ts
function 물음자리(rows: readonly Row[]): number {
  const n = rows.length;
  const 실패 = rows[n - 1];
  if (!(실패?.role === "assistant" && isFailureRowBody(실패.body))) return n - 1;
  // 단추 답 → (머리말) → 실패. 머리말 줄은 일하는 턴의 AI 말이다 — 답이 아니다(2차 D4).
  const 머리말 = rows[n - 2]?.role === "assistant" && isSayBody(rows[n - 2]!.body);
  const 답자리 = 머리말 ? n - 3 : n - 2;
  const 답 = rows[답자리];
  const 단추답실패 = 답자리 >= 1 && 답?.role === "user" && (답.body === AD_CHOICE_IMAGE || 답.body === AD_CHOICE_SPECS);
  return 단추답실패 ? 답자리 - 1 : n - 1;
}
```

머리 주석(52~58줄)의 「**단추로 답했다가 실패한 턴**(사용자 단추 글 줄 + 실패 안내 줄, 설계 B4)이 뒤에 붙었으면 그 둘을 건너뛴다」를 「**단추로 답했다가 실패한 턴**(사용자 단추 글 줄 + (2차의 머리말 줄) + 실패 안내 줄, 설계 B4)이 뒤에 붙었으면 그 줄들을 건너뛴다」로 바꾼다.

- [ ] **Step 5: `chat.ts` · `message.tsx` · `failure-row.ts` 가 새 표시를 쓴다**

(a) `apps/web/app/easy/chat.ts` 4줄 `import { adQuestionOrigin, visibleBody } from "./ad-ask";` 를 두 줄로 바꾼다:

```ts
import { adQuestionOrigin } from "./ad-ask";
import { visibleBody } from "./row-marks";
```

(b) `apps/web/app/easy/_components/message.tsx` 8줄 `import { isAdGuide, isAdQuestion, visibleBody } from "../ad-ask";` 를 바꾼다:

```ts
import { isAdGuide, isAdQuestion } from "../ad-ask";
import { visibleBody } from "../row-marks";
```

사용자 줄(174~176줄)의 아래를:

```tsx
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-base leading-7">
          {message.body}
        </p>
```

이렇게 바꾼다(단추 답 줄의 `;pick=` 을 뗀다):

```tsx
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-base leading-7">
          {visibleBody(message)}
        </p>
```

도우미 줄 마지막 갈래(209줄) `<p className={cn("max-w-[85%]", 말풍선)}>{message.body}</p>` 를 `<p className={cn("max-w-[85%]", 말풍선)}>{visibleBody(message)}</p>` 로 바꾼다(머리말 · 물음 줄의 표시를 뗀다).

(c) `apps/web/lib/easy/failure-row.ts` 1줄 `import type { EasyStore } from "./store";` 아래에 더한다:

```ts
import { isSayBody } from "../../app/easy/row-marks";
```

아래를 찾아:

```ts
  const appendMessage: Append = async (input) => {
    const row = await store.appendMessage(input);
    답없는말 = input.role === "user";
    return row;
  };
```

이렇게 바꾼다:

```ts
  const appendMessage: Append = async (input) => {
    const row = await store.appendMessage(input);
    /*
     * **머리말 줄은 답이 아니다**(2026-10-07 2차 D4 · §3-4). 일하는 턴은 사용자 줄 → 머리말 줄 →
     * 그림 줄 차례다. 머리말 뒤에 기획 · 생성이 실패해도 실패 줄이 남아야 한다.
     */
    답없는말 = input.role === "user" || (답없는말 && input.role === "assistant" && isSayBody(input.body ?? ""));
    return row;
  };
```

- [ ] **Step 6: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/row-marks.test.ts lib/easy/__tests__/failure-row.test.ts app/easy/__tests__/message-row.test.tsx app/easy/__tests__/ad-ask.test.ts app/easy/__tests__/chat.test.ts app/api/easy/__tests__/generate-ad.test.ts`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/easy/row-marks.ts apps/web/app/easy/ad-ask.ts apps/web/app/easy/chat.ts apps/web/app/easy/_components/message.tsx apps/web/lib/easy/failure-row.ts apps/web/app/easy/__tests__/row-marks.test.ts apps/web/lib/easy/__tests__/failure-row.test.ts apps/web/app/easy/__tests__/message-row.test.tsx apps/web/app/easy/__tests__/ad-ask.test.ts
git commit -m "feat(easy): 물음 · 단추 답 · 안내 · 머리말 표시를 한 벌로 읽고 쓴다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 물음 사슬 — 처음 말 · 답 · 고른 값 · 사진 (D1 `askChain`)

**Files:**
- Create: `apps/web/app/easy/ask-chain.ts`
- Modify: `apps/web/app/easy/chat.ts:1-5, 48-53, 302-337` (`EasyDecision` 에 `target`, 판단 읽기의 갈래 바꿔 읽기를 `availableWant` 로 빼고 단추 답도 같은 함수를 지나게, AI 글의 표시 머리 풀기)
- Test: `apps/web/app/easy/__tests__/ask-chain.test.ts` (새), `apps/web/app/easy/__tests__/chat-image-edit.test.ts` (더함)

**Interfaces:**
- Consumes: Task 1 — `readAsk`, `readPick`, `visibleBody`, `EasyAskKind`, `askBody`, `withPick`, `isSayBody`, `plainAiText`
- Produces (`apps/web/app/easy/ask-chain.ts`):
  - `export const ASK_ANSWER_NOTE` (= `AD_ANSWER_NOTE` = `"answer"`)
  - `export interface EasyPick { kind?: "image" | "cardnews"; ratio?: string; look?: string; photoRoles?: Array<{ id: string; role: string }>; photoSlots?: Array<{ id: string; role: string }>; target?: number; card?: number; typed?: true }` — `typed` 는 「사진 고르기가 열린 채 말로 친 답」(2차 최종 리뷰 8): 그 줄의 글을 말 답으로 잇는다
  - `export interface EasyChainAsk { id: string; kind: EasyAskKind | "ad"; data: Record<string, unknown>; text: string }`
  - `export interface EasyAskChain { ask: EasyChainAsk; origin: string; answers: string[]; picks: EasyPick; photoIds: string[] }`
  - `export type EasyAnswerWay = "button" | "typed" | "none"`
  - `export interface EasyButtonAnswer { chain: EasyAskChain; pick: EasyPick }`
  - `export interface EasyChosen { kind?: "image" | "cardnews"; kindPicked: boolean; ratio?: string; look?: string; photoRoles?: unknown; photoSlots?: unknown }`
  - `export interface EasyTypedAnswer { decision: EasyDecision; answered: boolean; askRatio: boolean }`
  - `askAnchor(rows): number`, `askChain(rows): EasyAskChain | undefined`, `answerableAskId(rows): string | undefined`, `readEasyPick(raw: unknown): EasyPick`, `askInstruction(chain: EasyAskChain | undefined, prompt: string, way: EasyAnswerWay): string`, `readButtonAnswer(input: { answersRowId?: unknown; pick?: unknown }, rows): EasyButtonAnswer | undefined`, `buttonDecision(answer: EasyButtonAnswer): EasyDecision | undefined`, `chosenFor(input: Record<string, unknown>, chain: EasyAskChain | undefined, button: EasyPick | undefined): EasyChosen`, `settleTypedAnswer(ask: EasyChainAsk | undefined, decision: EasyDecision): EasyTypedAnswer`
  - rows 는 `ReadonlyArray<{ id: string; role: EasyMessage["role"]; body: string }>`
- `chat.ts`: `EasyDecision` 에 `target?: number`; `export interface EasyAvailability { canRevise?: boolean; made?: boolean; editableImage?: boolean }`; `availableWant(said: EasyWant, reply: string, options: EasyAvailability): { wants: EasyWant; reply: string }`(판단 읽기와 단추 답이 함께 쓴다 — 다른 일하는 갈래로 바꿔 읽으면 `reply` 를 비운다); `fitButtonDecision(decision: EasyDecision, options: EasyAvailability): EasyDecision`(바뀌면 `talk` + 사실 문장); `CANNOT_DO_NOW`(사실 문장, Task 4 의 막이도 쓴다). `readEasyDecision` 은 `reply` 에 `plainAiText` 를 건다

물음 줄 자료의 약속(Task 3 이 쓴다): `cont: true` = 이 물음을 부른 사용자 말이 **앞 물음의 답**이었다(사슬이 이어진다). `ids` = 그때 붙어 있던 사진 id. `wants` · `ratio` · `look` · `reason` · `mode` · `rows` · `numbers` · `count` · `note` = 그때의 판단.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/ask-chain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ASK_ANSWER_NOTE, answerableAskId, askAnchor, askChain, askInstruction, buttonDecision, chosenFor, readButtonAnswer,
  readEasyPick, settleTypedAnswer,
} from "../ask-chain";
import { askBody, sayBody, withPick } from "../row-marks";
import { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_QUESTION } from "../ad-ask";
import { CANNOT_DO_NOW, NOTHING_TO_EDIT, fitButtonDecision } from "../chat";
import { NOT_MADE_YET } from "../cardnews-after";
import { failureRowBody } from "../../../lib/easy/failure-row";

/**
 * **물음 사슬**(2026-10-07 2차 설계 D1 · §3-1). 화면은 처음 말을 다시 보내지 않는다. 서버가 대화
 * 줄을 거슬러 처음 말 · 말로 한 답 · 단추로 고른 값 · 사진을 모은다.
 */
type R = { id: string; role: "user" | "assistant" | "image"; body: string };
const 말 = (id: string, body: string): R => ({ id, role: "user", body });
const 도우미 = (id: string, body: string): R => ({ id, role: "assistant", body });
const 물음 = (id: string, kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}) =>
  도우미(id, askBody(kind, `${kind} 물음?`, data));

describe("마지막 물음 자리", () => {
  it("마지막 줄이 물음이면 그 자리, 아니면 -1", () => {
    expect(askAnchor([말("u1", "바다"), 물음("q1", "ratio")])).toBe(1);
    expect(askAnchor([말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "고양이"), 도우미("a", "네")])).toBe(-1);
    expect(askAnchor([])).toBe(-1);
  });

  it("단추로 답했다가 실패한 짝은 건너뛴다 — 말로 한 답의 실패는 안 건너뛴다", () => {
    const 단추실패 = [말("u1", "바다"), 물음("q1", "ratio"), 말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("f", failureRowBody("x"))];
    expect(askAnchor(단추실패)).toBe(1);
    const 말실패 = [말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "세로로"), 도우미("f", failureRowBody("x"))];
    expect(askAnchor(말실패)).toBe(-1);
  });

  /** 2차 최종 리뷰 2 · Review Focus 1 — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄이다. 머리말 뒤 실패도 짝이다. */
  it("머리말 줄이 끼어든 단추 답 실패 짝도 건너뛴다 — 머리말만 있고 실패가 없으면 안 건너뛴다", () => {
    const 머리말실패 = [
      말("u1", "바다"), 물음("q1", "ratio"), 말("u2", withPick("이대로 만들기", { ratio: "1:1" })),
      도우미("s", sayBody("바다 이미지를 만들겠습니다.")), 도우미("f", failureRowBody("x")),
    ];
    expect(askAnchor(머리말실패)).toBe(1);
    expect(askAnchor(머리말실패.slice(0, 4))).toBe(-1);
  });
});

describe("지금 답할 수 있는 물음 줄 (화면의 단추 자리, Review Focus 1)", () => {
  const 앞 = [말("u1", "바다"), 물음("q1", "ratio")];

  it("마지막 줄이 물음이면 그 줄", () => {
    expect(answerableAskId(앞)).toBe("q1");
    expect(answerableAskId([말("u1", "광고 소재"), 도우미("q1", AD_QUESTION)])).toBe("q1");
  });

  it("다시 열었을 때 [물음, 단추 답, (머리말), 실패] 면 그 물음 줄", () => {
    const 단추 = 말("u2", withPick("이대로 만들기", { ratio: "1:1" }));
    expect(answerableAskId([...앞, 단추, 도우미("f", failureRowBody("x"))])).toBe("q1");
    expect(answerableAskId([...앞, 단추, 도우미("s", sayBody("만들겠습니다.")), 도우미("f", failureRowBody("x"))])).toBe("q1");
  });

  /** 화면은 실패 줄을 다시 열 때 받는다. 그 자리에서 실패하면 [물음, 단추 답] 으로 끝나 있다 — 서버에는 실패 줄이 있다. */
  it("그 자리에서 단추 답이 실패해 [물음, 단추 답] 으로 끝났어도 그 물음 줄 — 광고 단추 글도 같다", () => {
    expect(answerableAskId([...앞, 말("u2", withPick("이대로 만들기", { ratio: "1:1" }))])).toBe("q1");
    expect(answerableAskId([말("u1", "광고 소재"), 도우미("q1", AD_QUESTION), 말("u2", AD_CHOICE_IMAGE)])).toBe("q1");
  });

  it("말로 한 답 뒤 · 만들기가 이어진 뒤 · 물음이 없으면 없다", () => {
    expect(answerableAskId([...앞, 말("u2", "세로로")])).toBeUndefined();
    expect(answerableAskId([...앞, 말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("s", sayBody("만들겠습니다.")), { id: "i1", role: "image", body: "" }])).toBeUndefined();
    expect(answerableAskId([말("u1", "안녕"), 도우미("a", "안녕하세요")])).toBeUndefined();
  });
});

describe("물음 사슬 (askChain)", () => {
  it("처음 말 · 물음 · 사진 id 를 모은다", () => {
    expect(askChain([말("u1", "신메뉴 홍보물 만들어줘"), 물음("q1", "kind", { ids: ["p1"] })])).toMatchObject({
      ask: { id: "q1", kind: "kind" }, origin: "신메뉴 홍보물 만들어줘", answers: [], picks: {}, photoIds: ["p1"],
    });
  });

  it("이어진 물음(cont)이면 거슬러 가며 말 답과 단추 값을 모은다", () => {
    const rows = [
      말("u1", "신메뉴 홍보물 만들어줘"), 물음("q1", "kind", { ids: ["p1"] }),
      말("u2", withPick("이미지 한 장", { kind: "image" })), 물음("q2", "ratio", { cont: true, wants: "image" }),
      말("u3", "세로로 해줘"), 물음("q3", "photo", { cont: true, ids: [] }),
    ];
    expect(askChain(rows)).toMatchObject({
      ask: { id: "q3", kind: "photo" }, origin: "신메뉴 홍보물 만들어줘", answers: ["세로로 해줘"],
      picks: { kind: "image" }, photoIds: ["p1"],
    });
  });

  it("뒤에 고른 단추 값이 앞의 것을 덮는다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이걸로", { ratio: "4:5" })), 물음("q2", "photo", { cont: true }),
      말("u3", withPick("이걸로", { ratio: "9:16" })), 물음("q3", "kind", { cont: true }),
    ];
    expect(askChain(rows)?.picks).toEqual({ ratio: "9:16" });
  });

  it("이어지지 않은 물음(cont 없음)이면 바로 앞 말이 처음 말이다 — 앞 물음의 값을 안 잇는다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "kind", { ids: ["p1"] }),
      말("u2", "아니 고양이 포스터 만들어줘"), 물음("q2", "ratio", { wants: "image" }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "아니 고양이 포스터 만들어줘", answers: [], picks: {}, photoIds: [] });
  });

  it("광고 물음(본문 완전일치)도 사슬의 물음이다 — 광고 단추 글은 말 답으로 안 친다", () => {
    const rows = [
      말("u1", "겨울 화장품 광고 소재 만들어줘"), 도우미("q1", AD_QUESTION),
      말("u2", AD_CHOICE_IMAGE), 물음("q2", "ratio", { cont: true, wants: "image" }),
    ];
    expect(askChain(rows)).toMatchObject({ ask: { id: "q2" }, origin: "겨울 화장품 광고 소재 만들어줘", answers: [] });
  });

  it("단추 답 실패 짝이 사슬 가운데 있어도 건너뛴다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("f", failureRowBody("x")),
      말("u3", "세로로"), 물음("q2", "photo", { cont: true }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "바다", answers: ["세로로"] });
  });

  it("머리말 줄이 낀 단추 답 실패 짝이 사슬 가운데 있어도 건너뛴다 (2차 최종 리뷰 2)", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("s", sayBody("만들겠습니다.")), 도우미("f", failureRowBody("x")),
      말("u3", "세로로"), 물음("q2", "photo", { cont: true }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "바다", answers: ["세로로"] });
  });

  /** 2차 최종 리뷰 8 — 사진 고르기가 열린 채 친 말은 고른 값과 함께 오지만 그 말도 답이다. */
  it("말로 친 사진 답(typed)은 고른 값을 잇고 그 말도 말 답으로 잇는다 — typed 표시는 고른 값에 안 남긴다", () => {
    const rows = [
      말("u1", "1번 제품으로 포스터"), 물음("q1", "photo", { ids: ["p1"] }),
      말("u2", withPick("1번은 우리 원두 봉투야", { photoRoles: [{ id: "p1", role: "preserve_product" }], typed: true })),
      물음("q2", "photo", { cont: true, reason: "people" }),
    ];
    expect(askChain(rows)).toMatchObject({
      origin: "1번 제품으로 포스터", answers: ["1번은 우리 원두 봉투야"], picks: { photoRoles: [{ id: "p1", role: "preserve_product" }] },
    });
    expect(askChain(rows)?.picks).not.toHaveProperty("typed");
  });

  it("물음이 마지막이 아니면 사슬이 없다", () => {
    expect(askChain([말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "고마워"), 도우미("a", "네")])).toBeUndefined();
  });
});

describe("지시 조립 (askInstruction)", () => {
  const chain = askChain([말("u1", "바다 포스터"), 물음("q1", "kind"), 말("u2", "한 장으로"), 물음("q2", "ratio", { cont: true })])!;

  it("단추 답이면 처음 말 + 앞의 말 답", () => {
    expect(askInstruction(chain, "이대로 만들기", "button")).toBe("바다 포스터\n한 장으로");
  });

  it("말로 한 답이면 이번 말도 잇는다", () => {
    expect(askInstruction(chain, "세로로", "typed")).toBe("바다 포스터\n한 장으로\n세로로");
  });

  it("답이 아니거나 사슬이 없으면 이번 말 그대로", () => {
    expect(askInstruction(chain, "고양이 포스터", "none")).toBe("고양이 포스터");
    expect(askInstruction(undefined, "고양이 포스터", "typed")).toBe("고양이 포스터");
  });

  it("번호만 고르는 물음(어느 이미지 · 몇 번 장)의 말 답은 지시에 안 넣는다", () => {
    const 번호 = askChain([말("u1", "배경만 파랗게"), 물음("q1", "target", { numbers: [1, 2] })])!;
    expect(askInstruction(번호, "2번", "typed")).toBe("배경만 파랗게");
  });

  it("옛 화면이 처음 말을 다시 보내도 두 번 잇지 않는다", () => {
    const 하나 = askChain([말("u1", "바다 포스터"), 물음("q1", "ratio")])!;
    expect(askInstruction(하나, "바다 포스터", "typed")).toBe("바다 포스터");
  });
});

describe("단추 답 받기 (Review Focus 1)", () => {
  const rows = [말("u1", "바다 포스터"), 물음("q1", "ratio", { wants: "image" })];

  it("지금 마지막 물음 줄의 단추만 받는다", () => {
    expect(readButtonAnswer({ answersRowId: "q1", pick: { ratio: "1:1" } }, rows))
      .toMatchObject({ chain: { ask: { id: "q1" } }, pick: { ratio: "1:1" } });
  });

  it("지난 물음 줄 id · 없는 id · 광고 물음이면 받지 않는다", () => {
    const 지난 = [...rows, 말("u2", "고마워"), 도우미("a", "네"), 말("u3", "고양이"), 물음("q2", "ratio")];
    expect(readButtonAnswer({ answersRowId: "q1", pick: { ratio: "1:1" } }, 지난)).toBeUndefined();
    expect(readButtonAnswer({ answersRowId: "nope" }, rows)).toBeUndefined();
    expect(readButtonAnswer({}, rows)).toBeUndefined();
    expect(readButtonAnswer({ answersRowId: "q1" }, [말("u1", "광고 소재"), 도우미("q1", AD_QUESTION)])).toBeUndefined();
  });

  it("고른 값은 모양만 거른다", () => {
    expect(readEasyPick({ kind: "poster", ratio: "x".repeat(41), target: 0, card: 2.5, photoRoles: [{ id: "a", role: "style" }, { id: 3 }] }))
      .toEqual({ photoRoles: [{ id: "a", role: "style" }] });
    expect(readEasyPick(null)).toEqual({});
    // 말로 친 사진 답의 표시(2차 최종 리뷰 8). 참일 때만 남긴다.
    expect(readEasyPick({ ratio: "1:1", typed: true })).toEqual({ ratio: "1:1", typed: true });
    expect(readEasyPick({ typed: "yes" })).toEqual({});
  });
});

/** 2차 최종 리뷰 1 · Review Focus 7 — 물은 뒤 고칠 것이 사라진 단추 답이 만들기로 새면 값이 나간다. */
describe("쓸 수 없게 된 단추 답은 다른 일로 새지 않고 사실 문장으로 끝낸다", () => {
  const 번호답 = { wants: "image_edit" as const, reply: "", target: 2 };
  const 장답 = { wants: "card_text" as const, reply: "", card: 2, note: "더 짧게" };

  it("쓸 수 있으면 그대로다", () => {
    expect(fitButtonDecision(번호답, { editableImage: true })).toBe(번호답);
    expect(fitButtonDecision(장답, { canRevise: true })).toBe(장답);
    expect(fitButtonDecision({ wants: "image", reply: "" }, {})).toEqual({ wants: "image", reply: "" });
  });

  it("고칠 이미지 · 원고가 다 없으면 판단 읽기와 같은 사실 문장", () => {
    expect(fitButtonDecision(번호답, {})).toEqual({ wants: "talk", reply: NOTHING_TO_EDIT });
    expect(fitButtonDecision(장답, {})).toEqual({ wants: "talk", reply: NOTHING_TO_EDIT });
    expect(fitButtonDecision({ wants: "card_redo", reply: "", card: 1 }, { canRevise: true, made: false }))
      .toEqual({ wants: "talk", reply: NOT_MADE_YET });
  });

  /** 판단 읽기는 원고가 없으면 장 고치기를 이미지 고치기로 바꿔 읽는다 — 단추 답이 그렇게 새면 이미지 고치기 값이 나간다. */
  it("판단 읽기라면 다른 일하는 갈래로 바꿔 읽을 자리면 그 일로 안 가고 사실만 말한다", () => {
    expect(fitButtonDecision(장답, { editableImage: true })).toEqual({ wants: "talk", reply: CANNOT_DO_NOW });
    expect(fitButtonDecision(번호답, { canRevise: true })).toEqual({ wants: "talk", reply: CANNOT_DO_NOW });
  });
});

/** 2차 최종 리뷰 6 · Review Focus 8 — 말로 한 답이 같은 물음을 되풀이하거나 처음 말을 잃지 않게. */
describe("말로 한 답의 갈래 정리 (settleTypedAnswer)", () => {
  const 물음줄 = (kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}) =>
    askChain([말("u1", "처음"), 물음("q1", kind, data)])!.ask;

  it("물음이 없으면 판단 그대로 · 답 아님 · 모양은 물어도 된다", () => {
    const decision = { wants: "image" as const, reply: "" };
    expect(settleTypedAnswer(undefined, decision)).toEqual({ decision, answered: false, askRatio: true });
  });

  it("모양 물음 뒤에는 답이든 아니든 모양을 다시 묻지 않는다", () => {
    expect(settleTypedAnswer(물음줄("ratio"), { wants: "image", reply: "", note: ASK_ANSWER_NOTE }))
      .toMatchObject({ answered: true, askRatio: false });
    expect(settleTypedAnswer(물음줄("ratio"), { wants: "image", reply: "" }))
      .toMatchObject({ answered: false, askRatio: false });
  });

  it("갈래 물음 뒤에 또 either 면 한 장으로 가고 답으로 본다 — 그 reply(갈래 물음)는 버린다", () => {
    expect(settleTypedAnswer(물음줄("kind"), { wants: "either", reply: "한 장으로 할까요?" })).toEqual({
      decision: { wants: "image", reply: "", note: ASK_ANSWER_NOTE }, answered: true, askRatio: true,
    });
    expect(settleTypedAnswer(물음줄("kind"), { wants: "cardnews", reply: "" })).toMatchObject({ answered: false });
  });

  it("번호 물음 바로 뒤 image_edit 이면 note 가 없어도 답이다", () => {
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), { wants: "image_edit", reply: "", target: 2 }))
      .toMatchObject({ answered: true, decision: { wants: "image_edit", target: 2 } });
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), { wants: "image", reply: "" })).toMatchObject({ answered: false });
  });

  it("장 물음 바로 뒤 장 갈래면 note 가 없어도 답이고, 바라는 점은 물을 때의 것을 쓴다", () => {
    const 장 = 물음줄("card", { wants: "card_text", count: 3, note: "더 짧게" });
    expect(settleTypedAnswer(장, { wants: "card_text", reply: "", card: 2 }))
      .toEqual({ decision: { wants: "card_text", reply: "", card: 2, note: "더 짧게" }, answered: true, askRatio: true });
    // 모델이 note 에 answer 를 적어도 고칠 내용으로 쓰지 않는다.
    expect(settleTypedAnswer(장, { wants: "card_redo", reply: "", card: 1, note: ASK_ANSWER_NOTE }).decision.note).toBe("더 짧게");
    expect(settleTypedAnswer(장, { wants: "card_text", reply: "", card: 2, note: "제목만" }).decision.note).toBe("제목만");
  });

  it("사진 · 레퍼런스 · 광고 물음은 note 의 answer 로만 답이다", () => {
    expect(settleTypedAnswer(물음줄("photo"), { wants: "image", reply: "", note: ASK_ANSWER_NOTE })).toMatchObject({ answered: true });
    expect(settleTypedAnswer(물음줄("reference"), { wants: "cardnews", reply: "" })).toMatchObject({ answered: false });
  });
});

describe("단추 답의 판단 — 글 모델을 안 부른다", () => {
  const 답 = (kind: Parameters<typeof askBody>[0], data: Record<string, unknown>, pick: Record<string, unknown>) =>
    buttonDecision(readButtonAnswer({ answersRowId: "q1", pick }, [말("u1", "처음"), 물음("q1", kind, data)])!);

  it("갈래 · 모양 · 사진 · 레퍼런스 · 이미지 번호 · 장 번호", () => {
    expect(답("kind", { ratio: "4:5" }, { kind: "cardnews" })).toEqual({ wants: "cardnews", reply: "", ratio: "4:5" });
    expect(답("ratio", { wants: "image" }, { ratio: "1:1" })).toEqual({ wants: "image", reply: "" });
    expect(답("photo", { wants: "cardnews" }, { photoRoles: [] })).toEqual({ wants: "cardnews", reply: "" });
    expect(답("photo", { wants: "image", look: "anime" }, {})).toEqual({ wants: "image", reply: "", look: "anime" });
    expect(답("reference", {}, { kind: "cardnews" })).toEqual({ wants: "cardnews", reply: "" });
    expect(답("target", { numbers: [1, 2] }, { target: 2 })).toEqual({ wants: "image_edit", reply: "", target: 2 });
    expect(답("card", { wants: "card_text", note: "더 짧게" }, { card: 3 }))
      .toEqual({ wants: "card_text", reply: "", card: 3, note: "더 짧게" });
  });

  it("고른 값이 모자라면 판단을 못 만든다 — 그때는 말로 보고 판단 모델이 가른다", () => {
    expect(답("kind", {}, {})).toBeUndefined();
    expect(답("target", {}, {})).toBeUndefined();
    expect(답("card", { wants: "caption" }, { card: 1 })).toBeUndefined();
  });
});

describe("이번 턴에 쓸 고른 값 (chosenFor)", () => {
  const chain = askChain([
    말("u1", "바다"), 물음("q1", "kind"), 말("u2", withPick("이미지 한 장", { kind: "image" })), 물음("q2", "ratio", { cont: true }),
  ])!;

  it("단추로 이어 답하면 앞서 고른 갈래까지 고른 것이다(1차 A2)", () => {
    expect(chosenFor({}, chain, { ratio: "4:5" })).toEqual({ kind: "image", kindPicked: true, ratio: "4:5" });
  });

  it("말로 한 답이면 갈래는 잇되 고른 것은 아니다", () => {
    expect(chosenFor({}, chain, undefined)).toEqual({ kind: "image", kindPicked: false });
  });

  /** Review Focus 5 — 답이 아니면 라우트가 사슬을 안 넘긴다. 옛 값이 몰래 안 붙는다. */
  it("사슬이 없으면 옛 화면이 보낸 칸만 쓴다", () => {
    expect(chosenFor({}, undefined, undefined)).toEqual({ kindPicked: false });
    expect(chosenFor({ kind: "image", kindPicked: true, ratio: "1:1", photoRoles: [{ id: "a", role: "style" }] }, undefined, undefined))
      .toEqual({ kind: "image", kindPicked: true, ratio: "1:1", photoRoles: [{ id: "a", role: "style" }] });
  });

  it("답이라고 적는 값은 1차 광고 물음의 것과 같다", () => {
    expect(ASK_ANSWER_NOTE).toBe(AD_ANSWER_NOTE);
  });
});
```

`apps/web/app/easy/__tests__/chat-image-edit.test.ts` — 「판단 읽기」 묶음(38~66줄) 끝에 넣는다:

```ts
  /**
   * 2차 최종 리뷰 b — 2차부터는 모든 갈래에서 reply 를 쓴다. 바꿔 읽은 일에 처음 갈래로 쓴 글
   * (「원고를 고치겠습니다」)이 머리말로 나가면 안 된다. 다른 일하는 갈래로 바꿔 읽으면 reply 를 비운다.
   */
  it("다른 일하는 갈래로 바꿔 읽으면 처음 갈래로 쓴 reply 를 버린다", () => {
    const 원고고치기 = { ...결정("revise"), reply: "카드뉴스 원고를 고치겠습니다." };
    expect(readEasyDecision(원고고치기, { editableImage: true })).toMatchObject({ wants: "image_edit", reply: "" });
    const 이미지고치기 = { ...결정("image_edit"), reply: "배경을 바꾸겠습니다." };
    expect(readEasyDecision(이미지고치기, { canRevise: true })).toMatchObject({ wants: "revise", reply: "" });
    expect(readEasyDecision({ ...결정("image"), reply: "만들겠습니다." })).toMatchObject({ wants: "image", reply: "만들겠습니다." });
  });

  /** 2차 최종 리뷰 c — AI 가 표시 머리로 시작하는 글을 쓰면 그 말 줄이 머리말 · 물음으로 읽힌다. */
  it("AI 가 쓴 reply 의 표시 머리를 푼다", () => {
    expect(readEasyDecision({ ...결정("talk"), reply: "say:안녕하세요" }).reply).toBe("say：안녕하세요");
    expect(readEasyDecision({ ...결정("talk"), reply: "ask:ratio:\n어떤 모양?" }).reply).toBe("ask：ratio:\n어떤 모양?");
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/ask-chain.test.ts app/easy/__tests__/chat-image-edit.test.ts`
Expected: FAIL — `Failed to resolve import "../ask-chain"`, 바꿔 읽은 판단에 처음 reply 가 남아 있다

- [ ] **Step 3: `EasyDecision` 에 고칠 번호 칸을 더한다**

`apps/web/app/easy/chat.ts` 에서 아래를 찾아:

```ts
  /** 3단계: 그 장에 바라는 점 · 고칠 내용. */
  note?: string;
```

바로 아래에 더한다:

```ts
  /** 2차 D2: 고칠 결과물 번호(이 대화의 「이미지 N」). 없으면 마지막 이미지다. */
  target?: number;
```

(b) Task 1 이 바꾼 import `import { visibleBody } from "./row-marks";` 를 `import { plainAiText, visibleBody } from "./row-marks";` 로 바꾼다.

(c) `readEasyDecision` 의 갈래 바꿔 읽기를 함수로 뺀다 — **단추 답도 같은 함수를 지나게**(2차 최종 리뷰 1). 아래(`let wants = …` 부터 `만든뒤갈래` 의 두 번째 `else if` 블록 끝까지)를 찾아:

```ts
  let wants = said as EasyDecision["wants"];
  let reply = typeof value?.reply === "string" ? value.reply.trim() : "";
  /*
    **이미지 고치기는 고칠 이미지가 있어야 한다.** 없으면 원고 고치기로, 원고도
    없으면 고칠 것이 없다고 답한다.
  */
  if (said === "image_edit" && !options.editableImage) {
    if (options.canRevise) wants = "revise";
    else { wants = "talk"; reply = NOTHING_TO_EDIT; }
  }
  /*
    고칠 원고가 없는데 고치라고 하면 — **만든 이미지가 있으면 그것을 고친다.**
    모델은 이미지를 고쳐 달라는 말에도 `revise` 를 골랐다(2026-10-06 실측 6/6).
    둘 다 없으면 빈 답이 아니라 안내를 한다 — 빈 답은 같은 말을 되풀이했다.
  */
  else if ((said === "revise" || said === "card_text") && !options.canRevise) {
    if (options.editableImage) wants = "image_edit";
    else { wants = "talk"; reply = NOTHING_TO_EDIT; }
  }
  // 다시 그리기 · 게시글 · 받기는 만든 카드가 있어야 한다(3단계 §5). 원고만 있으면 먼저 만들라고 답한다.
  else if (만든뒤갈래.has(said) && !options.canRevise) wants = "talk";
  else if (만든뒤갈래.has(said) && !options.made) {
    wants = "talk";
    reply = NOT_MADE_YET;
  }
```

이렇게 바꾼다:

```ts
  // AI 가 쓴 글이 표시 머리로 시작하면 풀어 둔다 — 저장한 말 줄이 물음 · 머리말로 읽히지 않게(2차 최종 리뷰 c).
  const { wants, reply } = availableWant(
    said as EasyWant, plainAiText(typeof value?.reply === "string" ? value.reply.trim() : ""), options,
  );
```

함수 머리의 `options: { canRevise?: boolean; made?: boolean; editableImage?: boolean } = {},` 를 `options: EasyAvailability = {},` 로 바꾸고, 그 위 주석 `/** \`editableImage\`: 이 대화의 마지막 결과가 고칠 수 있는 이미지 한 장인가(2026-10-06). */` 는 둔다.

(d) `readEasyDecision` 바로 **앞**에 더한다(`NOT_MADE_YET` · `NOTHING_TO_EDIT` · `만든뒤갈래` 는 이 파일에 이미 있다):

```ts
/** 「지금 쓸 수 있는 것」 사실. 판단 읽기와 단추 답(`fitButtonDecision`)이 같은 것을 본다. */
export interface EasyAvailability {
  canRevise?: boolean;
  made?: boolean;
  /** 고칠 수 있는 이미지가 이 대화에 있나(2차: 지운 것만 빼고 — 만드는 중 · 못 만든 것도 넣는다). */
  editableImage?: boolean;
}

/**
 * **쓸 수 없는 갈래를 바꿔 읽는다**(2026-10-06, 2차 최종 리뷰 1 · b).
 *
 * - 이미지 고치기는 고칠 이미지가 있어야 한다. 없으면 원고 고치기로, 원고도 없으면 고칠 것이 없다고 답한다
 * - 고칠 원고가 없는데 고치라고 하면 만든 이미지를 고친다 — 모델은 이미지를 고쳐 달라는 말에도 `revise` 를
 *   골랐다(2026-10-06 실측 6/6). 둘 다 없으면 빈 답이 아니라 안내 — 빈 답은 같은 말을 되풀이했다
 * - 다시 그리기 · 게시글 · 받기는 만든 카드가 있어야 한다(3단계 §5). 원고만 있으면 먼저 만들라고 답한다
 *
 * **다른 일하는 갈래로 바꿔 읽으면 `reply` 를 비운다**(2차 최종 리뷰 b). 2차부터는 모든 갈래에서 reply 를
 * 쓰는데, 그 글은 모델이 처음 고른 일로 쓴 말이라(「원고를 고치겠습니다」) 바뀐 일의 머리말로 나가면 틀린다.
 * 비우면 코드 문장이 나간다.
 */
export function availableWant(said: EasyWant, reply: string, options: EasyAvailability): { wants: EasyWant; reply: string } {
  if (said === "image_edit" && !options.editableImage) {
    return options.canRevise ? { wants: "revise", reply: "" } : { wants: "talk", reply: NOTHING_TO_EDIT };
  }
  if ((said === "revise" || said === "card_text") && !options.canRevise) {
    return options.editableImage ? { wants: "image_edit", reply: "" } : { wants: "talk", reply: NOTHING_TO_EDIT };
  }
  if (만든뒤갈래.has(said) && !options.canRevise) return { wants: "talk", reply };
  if (만든뒤갈래.has(said) && !options.made) return { wants: "talk", reply: NOT_MADE_YET };
  return { wants: said, reply };
}

/** 단추 답이 다른 일로 바뀌어 읽힐 자리일 때의 답(2차 최종 리뷰 1). 프로젝트 만들기 앞의 막이도 쓴다. */
export const CANNOT_DO_NOW =
  "고칠 이미지나 카드뉴스가 그 사이 바뀌어 말씀대로 할 수 없습니다. 무엇을 할지 다시 알려 주세요.";

/**
 * **단추 답의 갈래도 지금 사실로 다시 본다**(2차 최종 리뷰 1 · Review Focus 7). 단추 답은 판단 모델을 안
 * 부르고 물음 줄에 적어 둔 판단으로 간다 — 물은 뒤에 이미지를 지웠거나 원고가 사라졌으면 그 판단은 낡았다.
 * 판단 읽기와 같은 `availableWant` 를 지나고, **바뀌면 다른 일로 새지 않는다**: 판단 읽기라면 바꿔 읽을
 * 다른 일하는 갈래(원고 고치기 ↔ 이미지 고치기)여도 그 일을 안 하고 사실 문장으로 끝낸다. 누른 단추와 다른
 * 일에 값이 나가면 안 된다.
 */
export function fitButtonDecision(decision: EasyDecision, options: EasyAvailability): EasyDecision {
  const fitted = availableWant(decision.wants, decision.reply, options);
  if (fitted.wants === decision.wants) return decision;
  return { wants: "talk", reply: fitted.wants === "talk" && fitted.reply ? fitted.reply : CANNOT_DO_NOW };
}

```

- [ ] **Step 4: `ask-chain.ts` 를 만든다**

`apps/web/app/easy/ask-chain.ts`:

```ts
import type { EasyDecision } from "./chat";
import type { EasyMessage } from "./turn";
import { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_CHOICE_SPECS, isAdQuestion } from "./ad-ask";
import { isSayBody, readAsk, readPick, visibleBody, type EasyAskKind } from "./row-marks";
import { isFailureRowBody } from "../../lib/easy/failure-row";

/**
 * **물음 사슬**(2026-10-07 2차 설계 D1 · §3-1).
 *
 * 화면은 물음에 답할 때 처음 말을 다시 보내지 않는다. 서버가 대화 줄을 마지막 물음에서 거슬러
 * 가며 (처음 말, 말로 한 답들, 단추로 고른 값 합본, 사진 id)를 모은다 — 1차 광고 물음의
 * 「물음 앞의 말 + 답」을 모든 물음으로 넓힌 것이다. 이미지 길과 카드뉴스 길이 둘 다 쓴다.
 *
 * 물음 줄 자료의 `cont` 는 「이 물음을 부른 사용자 말이 앞 물음의 답이었다」는 뜻이다. 없으면
 * 바로 앞 사용자 말이 처음 말이다 — 물음 뒤에 새 주문을 쳤으면 사슬이 거기서 끊긴다.
 */
type Row = Pick<EasyMessage, "id" | "role" | "body">;

/** 판단 모델이 「이번 말은 앞 물음의 답이다」라고 `note` 에 적는 값(1차 광고 물음의 것 그대로). */
export const ASK_ANSWER_NOTE = AD_ANSWER_NOTE;

export interface EasyPick {
  kind?: "image" | "cardnews";
  ratio?: string;
  look?: string;
  photoRoles?: Array<{ id: string; role: string }>;
  photoSlots?: Array<{ id: string; role: string }>;
  target?: number;
  card?: number;
  /**
   * 사진 고르기가 열린 채 **말로 친 답**(2차 최종 리뷰 8). 고른 쓰임과 함께 오지만 그 말도 답이다 —
   * 지시에 잇는다(`askInstruction` 의 `typed`, 사슬의 `answers`).
   */
  typed?: true;
}

export interface EasyChainAsk {
  id: string;
  /** 광고 물음(본문 완전일치)은 `ad`. */
  kind: EasyAskKind | "ad";
  data: Record<string, unknown>;
  text: string;
}

export interface EasyAskChain {
  /** 지금 답할 수 있는 마지막 물음. */
  ask: EasyChainAsk;
  /** 물음을 부른 처음 말. */
  origin: string;
  /** 그 뒤에 말로 한 답들(단추 글은 뺀다). 오래된 것부터. */
  answers: string[];
  /** 단추로 고른 값 합본. 뒤에 고른 것이 이긴다. */
  picks: EasyPick;
  /** 가장 최근 물음 줄에 적힌 사진 id. */
  photoIds: string[];
}

export type EasyAnswerWay = "button" | "typed" | "none";

function 물음(row: Row | undefined): EasyChainAsk | undefined {
  if (!row) return undefined;
  if (isAdQuestion(row)) return { id: row.id, kind: "ad", data: {}, text: row.body };
  const ask = readAsk(row);
  return ask ? { id: row.id, ...ask } : undefined;
}

function 단추답인가(row: Row | undefined): boolean {
  if (row?.role !== "user") return false;
  return readPick(row) !== undefined || row.body === AD_CHOICE_IMAGE || row.body === AD_CHOICE_SPECS;
}

function 머리말인가(row: Row | undefined): boolean {
  return row?.role === "assistant" && isSayBody(row.body);
}

/**
 * `at` 자리에 놓인 사용자 말이 답한 물음 줄의 자리. 없으면 -1. 보통은 바로 앞 줄이다.
 * 단추로 답했다가 실패한 짝(단추 답 줄 → (머리말 줄) → 실패 줄)이 사이에 있으면 건너뛴다(1차 `물음자리`
 * 일반화). **머리말 줄은 답이 아니다**(2차 최종 리뷰 2) — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄이라,
 * 머리말 뒤에 실패하면 짝 사이에 머리말이 낀다. 말로 한 답이 실패한 것은 건너뛰지 않는다 — 그 말이 답이었는지
 * 코드는 모른다.
 */
function 물음자리(rows: readonly Row[], at: number): number {
  if (물음(rows[at - 1])) return at - 1;
  const 실패 = rows[at - 1];
  if (!(실패?.role === "assistant" && isFailureRowBody(실패.body))) return -1;
  const 답자리 = 머리말인가(rows[at - 2]) ? at - 3 : at - 2;
  return 단추답인가(rows[답자리]) && 물음(rows[답자리 - 1]) !== undefined ? 답자리 - 1 : -1;
}

/** 지금 보내는 말이 답할 수 있는 마지막 물음 줄의 자리. 없으면 -1. */
export function askAnchor(rows: readonly Row[]): number {
  return 물음자리(rows, rows.length);
}

/**
 * **화면이 단추를 달 물음 줄**(Review Focus 1, 2차 최종 리뷰 2). 서버가 받아 줄 물음 줄(`askAnchor`)과 같다
 * — 마지막 줄이 물음이거나, 다시 연 대화의 [물음, 단추 답, (머리말), 실패] 면 그 물음. 그 자리에서 단추 답이
 * 실패하면 화면에는 실패 줄이 아직 없어 [물음, 단추 답] 으로 끝나 있다 — 서버에는 실패 줄이 남았으니 그
 * 물음도 받아 준다. 그래서 그 경우도 그 물음 줄이다.
 */
export function answerableAskId(rows: readonly Row[]): string | undefined {
  const at = askAnchor(rows);
  if (at >= 0) return rows[at]!.id;
  const n = rows.length;
  return 단추답인가(rows[n - 1]) && 물음(rows[n - 2]) ? rows[n - 2]!.id : undefined;
}

function 아이디들(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string" && one.length > 0) : [];
}

function 쌍목록(value: unknown): Array<{ id: string; role: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 20).flatMap((one) => {
    const entry = one as { id?: unknown; role?: unknown } | null;
    return entry && typeof entry.id === "string" && typeof entry.role === "string" ? [{ id: entry.id, role: entry.role }] : [];
  });
}

function 번호(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max ? value : undefined;
}

function 짧은글(value: unknown, max = 40): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

function 갈래(value: unknown): "image" | "cardnews" | undefined {
  return value === "image" ? "image" : value === "cardnews" ? "cardnews" : undefined;
}

/** 단추 값 읽기. 화면이 보낸 것이든 줄에 적힌 것이든 모양만 거른다 — 뜻은 쓰는 곳이 다시 본다. */
export function readEasyPick(raw: unknown): EasyPick {
  const value = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const kind = 갈래(value.kind);
  const ratio = 짧은글(value.ratio);
  const look = 짧은글(value.look);
  const photoRoles = 쌍목록(value.photoRoles);
  const photoSlots = 쌍목록(value.photoSlots);
  const target = 번호(value.target, 999);
  const card = 번호(value.card, 99);
  return {
    ...(kind ? { kind } : {}),
    ...(ratio ? { ratio } : {}),
    ...(look ? { look } : {}),
    ...(photoRoles ? { photoRoles } : {}),
    ...(photoSlots ? { photoSlots } : {}),
    ...(target ? { target } : {}),
    ...(card ? { card } : {}),
    ...(value.typed === true ? { typed: true as const } : {}),
  };
}

/** 고른 값만(말로 친 답 표시 `typed` 는 그 줄의 것이라 사슬의 고른 값에 안 남긴다). */
function 고른값만(pick: EasyPick): EasyPick {
  return Object.fromEntries(Object.entries(pick).filter(([key]) => key !== "typed")) as EasyPick;
}

/** `i` 자리의 물음에서 거슬러 간다. 사슬은 몇 줄 안 되어 되부르기가 얕다. */
function 거슬러간다(rows: readonly Row[], i: number): Omit<EasyAskChain, "ask"> {
  const 지금 = 물음(rows[i])!;
  const 말 = rows[i - 1];
  const ids = 아이디들(지금.data.ids);
  const 앞 = 지금.data.cont === true && 말?.role === "user" ? 물음자리(rows, i - 1) : -1;
  if (앞 < 0) return { origin: 말?.role === "user" ? visibleBody(말) : "", answers: [], picks: {}, photoIds: ids };
  const 앞쪽 = 거슬러간다(rows, 앞);
  const 단추 = 단추답인가(말);
  const 고른 = 단추 ? readEasyPick(readPick(말!)) : {};
  // 말로 친 사진 답(typed)은 고른 값과 함께 그 말도 답으로 잇는다(2차 최종 리뷰 8).
  const 말답 = !단추 || 고른.typed === true;
  return {
    origin: 앞쪽.origin,
    answers: 말답 ? [...앞쪽.answers, visibleBody(말!)] : 앞쪽.answers,
    picks: 단추 ? { ...앞쪽.picks, ...고른값만(고른) } : 앞쪽.picks,
    photoIds: ids.length ? ids : 앞쪽.photoIds,
  };
}

export function askChain(rows: readonly Row[]): EasyAskChain | undefined {
  const at = askAnchor(rows);
  const ask = 물음(rows[at]);
  return ask ? { ask, ...거슬러간다(rows, at) } : undefined;
}

/**
 * 만들 때 쓰는 지시 = 처음 말 + 줄바꿈 + 말 답들(설계 §3-1). **답일 때만 잇는다** — 단추 답이면
 * 처음 말 + 앞의 말 답, 말로 한 답이면 이번 말까지. 답이 아니면 이번 말 그대로다.
 *
 * 번호만 고르는 물음(어느 이미지 · 몇 번 장)의 말 답(「2번」)은 넣지 않는다 — 고칠 내용이 아니다.
 * 옛 화면이 처음 말을 다시 보내도(배포 사이) 두 번 붙지 않게 처음 말과 같은 답은 뺀다.
 */
export function askInstruction(chain: EasyAskChain | undefined, prompt: string, way: EasyAnswerWay): string {
  if (!chain || way === "none" || !chain.origin) return prompt;
  const 이번답 = way === "typed" && chain.ask.kind !== "target" && chain.ask.kind !== "card" ? [prompt] : [];
  const 답들 = [...chain.answers, ...이번답].filter((one) => one.trim() && one !== chain.origin);
  return [chain.origin, ...답들].join("\n");
}

export interface EasyButtonAnswer {
  chain: EasyAskChain;
  pick: EasyPick;
}

/**
 * **단추 답은 지금 마지막 물음 줄의 것만 받는다**(설계 §3-1, Review Focus 1). 지난 물음의 단추로
 * 지금 맥락과 다른 지시에 값이 나가지 않게. 광고 물음 단추는 1차 그대로 단추 글로 온다.
 */
export function readButtonAnswer(input: { answersRowId?: unknown; pick?: unknown }, rows: readonly Row[]): EasyButtonAnswer | undefined {
  if (typeof input.answersRowId !== "string" || !input.answersRowId) return undefined;
  const chain = askChain(rows);
  if (!chain || chain.ask.kind === "ad" || chain.ask.id !== input.answersRowId) return undefined;
  return { chain, pick: readEasyPick(input.pick) };
}

function 말한값(data: Record<string, unknown>): Pick<EasyDecision, "ratio" | "look"> {
  const ratio = 짧은글(data.ratio);
  const look = 짧은글(data.look);
  return { ...(ratio ? { ratio } : {}), ...(look ? { look } : {}) };
}

/**
 * **단추 답의 판단**(설계 §3-1) — 물음 줄 자료의 판단 + 고른 값으로 바로 간다. 글 모델을 안 부른다.
 * 고른 값이 모자라면 `undefined` — 그때는 말로 본다(판단 모델이 가른다).
 */
export function buttonDecision(answer: EasyButtonAnswer): EasyDecision | undefined {
  const { ask } = answer.chain;
  const { pick } = answer;
  const said = 말한값(ask.data);
  if (ask.kind === "kind") return pick.kind ? { wants: pick.kind, reply: "", ...said } : undefined;
  if (ask.kind === "ratio") return { wants: "image", reply: "", ...said };
  if (ask.kind === "photo") return { wants: ask.data.wants === "cardnews" ? "cardnews" : "image", reply: "", ...said };
  if (ask.kind === "reference") return { wants: "cardnews", reply: "", ...said };
  if (ask.kind === "target") return pick.target ? { wants: "image_edit", reply: "", target: pick.target } : undefined;
  const 장갈래 = ask.data.wants === "card_text" ? "card_text" : ask.data.wants === "card_redo" ? "card_redo" : undefined;
  if (ask.kind === "card" && pick.card && 장갈래) {
    const note = 짧은글(ask.data.note, 500);
    return { wants: 장갈래, reply: "", card: pick.card, ...(note ? { note } : {}) };
  }
  return undefined;
}

export interface EasyChosen {
  kind?: "image" | "cardnews";
  /** 갈래를 단추로 골랐나(1차 A2). 그러면 판단과 상관없이 그 갈래로 간다. */
  kindPicked: boolean;
  ratio?: string;
  look?: string;
  photoRoles?: unknown;
  photoSlots?: unknown;
}

/**
 * **이번 턴에 쓸 고른 값.** 사슬(답일 때만 라우트가 넘긴다)의 단추 값 + 이번 단추 값. 없으면 옛
 * 화면이 보낸 칸(`kind` · `kindPicked` · `ratio` · `look` · `photoRoles` · `photoSlots`)을 쓴다.
 *
 * `kindPicked`: 이번 턴이 단추 답이고 사슬에 고른 갈래가 있을 때만(1차 「갈래 단추로 보낸 턴과 그 뒤
 * **단추로** 이어 답한 턴」). 말로 한 답은 갈래를 잇지만 고른 것이 아니다.
 */
export function chosenFor(input: Record<string, unknown>, chain: EasyAskChain | undefined, button: EasyPick | undefined): EasyChosen {
  const picks: EasyPick = { ...(chain?.picks ?? {}), ...(button ?? {}) };
  const kind = picks.kind ?? 갈래(input.kind);
  const ratio = picks.ratio ?? 짧은글(input.ratio);
  const look = picks.look ?? 짧은글(input.look);
  const photoRoles = picks.photoRoles ?? input.photoRoles;
  const photoSlots = picks.photoSlots ?? input.photoSlots;
  return {
    ...(kind ? { kind } : {}),
    kindPicked: (button !== undefined && picks.kind !== undefined) || input.kindPicked === true,
    ...(ratio ? { ratio } : {}),
    ...(look ? { look } : {}),
    ...(photoRoles !== undefined ? { photoRoles } : {}),
    ...(photoSlots !== undefined ? { photoSlots } : {}),
  };
}

export interface EasyTypedAnswer {
  decision: EasyDecision;
  /** 이번 말을 그 물음의 답으로 본다 — 처음 말 · 고른 값 · 물음 줄의 사진을 잇는다. */
  answered: boolean;
  /** 모양을 물어도 되나. 모양 물음 바로 뒤면 `false` — 같은 물음을 또 하지 않는다. */
  askRatio: boolean;
}

/**
 * **말로 한 답의 갈래 정리**(2차 최종 리뷰 6 · Review Focus 8). 판단 모델의 답을 바로 앞 물음의 갈래로
 * 한 번 더 본다 — 같은 물음이 되풀이되거나 처음 말을 잃지 않게. 단추 답에는 안 건다(물음 줄의 판단이다).
 *
 * - 모양 물음 뒤: 답이든 아니든 **모양을 다시 묻지 않는다**(말한 비율이 없으면 정사각형). 물은 것에 말로
 *   답했는데 같은 물음이 또 뜨면 대화가 거기서 맴돈다
 * - 갈래 물음 뒤 또 `either`: 한 장으로 가고 답으로 본다(「아무거나」). 그 reply 는 갈래 물음 글이라 버린다
 * - 번호 물음 바로 뒤 `image_edit` · 장 물음 바로 뒤 장 갈래: 물음이 바란 갈래라 `note` 가 없어도 답이다.
 *   장 물음이면 바라는 점은 이번 `note`, 없거나 `answer` 면 물을 때 적어 둔 것
 * - 그 밖(사진 · 레퍼런스 · 광고): 판단 모델이 `note` 에 answer 라고 적었을 때만 답이다
 */
export function settleTypedAnswer(ask: EasyChainAsk | undefined, decision: EasyDecision): EasyTypedAnswer {
  const 답표시 = decision.note === ASK_ANSWER_NOTE;
  if (!ask) return { decision, answered: false, askRatio: true };
  if (ask.kind === "ratio") return { decision, answered: 답표시, askRatio: false };
  if (ask.kind === "kind" && decision.wants === "either") {
    return { decision: { ...decision, wants: "image", reply: "", note: ASK_ANSWER_NOTE }, answered: true, askRatio: true };
  }
  if (ask.kind === "target" && decision.wants === "image_edit") return { decision, answered: true, askRatio: true };
  if (ask.kind === "card" && (decision.wants === "card_text" || decision.wants === "card_redo")) {
    const 바라는점 = decision.note && !답표시 ? decision.note : 짧은글(ask.data.note, 500);
    return {
      decision: {
        wants: decision.wants, reply: decision.reply,
        ...(decision.card ? { card: decision.card } : {}),
        ...(바라는점 ? { note: 바라는점 } : {}),
      },
      answered: true,
      askRatio: true,
    };
  }
  return { decision, answered: 답표시, askRatio: true };
}
```

- [ ] **Step 5: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/ask-chain.test.ts app/easy/__tests__/chat.test.ts app/easy/__tests__/chat-image-edit.test.ts app/easy/__tests__/chat-wants.test.ts lib/easy/__tests__/judge.test.ts`
Expected: PASS — 1차의 판단 읽기 시험(고칠 것 없음 · 원고 없이 고치기 → 이미지 고치기 · 만든 뒤 갈래)이 `availableWant` 로 그대로 통과한다

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/easy/ask-chain.ts apps/web/app/easy/chat.ts apps/web/app/easy/__tests__/ask-chain.test.ts apps/web/app/easy/__tests__/chat-image-edit.test.ts
git commit -m "feat(easy): 물음 사슬에서 처음 말 · 답 · 고른 값 · 사진을 모은다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: 묻기 출구마다 사용자 줄 + 물음 줄을 남긴다 (D1 서버 저장)

**Files:**
- Create: `apps/web/app/easy/turn-words.ts`
- Create: `apps/web/lib/easy/ask-turn.ts`
- Modify: `apps/web/app/api/easy/generate/route.ts:24, 33, 268-272, 292-311, 313-317, 331-353, 480-541`
- Test: `apps/web/app/easy/__tests__/turn-words.test.ts` (새), `apps/web/lib/easy/__tests__/ask-turn.test.ts` (새)
- Test (고침): `apps/web/app/api/easy/__tests__/generate-wiring.test.ts:216-226, 264-268`, `apps/web/app/api/easy/__tests__/generate-route.test.ts:173-181`, `apps/web/app/api/easy/__tests__/cardnews-route.test.ts:171-176, 199-212, 233-239`, `apps/web/app/api/easy/__tests__/generate-ad.test.ts` (더함)

**Interfaces:**
- Consumes: Task 1 — `askBody`, `readAsk`, `withPick`, `EasyAskKind`
- Produces:
  - `turn-words.ts`: `KIND_QUESTION: string`, `RATIO_QUESTION: string`, `photoQuestion(reason: "unclear" | "people"): string`, `askText(reply: string | undefined, fallback: string): string`(「?」가 **어디든** 들어 있으면 AI 글 — 2차 최종 리뷰 3), `aiText(decision: { wants: string; reply: string }, executed: string): string | undefined`(판단 모델이 **지금 실행하는 갈래로** 쓴 reply 만 — 2차 최종 리뷰 b. 라우트는 `aiText(decision, wants)` 로 부른다)
  - `ask-turn.ts`: `export interface AskTurnContext { store: Pick<EasyStore, "appendMessage" | "renameConversation">; conversation: { title?: string | null }; conversationId: string; prompt: string; userBody: string; textModel: string; cont: boolean }`, `askTurn(ctx: AskTurnContext, ask: { kind: EasyAskKind; text: string; data?: Record<string, unknown> }, legacy?: Record<string, unknown>): Promise<Response>` — 응답 `{ ok: true, ask: { kind }, message: 물음 줄, userMessage: 사용자 줄, textModel, ...legacy }`
  - `route.ts` 의 `물음맥락: AskTurnContext` · `말한것: { ratio?; look? }`(wants 바로 아래), `cardnewsTurn` 의 ctx 에 `물음` · `말한것`
- 물음 응답은 옛 칸(`kindAsk` · `asked` · `photoAsk` · `needReference`)도 그대로 싣는다 — 배포 사이 열린 옛 화면이 깨지지 않게

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/turn-words.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KIND_QUESTION, RATIO_QUESTION, aiText, askText, photoQuestion } from "../turn-words";

/**
 * **물음 문장**(2026-10-07 2차 설계 §3-4). 갈래 · 모양 물음은 판단과 같은 호출의 reply 를 쓴다.
 * 물음으로 쓴 글이 아니면(비었거나 「만들겠습니다」) 고정 문장으로 대신한다.
 */
describe("물음 문장", () => {
  it("AI 가 물음으로 쓴 글이면 그것, 아니면 고정 문장", () => {
    expect(askText("세로로 만들까요, 정사각형으로 만들까요?", RATIO_QUESTION)).toBe("세로로 만들까요, 정사각형으로 만들까요?");
    expect(askText("포스터를 만들겠습니다.", RATIO_QUESTION)).toBe(RATIO_QUESTION);
    expect(askText("  ", KIND_QUESTION)).toBe(KIND_QUESTION);
    expect(askText(undefined, KIND_QUESTION)).toBe(KIND_QUESTION);
  });

  /** 2차 최종 리뷰 3 — 프롬프트가 「묻고, 안 골라도 정사각형이라고 덧붙이라」고 시킨다. 물음 뒤 설명이 붙는다. */
  it("물음 뒤에 설명이 붙어도 AI 물음이다 — 「?」가 어디든 있으면", () => {
    const 물음 = "세로로 할까요, 정사각형으로 할까요? 안 고르시면 정사각형으로 만듭니다.";
    expect(askText(물음, RATIO_QUESTION)).toBe(물음);
    expect(askText("한 장으로 만들까요？ 여러 장도 됩니다.", KIND_QUESTION)).toBe("한 장으로 만들까요？ 여러 장도 됩니다.");
  });

  /** 2차 최종 리뷰 b — 코드가 갈래를 바꿔 읽으면 그 reply 는 다른 일을 하겠다고 쓴 글이다. */
  it("지금 실행하는 갈래로 쓴 reply 만 AI 글로 받는다", () => {
    expect(aiText({ wants: "image", reply: "세로로 할까요?" }, "image")).toBe("세로로 할까요?");
    expect(aiText({ wants: "talk", reply: "무엇을 도와드릴까요?" }, "image")).toBeUndefined();
    expect(askText(aiText({ wants: "talk", reply: "무엇을 도와드릴까요?" }, "image"), RATIO_QUESTION)).toBe(RATIO_QUESTION);
  });

  it("사진 물음은 고정 문장이다(2차 §4)", () => {
    expect(photoQuestion("unclear")).toBe("사진을 어떻게 쓸지 알려 주세요.");
    expect(photoQuestion("people")).toContain("한 장만 「인물 그대로」로 골라 주세요");
  });

  it("고정 문장에 줄표가 없다", () => {
    for (const one of [KIND_QUESTION, RATIO_QUESTION, photoQuestion("unclear"), photoQuestion("people")]) expect(one).not.toContain("—");
  });
});
```

`apps/web/lib/easy/__tests__/ask-turn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { askTurn, type AskTurnContext } from "../ask-turn";
import { readAsk, withPick } from "../../../app/easy/row-marks";

/**
 * **물음도 대화에 남긴다**(2026-10-07 2차 설계 D1). 사용자 줄 + 물음 줄 두 줄이다. 값도 예약도 없다.
 */
function 맥락(over: Partial<AskTurnContext> = {}) {
  const 남긴줄: Array<{ role: string; body?: string }> = [];
  const 이름: string[] = [];
  const ctx: AskTurnContext = {
    store: {
      appendMessage: async (row) => {
        남긴줄.push(row);
        return { id: `m${남긴줄.length}`, conversationId: row.conversationId, role: row.role, body: row.body ?? "", workId: null, createdAt: "" };
      },
      renameConversation: async (_id, title) => { 이름.push(title); },
    },
    conversation: { title: "" }, conversationId: "c1", prompt: "바다 포스터", userBody: "바다 포스터", textModel: "m", cont: false,
    ...over,
  };
  return { ctx, 남긴줄, 이름 };
}

describe("물음 턴 (2차 D1)", () => {
  it("사용자 줄 · 물음 줄을 차례로 남기고 물음 줄을 돌려준다", async () => {
    const { ctx, 남긴줄, 이름 } = 맥락();
    const json = await (await askTurn(ctx, { kind: "ratio", text: "어떤 모양?", data: { wants: "image" } }, { asked: true })).json();
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "ratio", data: { wants: "image" }, text: "어떤 모양?" });
    expect(json).toMatchObject({ ok: true, ask: { kind: "ratio" }, asked: true, message: { id: "m2" }, userMessage: { id: "m1" }, textModel: "m" });
    expect(이름).toEqual(["바다 포스터"]);
  });

  it("앞 물음의 답이었으면 물음 줄에 cont 를 적는다 — 다음 답이 사슬을 잇는다", async () => {
    const { ctx, 남긴줄 } = 맥락({ cont: true });
    await askTurn(ctx, { kind: "photo", text: "사진을 어떻게 쓸지 알려 주세요.", data: { ids: ["p1"] } });
    expect(readAsk(남긴줄[1] as never)?.data).toEqual({ cont: true, ids: ["p1"] });
  });

  it("단추 답이면 고른 값이 붙은 글을 사용자 줄에 남기고, 제목이 있으면 안 바꾼다", async () => {
    const { ctx, 남긴줄, 이름 } = 맥락({ prompt: "이미지 한 장", userBody: withPick("이미지 한 장", { kind: "image" }), conversation: { title: "있음" } });
    await askTurn(ctx, { kind: "ratio", text: "어떤 모양?" });
    expect(남긴줄[0]!.body).toBe(withPick("이미지 한 장", { kind: "image" }));
    expect(이름).toEqual([]);
  });
});
```

`apps/web/app/api/easy/__tests__/generate-wiring.test.ts` — 「비율·결 묻기」 묶음의 주석 + 「물어볼 때는 대화에 아무것도 안 쌓는다」 `it`(216~226줄)을 아래로 바꾼다:

```ts
  /**
   * **물을 때도 대화에 남긴다**(2026-10-07 사용자 결정 2차 D1 — 이 시험이 뒤집힌 까닭).
   *
   * 예전 시험은 「물어만 볼 때는 아무것도 안 남긴다. 답 없이 떠나면 아무 일도 안 일어난 것이
   * 맞다」(2026-09-21)였다. 그렇게 두었더니 새로고침하면 물음이 사라지고, 단추 대신 말로 답하면
   * 판단 모델이 앞 물음을 몰랐다. 사용자가 2차 D1 로 그 결정을 바꿨다 — 사용자 줄 + 물음 줄을
   * 남긴다. 저장은 `lib/easy/ask-turn.ts` 가 한다(라우트에 `role:` 글자를 새로 안 쓴다).
   */
  it("물어볼 때는 사용자 말과 물음 줄을 남긴다 (2차 D1)", () => {
    const askTurnFile = readFileSync(new URL("../../../../lib/easy/ask-turn.ts", import.meta.url), "utf8");
    expect(generate).toMatch(/askTurn\(물음맥락, \{ kind: "ratio"/);
    expect(generate.indexOf('kind: "ratio"')).toBeLessThan(generate.indexOf("await createProject("));
    expect(askTurnFile.indexOf('role: "user"')).toBeGreaterThan(0);
    expect(askTurnFile.indexOf('role: "user"')).toBeLessThan(askTurnFile.indexOf('role: "assistant"'));
  });
```

같은 파일 「사진을 물을 때도 대화에 아무것도 안 쌓는다」 `it`(264~268줄)을 아래로 바꾼다:

```ts
  /** 위 「물어볼 때는」과 같은 까닭으로 뒤집혔다(사용자 결정 2차 D1). 사진 물음도 줄을 남긴다. */
  it("사진을 물을 때도 사용자 말과 물음 줄을 남긴다 (2차 D1)", () => {
    expect(generate).toMatch(/askTurn\(물음맥락, \{\s*kind: "photo"/);
    expect(generate).toMatch(/askTurn\(ctx\.물음, \{\s*kind: "photo"/);
  });
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts` — 95줄 `const { withRowJob } = …` 아래에 더한다:

```ts
const { readAsk } = await import("../../../easy/row-marks");
const { RATIO_QUESTION } = await import("../../../easy/turn-words");
```

`describe("물을 때는 아무것도 안 남긴다 (설계 §2-5)", …)` 의 머리와 첫 `it`(173~181줄)을 아래로 바꾼다(나머지 `it` 둘은 그대로):

```ts
describe("물을 때는 말과 물음 줄을 남긴다 (2차 D1 — 설계 §2-5 의 「안 남긴다」를 바꿈)", () => {
  it("모르는 사진이 있으면 묻고, 사용자 말과 사진 물음 줄을 남긴다 — 값이 나가는 라우트는 안 부른다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });

    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }] });
    expect(json.message.id).toBe("m2");
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({
      kind: "photo",
      text: "사진을 어떻게 쓸지 알려 주세요.",
      data: { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] },
    });
    expect(부른라우트).toEqual([]);
  });

  it("모양을 물을 때 AI 가 물음으로 쓴 글이면 그것, 아니면 고정 문장으로 물음 줄을 남긴다", async () => {
    판단 = { wants: "image", reply: "", ratio: "", look: "" };
    expect((await 보낸다({})).json.asked).toBe(true);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "ratio", data: { wants: "image" }, text: RATIO_QUESTION });

    남긴줄.length = 0;
    판단 = { wants: "image", reply: "세로 포스터로 할까요, 정사각형으로 할까요?", ratio: "", look: "" };
    await 보낸다({});
    expect(readAsk(남긴줄[1] as never)?.text).toBe("세로 포스터로 할까요, 정사각형으로 할까요?");
    expect(부른라우트).toEqual([]);
  });

  /** 2차 최종 리뷰 3 — 프롬프트대로 물음 뒤에 설명을 붙여도 AI 물음을 쓴다. */
  it("AI 물음 뒤에 설명이 붙어도 그 글로 물음 줄을 남긴다", async () => {
    판단 = { wants: "image", reply: "세로로 할까요, 정사각형으로 할까요? 안 고르시면 정사각형으로 만들어요.", ratio: "", look: "" };
    await 보낸다({});
    expect(readAsk(남긴줄[1] as never)?.text).toBe("세로로 할까요, 정사각형으로 할까요? 안 고르시면 정사각형으로 만들어요.");
  });

  /** 2차 최종 리뷰 b — 옛 화면이 고른 갈래가 이겨 image 로 가면, talk 로 쓴 reply 는 모양 물음이 아니다. */
  it("코드가 갈래를 바꿔 읽으면 AI 글 대신 고정 물음을 쓴다", async () => {
    판단 = { wants: "talk", reply: "무엇을 도와드릴까요?", ratio: "", look: "" };
    await 보낸다({ kind: "image", kindPicked: true });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "ratio", text: RATIO_QUESTION });
  });
```

`apps/web/app/api/easy/__tests__/cardnews-route.test.ts` — 143줄 `const { ASK_CARD_NUMBER, … } = …` 아래에 더한다:

```ts
const { readAsk } = await import("../../../easy/row-marks");
const { KIND_QUESTION } = await import("../../../easy/turn-words");
const { NO_REFERENCE } = await import("../../../easy/cardnews-attachments");
```

갈래 묶음의 첫 `it`(171~176줄)을 바꾼다:

```ts
  it("한 장인지 여러 장인지 모르면 두 단추로 묻고 사용자 말과 물음 줄을 남긴다 (2차 D1)", async () => {
    판단 = { wants: "either", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "신메뉴 홍보물 만들어줘" });
    expect(json.kindAsk).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "kind", text: KIND_QUESTION, data: { ids: [] } });
    expect(부른라우트).toEqual([]);
  });
```

카드뉴스 원고 묶음의 앞 두 `it`(199~212줄)을 바꾼다:

```ts
  it("레퍼런스가 없으면 요청하고 사용자 말과 요청 줄을 남긴다 (2차 D1)", async () => {
    const { json } = await 보낸다({ prompt: "건강 카드뉴스" });
    expect(json.needReference).toBe(true);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "reference", text: NO_REFERENCE, data: { wants: "cardnews", ids: [] } });
    expect(부른라우트).toEqual([]);
  });

  it("분위기 참고가 없으면(제품 사진만) 레퍼런스를 요청한다 — 요청 줄에 그 사진을 적는다", async () => {
    역할판단 = 역할(["preserve_product", true]);
    const { json } = await 보낸다({ prompt: "1번 제품으로 카드뉴스", referenceIds: [사진(1)] });
    expect(json.needReference).toBe(true);
    expect(readAsk(남긴줄[1] as never)?.data).toEqual({ wants: "cardnews", ids: [사진(1)] });
    expect(부른라우트).toEqual([]);
  });
```

「모르는 사진이 있으면 카드뉴스 역할로 묻는다」 `it`(233~239줄)을 바꾼다:

```ts
  it("모르는 사진이 있으면 카드뉴스 역할로 묻고 물음 줄을 남긴다", async () => {
    역할판단 = 역할(["unclear", false]);
    const { json } = await 보낸다({ referenceIds: [사진(1)] });
    expect(json.photoAsk).toEqual({ reason: "unclear", rows: [{ id: 사진(1), role: "unclear" }], mode: "cardnews" });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "photo", data: { wants: "cardnews", mode: "cardnews", ids: [사진(1)] } });
    expect(부른라우트).toEqual([]);
  });
```

`apps/web/app/api/easy/__tests__/generate-ad.test.ts` — 88줄 `const { AD_GUIDE_FALLBACK } = …` 아래에 `const { readAsk } = await import("../../../easy/row-marks");` 를 더하고, `describe("물음 뒤의 답", …)` 안 첫 `it` 바로 뒤에 넣는다:

```ts
  it("「광고 이미지 만들기」 뒤에 모양을 물으면 물음 줄에 이어짐(cont)을 적는다 — 다음 답이 처음 말을 잇는다 (2차 D1)", async () => {
    await 보낸다({ prompt: AD_CHOICE_IMAGE });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "ratio", data: { cont: true, wants: "image" } });
    expect(부른라우트).toEqual([]);
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/turn-words.test.ts lib/easy/__tests__/ask-turn.test.ts app/api/easy/__tests__/generate-wiring.test.ts app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/cardnews-route.test.ts app/api/easy/__tests__/generate-ad.test.ts`
Expected: FAIL — `Failed to resolve import "../turn-words"` · `"../ask-turn"`, 라우트 시험은 `남긴줄` 이 `[]`

- [ ] **Step 3: `turn-words.ts` 를 만든다**

`apps/web/app/easy/turn-words.ts`:

```ts
/**
 * **물음 · 머리말 문장**(2026-10-07 2차 설계 §3-4).
 *
 * AI 가 판단과 같은 호출로 쓴 글(`reply`)을 먼저 쓴다. 비었거나 모양이 안 맞으면 여기 고정
 * 문장으로 대신한다 — 다시 묻지 않는다(값이 두 번 나간다).
 */

/** 한 장인가 여러 장인가(2단계 §4). 화면의 옛 문장 그대로다. */
export const KIND_QUESTION = "이미지 한 장으로 만들까요, 여러 장짜리 카드뉴스로 만들까요?";

/** 모양(비율 · 그림체). 묻되 막지 않는다 — 「이대로 만들기」가 늘 열려 있다(2026-09-21). */
export const RATIO_QUESTION = "어떤 모양으로 만들까요? 안 고르셔도 됩니다. 그때는 정사각형에, 적어 주신 말에 맞춰 만듭니다.";

/** 사진 물음. 다른 판단(사진 역할) 뒤에 정해져 AI 가 같은 호출로 못 쓴다 — 고정이다(2차 §4). */
export function photoQuestion(reason: "unclear" | "people"): string {
  return reason === "people"
    ? "인물을 그대로 지킬 사진은 한 장만 됩니다. 두 사람의 얼굴이 섞이기 때문이에요. 한 장만 「인물 그대로」로 골라 주세요."
    : "사진을 어떻게 쓸지 알려 주세요.";
}

const 물음표 = /[?？]/;

/**
 * 물음 줄 문장. AI 가 **물음으로** 쓴 글일 때만 그것, 아니면 고정 문장. 「?」가 **어디든** 있으면 물음이다
 * (2차 최종 리뷰 3) — 프롬프트가 「묻고, 안 골라도 정사각형이라고 덧붙이라」고 시켜 물음 뒤에 설명이 온다.
 */
export function askText(reply: string | undefined, fallback: string): string {
  const text = reply?.trim() ?? "";
  return text && 물음표.test(text) ? text : fallback;
}

/**
 * **판단 모델이 지금 실행하는 갈래로 쓴 reply 만**(2차 최종 리뷰 b). 코드가 갈래를 바꿔 읽으면(고른 갈래가
 * 이김 · 갈래 물음 뒤 either→image 등) 그 reply 는 다른 일로 쓴 글이라 `undefined` — 고정 문장이 나간다.
 * 라우트는 `aiText(decision, wants)` 로 부른다(`wants` 가 실행하는 갈래다).
 */
export function aiText(decision: { wants: string; reply: string }, executed: string): string | undefined {
  return decision.wants === executed ? decision.reply : undefined;
}
```

- [ ] **Step 4: `ask-turn.ts` 를 만든다**

`apps/web/lib/easy/ask-turn.ts`:

```ts
import { askBody, type EasyAskKind } from "../../app/easy/row-marks";
import { easyTitle } from "../../app/easy/title";
import type { EasyStore } from "./store";

/**
 * **물음 턴을 대화에 남긴다**(2026-10-07 2차 설계 D1 · §3-1, 1차 `ad-turn.ts` 의 일반화).
 *
 * 사용자 줄 + 물음 줄 두 줄이다. 남겨야 새로고침해도 물음이 보이고, 단추 대신 말로 답해도 다음
 * 판단이 앞 물음을 안다. 물음 줄 자료에 그때의 판단(갈래 · 말한 비율 · 사진 id …)을 적어 두면
 * 단추 답은 판단 모델을 다시 안 부르고 바로 간다(`app/easy/ask-chain.ts` 의 `buttonDecision`).
 *
 * 값도 예약도 없다 — 판정 예약은 이 앞에서 이미 닫혔다.
 */
export interface AskTurnContext {
  store: Pick<EasyStore, "appendMessage" | "renameConversation">;
  conversation: { title?: string | null };
  conversationId: string;
  /** 보일 말(단추 답이면 단추 글). 비어 있던 제목을 이것으로 짓는다. */
  prompt: string;
  /** 사용자 줄에 남길 글. 단추 답이면 `;pick=` 이 붙어 있다. */
  userBody: string;
  textModel: string;
  /** 이번 말이 앞 물음의 답이었나. 그러면 물음 줄에 `cont` 를 적어 사슬이 이어진다. */
  cont: boolean;
}

export async function askTurn(
  ctx: AskTurnContext,
  ask: { kind: EasyAskKind; text: string; data?: Record<string, unknown> },
  /** 옛 화면이 읽던 칸(`asked` · `kindAsk` · `photoAsk` · `needReference`). 배포 사이에도 깨지지 않게 싣는다. */
  legacy: Record<string, unknown> = {},
): Promise<Response> {
  const userMessage = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  const data = { ...(ctx.cont ? { cont: true } : {}), ...(ask.data ?? {}) };
  const message = await ctx.store.appendMessage({
    conversationId: ctx.conversationId, role: "assistant", body: askBody(ask.kind, ask.text, data),
  });
  return Response.json({ ok: true, ask: { kind: ask.kind }, message, userMessage, textModel: ctx.textModel, ...legacy });
}
```

- [ ] **Step 5: 라우트의 묻기 출구가 줄을 남긴다**

`apps/web/app/api/easy/generate/route.ts` 를 고친다(각각 Edit 한 번).

(a) import — 24줄을 바꾼다:

```ts
import { NOT_MINE, NO_REFERENCE, cardAttachmentsFrom, readChosenSlots, slotsFromWords } from "../../../easy/cardnews-attachments";
```

33줄 `import { adGuideTurn, adQuestionTurn, writeAdGuide } from "../../../../lib/easy/ad-turn";` 아래에 두 줄 더한다:

```ts
import { askTurn, type AskTurnContext } from "../../../../lib/easy/ask-turn";
import { KIND_QUESTION, RATIO_QUESTION, aiText, askText, photoQuestion } from "../../../easy/turn-words";
```

(b) 갈래 물음 — 아래를 찾아:

```ts
      : decision.wants;
    // 한 장인지 여러 장인지 모르면 묻고 아무것도 안 남긴다(2단계 §4).
    if (wants === "either") return Response.json({ ok: true, kindAsk: true, textModel });
```

이렇게 바꾼다:

```ts
      : decision.wants;

    /*
     * **물음도 대화에 남긴다**(2026-10-07 사용자 결정 2차 D1 — 2단계 §4 · 설계 §2-5 의 「아무것도
     * 안 남긴다」를 바꿨다). 사용자 줄 + 물음 줄 두 줄이라 새로고침해도 물음이 보이고, 단추 대신 말로
     * 답해도 다음 판단이 앞 물음을 안다. 저장은 `lib/easy/ask-turn.ts` 가 한다 — 값도 예약도 없다.
     * 이번 말이 앞 물음의 답이었으면 물음 줄에 `cont` 가 붙어 사슬이 이어진다(`app/easy/ask-chain.ts`).
     */
    const 물음맥락: AskTurnContext = {
      store, conversation, conversationId, prompt, userBody: prompt, textModel,
      cont: 광고 === "image" || decision.note === AD_ANSWER_NOTE,
    };
    // 물을 때의 판단(말에 있던 비율 · 그림체). 단추로 답하면 판단 모델 대신 이것을 쓴다(2차 D1).
    const 말한것 = { ...(decision.ratio ? { ratio: decision.ratio } : {}), ...(decision.look ? { look: decision.look } : {}) };
    // 한 장인지 여러 장인지 모르면 묻는다(2단계 §4). 물음 문장은 AI 가 이 갈래로 쓴 물음이 먼저다(2차 D4 · 최종 리뷰 b).
    if (wants === "either") {
      return await askTurn(물음맥락, { kind: "kind", text: askText(aiText(decision, wants), KIND_QUESTION), data: { ids: 붙인것, ...말한것 } }, { kindAsk: true });
    }
```

(c) 모양 물음 — 아래 주석을 찾아:

```ts
     * 묻기로 했으면 **아무것도 안 남기고** 그대로 돌려준다. 그림도 안 만들고
     * 대화 줄도 안 쌓는다 — 물어만 보고 사용자가 답을 안 하고 떠나면 **아무
     * 일도 일어나지 않은 것**이 맞다. 남겨 두면 답 없는 물음만 쌓인다.
```

이렇게 바꾼다:

```ts
     * 묻기로 했으면 그림을 안 만들고 사용자 줄 + 물음 줄을 남긴다(2026-10-07 2차 D1 — 예전에는
     * 「답 없이 떠나면 아무 일도 없던 것」이라 안 남겼는데, 그러면 새로고침에 물음이 사라지고 말로
     * 답할 때 앞 물음을 몰랐다). 물음 문장은 AI 가 쓴 물음이 먼저, 없으면 고정 문장이다.
```

그리고 아래를 찾아:

```ts
    if (wants === "image" && 고르기.asks) {
      return Response.json({ ok: true, asked: true, textModel });
    }
```

이렇게 바꾼다:

```ts
    if (wants === "image" && 고르기.asks) {
      return await askTurn(물음맥락, { kind: "ratio", text: askText(aiText(decision, wants), RATIO_QUESTION), data: { wants: "image" } }, { asked: true });
    }
```

(d) 카드뉴스 턴에 넘긴다 — 아래를 찾아:

```ts
        wants, 사진들, 붙인것, input, decision, provider, 고칠원고,
      });
```

이렇게 바꾼다:

```ts
        wants, 사진들, 붙인것, input, decision, provider, 고칠원고, 물음: 물음맥락, 말한것,
      });
```

(e) 사진 물음 — 아래 주석을 찾아:

```ts
     * 말을 남기기 **전에** 한다. 묻거나 멈추면 아무것도 안 남긴다 — 비율 물음과
     * 같다. 말 턴 · 상세페이지 안내 턴은 여기 오지 않으므로 사진을 안 읽는다.
```

이렇게 바꾼다:

```ts
     * 말을 남기기 **전에** 한다. 멈추면 아무것도 안 남기고, 물으면 사용자 줄 + 물음 줄을 남긴다
     * (2차 D1). 물음 줄에 사진 id 와 그때의 판단을 적어 새로고침 뒤 말로 답해도 이어진다. 사진 물음
     * 문장은 고정이다 — 이 판단 뒤에 정해져 AI 가 같은 호출로 못 쓴다(2차 §4). 말 턴 · 상세페이지
     * 안내 턴은 여기 오지 않으므로 사진을 안 읽는다.
```

그리고 아래를 찾아:

```ts
    if (사진판단?.kind === "ask") {
      return Response.json({ ok: true, photoAsk: { reason: 사진판단.reason, rows: 사진판단.rows }, textModel });
    }
```

이렇게 바꾼다:

```ts
    if (사진판단?.kind === "ask") {
      return await askTurn(물음맥락, {
        kind: "photo",
        text: photoQuestion(사진판단.reason),
        data: { wants: "image", reason: 사진판단.reason, mode: "image", rows: 사진판단.rows, ids: 붙인것, ...말한것 },
      }, { photoAsk: { reason: 사진판단.reason, rows: 사진판단.rows } });
    }
```

(f) 카드뉴스 원고 턴 — 머리 주석의 `* 카드뉴스 \`generate\` 가 잡는다. 묻거나 멈추면 아무것도 안 남긴다(1단계와 같다).` 를 `* 카드뉴스 \`generate\` 가 잡는다. 멈추면 아무것도 안 남기고, 물으면 사용자 줄 + 물음 줄을 남긴다(2차 D1).` 로 바꾼다.

ctx 모양에서 `  고칠원고: Awaited<ReturnType<typeof lastCardnewsProject>>;` 아래에 더한다:

```ts
  /** 물음 줄을 남길 때(2차 D1). */
  물음: AskTurnContext;
  /** 물을 때의 판단(말에 있던 비율 · 그림체). */
  말한것: { ratio?: string; look?: string };
```

`  const 레퍼런스요청 = () => Response.json({ ok: true, needReference: true, textModel: ctx.textModel });` 를 바꾼다:

```ts
  // 따라 만들 카드뉴스를 요청한다. 요청도 대화에 남는다(2차 D1). 문장은 고정이다.
  const 레퍼런스요청 = () => askTurn(ctx.물음, {
    kind: "reference", text: NO_REFERENCE, data: { wants: "cardnews", ids: ctx.붙인것, ...ctx.말한것 },
  }, { needReference: true });
```

아래를 찾아:

```ts
    if (판단.kind === "ask") {
      return Response.json({
        ok: true, photoAsk: { reason: 판단.reason, rows: 판단.rows, mode: "cardnews" }, textModel: ctx.textModel,
      });
    }
```

이렇게 바꾼다:

```ts
    if (판단.kind === "ask") {
      return await askTurn(ctx.물음, {
        kind: "photo",
        text: photoQuestion(판단.reason),
        data: { wants: "cardnews", reason: 판단.reason, mode: "cardnews", rows: 판단.rows, ids: ctx.붙인것, ...ctx.말한것 },
      }, { photoAsk: { reason: 판단.reason, rows: 판단.rows, mode: "cardnews" } });
    }
```

- [ ] **Step 6: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/turn-words.test.ts lib/easy/__tests__/ask-turn.test.ts app/api/easy/__tests__`
Expected: PASS (`decide-usage.test.ts` 의 「되물으면 닫는다」도 `asked: true` 로 그대로 통과)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/easy/turn-words.ts apps/web/lib/easy/ask-turn.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/__tests__/turn-words.test.ts apps/web/lib/easy/__tests__/ask-turn.test.ts apps/web/app/api/easy/__tests__/generate-wiring.test.ts apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/cardnews-route.test.ts apps/web/app/api/easy/__tests__/generate-ad.test.ts
git commit -m "feat(easy): 물을 때도 사용자 말과 물음 줄을 대화에 남긴다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: 물음에 답하는 턴 — 단추 답은 판단 없이, 말로 한 답은 앞 물음을 알고 (D1 서버 잇기)

**Files:**
- Modify: `apps/web/app/api/easy/generate/route.ts` (import · 받은 말 · 사진 확인 · 판단 · 답 방식 · 지시 · 사용자 줄 · 카드뉴스 · 고치기 · 손보기 넘김)
- Modify: `apps/web/app/easy/chat.ts` (물음 뒤 안내), `apps/web/app/easy/chat-facts.ts` (`easyAskAnswerLines`)
- Modify: `apps/web/lib/easy/image-edit-turn.ts:83-105`, `apps/web/lib/easy/cardnews-after-turn.ts:17-45` (`userBody`)
- Test: `apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts` (새), `apps/web/app/easy/__tests__/chat.test.ts` (더함), `apps/web/app/api/easy/__tests__/generate-wiring.test.ts` (더함 — 만들기 앞의 막이)

**Interfaces:**
- Consumes: Task 1 — `plainTyped`, `withPick`, `askBody`, `readAsk`. Task 2 — `ASK_ANSWER_NOTE`, `askChain`, `askInstruction`, `buttonDecision`, `chosenFor`, `readButtonAnswer`, `settleTypedAnswer`, `EasyAnswerWay`, `EasyChosen`, `EasyChainAsk`, `fitButtonDecision`, `CANNOT_DO_NOW`. Task 3 — `AskTurnContext` · `물음맥락` · `말한것`
- Produces:
  - 서버 약속(화면이 쓴다, Task 5): 단추 답 = `{ prompt: 단추 글, answersRowId: 물음 줄 id, pick: EasyPick }`, 말로 한 답 = `{ prompt }`, 사진 고르기 중 말로 친 답 = `{ prompt: 친 말, answersRowId, pick: { photoRoles, typed: true } }`. 단추 답이면 **판단 모델만** 건너뛴다 — 0크레딧 판정 예약 · 정산은 한다(2차 최종 리뷰 4)
  - `chat-facts.ts`: `easyAskAnswerLines(ask: { kind: EasyAskKind; text: string }, wants: readonly EasyWant[]): string[]` — 물음 갈래마다 답하는 법 한 줄(2차 최종 리뷰 6)
  - `imageEditTurn` ctx 에 `userBody?: string`(사용자 줄 글, 없으면 `prompt`), `cardAfterTurn` ctx 에 `userBody?: string`
  - 라우트 지역 이름(뒤 Task 가 쓴다): `지난줄`(맨 앞에서 읽는다), `단추답`, `단추판단`, `고른단추`, `물음사슬`, `이을사진`, `처음사진`, `정한사진`, `말답`(`EasyTypedAnswer | undefined`), `답방식`, `이음`, `고른`, `지시`, `사용자글`, `붙인것` · `붙인수` · `사진들`(답 방식이 정해진 뒤). 판정 예약 블록(`판정예약` … 정산)은 단추 답에도 돈다 — Task 11 이 그 `try` 의 판단 모델 쪽 갈래에 보기를 더한다
  - 프로젝트 만들기 바로 앞의 막이: `wants !== "image"` 면 `CANNOT_DO_NOW` 한 줄로 끝낸다(2차 최종 리뷰 1)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **물음에 답하는 턴**(2026-10-07 2차 설계 D1 · §3-1).
 *
 * 화면은 처음 말을 다시 보내지 않는다 — 단추 답은 `{ prompt: 단추 글, answersRowId, pick }`, 말로 한
 * 답은 `{ prompt }`. 서버가 대화 줄로 처음 말 · 답 · 고른 값 · 사진을 잇는다. 단추 답은 물음 줄의
 * 판단으로 바로 간다(판단 모델은 안 부르고, 0크레딧 판정 예약 · 정산은 한다 — 2차 최종 리뷰 4).
 */
vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 읽은사진: string[][] = [];
const 받은판단글: string[] = [];
const 센것 = { reserve: 0, decide: 0, settle: 0 };

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => {
    센것.reserve += 1;
    return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined };
  },
  settleAiUsage: async () => {
    센것.settle += 1;
    return { remaining: 0 };
  },
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄,
    appendMessage: async (row: { role: string; body?: string }) => {
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (text: string) => {
      센것.decide += 1;
      받은판단글.push(text);
      return 판단;
    },
    decideRoles: async () => ({ photos: [{ number: 1, role: "preserve_product", said: false }], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
}));
vi.mock("../../../../lib/easy/read-photos", () => ({
  readEasyPhotos: async (photos: Array<{ id: string }>) =>
    Object.fromEntries(photos.map((photo) => [photo.id, { description: "설명", hasPeople: false, hasText: false }])),
}));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => {
    읽은사진.push([...ids]);
    return ids.map((id) => ({ id, title: id, url: `https://x.test/${id}.png`, storagePath: `me-1/${id}.png` }));
  },
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, body: await req.json() });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p1" } })
      : Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { askBody, readAsk, withPick } = await import("../../../easy/row-marks");
const { NOTHING_TO_EDIT } = await import("../../../easy/chat");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

type 줄 = { id: string; role: string; body: string; workId: string | null };
const 처음: 줄 = { id: "u1", role: "user", body: "바다 풍경 포스터 만들어줘", workId: null };
const 물음 = (id: string, kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}): 줄 =>
  ({ id, role: "assistant", body: askBody(kind, "물음?", data), workId: null });
const 단추줄 = (id: string, text: string, pick: Record<string, unknown>): 줄 =>
  ({ id, role: "user", body: withPick(text, pick), workId: null });

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [];
  남긴줄.length = 0; 부른라우트.length = 0; 읽은사진.length = 0; 받은판단글.length = 0;
  센것.reserve = 0; 센것.decide = 0; 센것.settle = 0;
});

describe("단추로 한 답", () => {
  /**
   * 2차 최종 리뷰 4 — 단추 답도 0크레딧 판정 예약 · 정산은 한다. 운영자 멈춤 · 크레딧 확인이 걸리고, 뒤의 사진
   * 읽기 · 역할 판단 원가가 이 예약에 묶인다. 판단 모델만 안 부른다.
   */
  it("모양 단추면 판단 모델 없이(판정 예약 · 정산은 한다) 처음 말과 고른 비율로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    const { status } = await 보낸다({ prompt: "이대로 만들기", answersRowId: "q1", pick: { ratio: "1:1" } });
    expect(status).toBe(200);
    expect(센것).toEqual({ reserve: 1, decide: 0, settle: 1 });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘", ratio: "1:1" });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("이대로 만들기", { ratio: "1:1" }) });
  });

  it("갈래 단추 → 모양 단추로 이어지면 처음 말 · 갈래 · 비율을 잇는다", async () => {
    지난줄 = [처음, 물음("q1", "kind", { ids: [] }), 단추줄("u2", "이미지 한 장", { kind: "image" }), 물음("q2", "ratio", { cont: true, wants: "image" })];
    await 보낸다({ prompt: "이걸로 만들기 (세로)", answersRowId: "q2", pick: { ratio: "4:5" } });
    expect(센것.decide).toBe(0);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘", ratio: "4:5" });
  });

  it("새로고침 뒤 사진 물음 단추로 답하면 물음 줄의 사진으로 만든다 — 화면에 첨부가 없어도", async () => {
    지난줄 = [
      { ...처음, body: "1번 제품으로 포스터" },
      물음("q1", "photo", { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] }),
    ];
    await 보낸다({ prompt: "이걸로 만들기", answersRowId: "q1", pick: { photoRoles: [{ id: 사진(1), role: "preserve_product" }] } });
    expect(센것.decide).toBe(0);
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "1번 제품으로 포스터", preservedIds: [사진(1)] });
  });

  /** Review Focus 1 */
  it("지난 물음 줄 id 로 온 단추 답은 새 말로 본다 — 판단을 부르고 단추 값 · 물음 줄의 사진을 안 쓴다", async () => {
    지난줄 = [
      처음, 물음("q1", "photo", { wants: "image", ids: [사진(1)] }),
      { id: "u2", role: "user", body: "고마워", workId: null }, { id: "a1", role: "assistant", body: "네", workId: null },
    ];
    판단 = { wants: "talk", reply: "무엇을 도와드릴까요?", ratio: "", look: "", card: 0, note: "" };
    const { json } = await 보낸다({ prompt: "이걸로 만들기", answersRowId: "q1", pick: { photoRoles: [{ id: 사진(1), role: "preserve_product" }] } });
    expect(센것.decide).toBe(1);
    expect(읽은사진).toEqual([]);
    expect(json.talked).toBe(true);
    expect(부른라우트).toEqual([]);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "이걸로 만들기" });
  });

  it("고른 값이 모자란 단추 답(갈래 없음)은 말로 보고 판단 모델이 가른다 — 고른 값 표시도 안 붙인다", async () => {
    지난줄 = [처음, 물음("q1", "kind", { ids: [] })];
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "이미지 한 장", answersRowId: "q1", pick: {} });
    expect(센것.decide).toBe(1);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "이미지 한 장" });
  });

  /**
   * 2차 최종 리뷰 1 · Review Focus 7 — 물은 뒤 원고 · 이미지가 사라졌는데 장 · 번호 단추가 오면, 물음 줄의 판단
   * (card_text · image_edit)이 그대로 가면 아래 만들기로 새어 값이 나간다. 판단 읽기와 같은 사실로 다시 보고
   * 사실만 말한다. 판정 예약은 했다(0크레딧).
   */
  it("고칠 것이 사라진 장 · 번호 단추 답은 값 없이 사실만 말한다", async () => {
    지난줄 = [{ ...처음, body: "더 짧게 해줘" }, 물음("q1", "card", { wants: "card_text", count: 2, note: "더 짧게" })];
    const 장 = await 보낸다({ prompt: "2번", answersRowId: "q1", pick: { card: 2 } });
    expect(장.json).toMatchObject({ ok: true, talked: true, message: { body: NOTHING_TO_EDIT } });
    expect(부른라우트).toEqual([]);

    남긴줄.length = 0;
    지난줄 = [{ ...처음, body: "배경만 파랗게" }, 물음("q1", "target", { numbers: [1, 2] })];
    const 번호 = await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(번호.json).toMatchObject({ talked: true, message: { body: NOTHING_TO_EDIT } });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(부른라우트).toEqual([]);
    expect(센것).toMatchObject({ decide: 0 });
  });

  /** 2차 최종 리뷰 8 · Review Focus 8 — 사진 고르기가 열린 채 친 말은 그 물음의 답이다. 그 말도 지시에 잇는다. */
  it("사진 고르기가 열린 채 말로 친 답은 판단 모델 없이 그 말을 처음 말 뒤에 잇는다", async () => {
    지난줄 = [
      { ...처음, body: "1번 제품으로 포스터" },
      물음("q1", "photo", { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] }),
    ];
    const pick = { photoRoles: [{ id: 사진(1), role: "preserve_product" }], typed: true };
    await 보낸다({ prompt: "1번은 우리 원두 봉투야", answersRowId: "q1", pick, referenceIds: [사진(1)] });
    expect(센것).toMatchObject({ reserve: 1, decide: 0 });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "1번 제품으로 포스터\n1번은 우리 원두 봉투야", preservedIds: [사진(1)] });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("1번은 우리 원두 봉투야", pick) });
  });
});

describe("말로 한 답", () => {
  it("판단 모델이 답이라고 적으면 처음 말 + 답으로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = { wants: "image", reply: "", ratio: "4:5", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "세로로 해줘" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘\n세로로 해줘", ratio: "4:5" });
  });

  it("새로고침 뒤 사진 물음에 말로 답하면(답이라고 읽히면) 물음 줄의 사진을 쓴다", async () => {
    지난줄 = [{ ...처음, body: "이 사진으로 포스터" }, 물음("q1", "photo", { wants: "image", ids: [사진(1)] })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "1번은 우리 제품이야" });
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "이 사진으로 포스터\n1번은 우리 제품이야" });
  });

  /**
   * Review Focus 5 · 8 — 답이 아니면 앞 물음의 처음 말 · 고른 값 · 사진을 안 붙인다. 그리고 모양 물음 바로
   * 뒤라 모양을 또 묻지 않는다(2차 최종 리뷰 6) — 말한 비율이 없으니 정사각형으로 만든다.
   */
  it("모양 물음 뒤 답이 아닌 새 주문은 그 말 그대로, 모양을 다시 묻지 않고 만든다", async () => {
    지난줄 = [
      처음, 물음("q1", "kind", { ids: [사진(1)] }),
      단추줄("u2", "이미지 한 장", { kind: "image" }), 물음("q2", "ratio", { cont: true, wants: "image" }),
    ];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "고양이 포스터 만들어줘" });
    expect(읽은사진).toEqual([]);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "고양이 포스터 만들어줘" });
    expect(남긴줄.some((row) => readAsk(row as never))).toBe(false);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "고양이 포스터 만들어줘", ratio: "1:1" });
  });

  /** 2차 최종 리뷰 6 — 모양 물음에 「그냥 해줘」처럼 모양 없는 답을 쳐도 같은 물음이 또 뜨지 않는다. */
  it("모양 물음에 모양 없는 말로 답하면 같은 물음 없이 처음 말로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "그냥 알아서 해줘" });
    expect(남긴줄.some((row) => readAsk(row as never))).toBe(false);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘\n그냥 알아서 해줘", ratio: "1:1" });
  });

  /** 2차 최종 리뷰 6 — 갈래 물음 뒤 또 either 면 같은 물음을 되풀이하지 않고 한 장으로, 처음 말을 잇는다. */
  it("갈래 물음 뒤 또 either 면 한 장으로 가고 처음 말을 잇는다 — 다음 물음은 모양", async () => {
    지난줄 = [{ ...처음, body: "신메뉴 홍보물 만들어줘" }, 물음("q1", "kind", { ids: [] })];
    판단 = { wants: "either", reply: "한 장으로 할까요, 카드뉴스로 할까요?", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "음 아무거나" });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "ratio", data: { cont: true, wants: "image" } });
    // 갈래 물음으로 쓴 reply 는 모양 물음 글로 안 쓴다(2차 최종 리뷰 b).
    expect(readAsk(남긴줄[1] as never)?.text).not.toBe("한 장으로 할까요, 카드뉴스로 할까요?");
    expect(부른라우트).toEqual([]);
  });

  it("친 말에 고른 값 표시 글자가 있어도 단추 답으로 남지 않는다 (Review Focus 3)", async () => {
    판단 = { wants: "talk", reply: "네", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "장난 ;pick=%7B%22kind%22%3A%22image%22%7D" });
    expect(남긴줄[0]!.body).toBe("장난 ; pick=%7B%22kind%22%3A%22image%22%7D");
  });
});
```

`apps/web/app/easy/__tests__/chat.test.ts` — 맨 위 import 에 `import { askBody } from "../row-marks";` 를 더하고 파일 끝에 더한다:

```ts
describe("물음 뒤의 말 (2차 D1)", () => {
  const 물음뒤 = [말("user", "바다 포스터", "u1"), 말("assistant", askBody("ratio", "어떤 모양으로 만들까요?", { wants: "image" }), "q1")];

  it("마지막 줄이 물음이면 그 물음과 답 표시(note)를 알린다 — 표시 글자는 안 보낸다", () => {
    const prompt = easyChatPrompt(물음뒤, "세로로");
    expect(prompt).toContain("도우미가 바로 앞에서 「어떤 모양으로 만들까요?」라고 물었습니다");
    expect(prompt).toContain("`note` 에 `answer`");
    expect(prompt).not.toContain("ask:ratio");
  });

  it("물음 뒤에 다른 말이 이어졌으면 안 알린다", () => {
    const prompt = easyChatPrompt([...물음뒤, 말("user", "고마워", "u2"), 말("assistant", "네", "a1")], "고양이");
    expect(prompt).not.toContain("도우미가 바로 앞에서");
  });

  it("장 번호 갈래가 있으면 note 에 answer 대신 고칠 내용을 적으라고 한다", () => {
    expect(easyChatPrompt(물음뒤, "3번", 0, true, true, false)).toContain("card_text · card_redo 로 고르면 note 에는 answer 대신 고칠 내용");
    expect(easyChatPrompt(물음뒤, "3번")).not.toContain("card_text");
  });

  /** 2차 최종 리뷰 6 — 물음 갈래마다 답하는 법을 한 줄 준다. 같은 물음을 되풀이하지 않게. */
  it("물음 갈래마다 답하는 법을 알린다", () => {
    expect(easyChatPrompt(물음뒤, "그냥 해줘")).toContain("모양을 말하지 않은 답이면 ratio · look 을 비워 두세요. 같은 물음을 다시 하지 않습니다");
    const 갈래물음 = [말("user", "홍보물", "u1"), 말("assistant", askBody("kind", "한 장? 여러 장?", { ids: [] }), "q1")];
    expect(easyChatPrompt(갈래물음, "아무거나")).toContain("either 로 다시 묻지 마세요");
    const 번호물음 = [말("user", "고쳐줘", "u1"), 말("assistant", askBody("target", "몇 번?", { numbers: [1, 2] }), "q1")];
    expect(easyChatPrompt(번호물음, "1번", 0, false, false, true)).toContain("image_edit 로 고르고 target 에 그 번호");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/api/easy/__tests__/generate-ask-answer.test.ts app/easy/__tests__/chat.test.ts`
Expected: FAIL — 단추 답에도 `decide` 가 불리고(`센것.decide` 1), 지시가 단추 글, 프롬프트에 「도우미가 바로 앞에서」가 없다

- [ ] **Step 3: 물음 뒤 안내를 모든 물음으로 넓힌다**

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/**
 * 물음 갈래마다 답하는 법(2차 최종 리뷰 6). 같은 물음이 되풀이되지 않게 — 서버도 `settleTypedAnswer` 로
 * 한 번 더 본다(모양 물음 뒤에는 모양을 안 묻고, 갈래 물음 뒤 either 는 한 장으로).
 */
const 물음갈래답: Record<EasyAskKind, string> = {
  kind: "이 물음은 한 장(image)인지 카드뉴스(cardnews)인지입니다. 정하지 못한 답(「아무거나」)이면 image 입니다. either 로 다시 묻지 마세요.",
  ratio: "이 물음은 모양(비율 · 그림체)입니다. 답에 모양이 있으면 ratio · look 에 적고, 모양을 말하지 않은 답이면 ratio · look 을 비워 두세요. 같은 물음을 다시 하지 않습니다. 정사각형으로 만듭니다.",
  photo: "이 물음은 붙인 사진을 어떻게 쓸지입니다. 답이면 앞의 주문과 같은 갈래(image · cardnews)로 고르세요.",
  reference: "이 물음은 따라 만들 카드뉴스입니다. 답이면 cardnews 로 고르세요.",
  target: "이 물음은 고칠 이미지 번호입니다. 답이면 image_edit 로 고르고 target 에 그 번호(#N)를 적으세요.",
  card: "이 물음은 카드 장 번호입니다. 답이면 물을 때의 갈래(card_text · card_redo)로 고르고 card 에 그 번호를 적으세요.",
};

/**
 * 바로 앞 줄이 물음일 때(2026-10-07 2차 D1 — 1차 광고 물음 안내의 일반화). 단추 대신 말로 답해도
 * 앞 물음을 알고 가르게 한다. 답이면 서버가 물음을 부른 처음 말을 잇는다 — 대화를 붙잡지 않는다.
 */
export function easyAskAnswerLines(ask: { kind: EasyAskKind; text: string }, wants: readonly EasyWant[]): string[] {
  const 장갈래 = (["card_text", "card_redo"] as const).filter((one) => wants.includes(one));
  return [
    `**도우미가 바로 앞에서 「${ask.text}」라고 물었습니다.** 사용자의 마지막 말은 그 답일 수 있습니다.`,
    "답이면 그 물음을 부른 앞의 주문을 이어서 하는 것입니다. 앞의 주문과 같은 갈래로 고르세요.",
    물음갈래답[ask.kind],
    `마지막 말이 그 물음의 답이면 \`note\` 에 \`${AD_ANSWER_NOTE}\` 라고 적으세요. 답이 아니면 \`note\` 는 빈 글로 두세요.`,
    ...(장갈래.length ? [`단, ${장갈래.join(" · ")} 로 고르면 note 에는 answer 대신 고칠 내용을 적습니다.`] : []),
    "물음에 답하지 않고 다른 것을 말했으면(「그건 됐고 고양이 포스터 만들어줘」) 그 말대로 가르세요.",
    "",
  ];
}
```

`chat-facts.ts` 맨 위 import 에 `import type { EasyAskKind } from "./row-marks";` 를 더한다.

`apps/web/app/easy/chat.ts` — (a) 5줄 import 를 바꾸고 한 줄 더한다:

```ts
import {
  easyAdAnswerLines, easyAdWantLines, easyAskAnswerLines, easyCapabilityLines, easyFirstPhotoLines,
} from "./chat-facts";
import { askChain } from "./ask-chain";
```

(b) 아래 한 줄을 찾아:

```ts
    ...(갈래.includes("ad_specs") && adQuestionOrigin(history) !== undefined ? easyAdAnswerLines() : []),
```

바로 아래에 더한다:

```ts
    // 2차 D1: 광고 물음이 아닌 물음 뒤면 그 답일 수 있다고 알린다. 광고 물음은 바로 위 1차 안내가 맡는다.
    ...물음뒤줄(history, 갈래),
```

(c) `/**\n * 돌아온 것을 읽는다.` 바로 **앞**에 더한다:

```ts
/** 마지막 줄(단추 답 실패 짝은 건너뛴다)이 물음이면 그 물음 · 답 표시 안내(2차 D1). */
function 물음뒤줄(history: readonly EasyMessage[], 갈래: readonly EasyWant[]): string[] {
  const ask = askChain(history)?.ask;
  return ask && ask.kind !== "ad" ? easyAskAnswerLines({ kind: ask.kind, text: ask.text }, 갈래) : [];
}

```

- [ ] **Step 4: 고치기 · 손보기 턴이 사용자 줄 글을 따로 받는다**

`apps/web/lib/easy/image-edit-turn.ts` — `imageEditTurn` ctx 모양에서 `  prompt: string;` 아래에 더한다:

```ts
  /** 사용자 줄에 남길 글(단추 답이면 고른 값 표시가 붙는다, 2차 D1). 없으면 `prompt`. */
  userBody?: string;
```

같은 함수의 `  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });` 를 `  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody ?? ctx.prompt });` 로 바꾼다.

`apps/web/lib/easy/cardnews-after-turn.ts` — ctx 모양에서 `  prompt: string;` 아래에 같은 두 줄을 더하고, `    await store.appendMessage({ conversationId, role: "user", body: ctx.prompt });` 를 `    await store.appendMessage({ conversationId, role: "user", body: ctx.userBody ?? ctx.prompt });` 로 바꾼다.

- [ ] **Step 5: 라우트가 답을 잇는다**

`apps/web/app/api/easy/generate/route.ts` 를 고친다.

(a) import — `import { withRowJob } from "../../../easy/row-image";` 아래에 더한다:

```ts
import { plainTyped, withPick } from "../../../easy/row-marks";
import {
  askChain, askInstruction, buttonDecision, chosenFor, readButtonAnswer, settleTypedAnswer,
  type EasyAnswerWay, type EasyChosen,
} from "../../../easy/ask-chain";
```

`import { AD_ANSWER_NOTE, adImageInstruction, easyAdStep } from "../../../easy/ad-ask";` 를 `import { easyAdStep } from "../../../easy/ad-ask";` 로, `import type { EasyDecision } from "../../../easy/chat";` 를 `import { CANNOT_DO_NOW, fitButtonDecision, type EasyDecision } from "../../../easy/chat";` 로 바꾼다(단추 답 다시 보기 · 만들기 앞의 막이, 2차 최종 리뷰 1).

(b) 받은 말 — `  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";` 를 바꾼다:

```ts
  // 친 말에 섞인 표시 글자는 풀어 둔다 — 단추 답으로 읽히지 않게(2차 §3-0, Review Focus 3).
  const prompt = typeof input.prompt === "string" ? plainTyped(input.prompt.trim()) : "";
```

(c) 사진 확인 — 아래 줄부터:

```ts
  const 붙인것 = uniqueIds(input.referenceIds);
```

아래 줄까지를(사이의 `try {`, ⓪ 주석, `const 사진들 = …`, `고른역할` · `지난역할` 포함):

```ts
    const provider = createEasyChatProvider(process.env, textModel);
```

통째로 바꾼다:

```ts
  const 보낸사진 = uniqueIds(input.referenceIds);
  if (보낸사진.some((id) => !isPhotoId(id))) return 멈춘다(UNUSABLE_PHOTO);

  try {
    const 지난줄 = await store.listMessages(conversationId);
    /*
     * **단추로 한 답**(2026-10-07 2차 D1). 화면은 처음 말을 다시 보내지 않고 단추 글 · 물음 줄 id ·
     * 고른 값만 보낸다. **지금 마지막 물음 줄의 단추일 때만** 받는다 — 지난 물음의 단추로 지금 맥락과
     * 다른 지시에 값이 나가지 않게(Review Focus 1). 물음 줄의 판단을 만들 수 있으면 판단 모델을 다시
     * 안 부른다(`buttonDecision`). 고른 값이 모자라면 말로 본다.
     */
    const 단추답 = readButtonAnswer(input, 지난줄);
    const 단추판단 = 단추답 ? buttonDecision(단추답) : undefined;
    const 고른단추 = 단추판단 ? 단추답?.pick : undefined;
    // 말로 답할 수 있는 마지막 물음. 답인지는 판단 모델이 `note` 로 알려 준다.
    const 물음사슬 = askChain(지난줄);
    /*
     * ⓪ **사진 확인**(설계 §2-3). 이미지 만들기와 같은 함수 · 같은 회원 기준으로
     * 읽고, **요청한 사진이 전부 나왔는지** 센다. 조회는 볼 수 없는 id 를 오류
     * 없이 빼므로, 세지 않으면 사진이 빠지거나 번호가 당겨진다.
     *
     * **새로고침 뒤에 답하면 화면에 첨부가 없다**(2차 D1). 그때는 물음 줄에 적어 둔 사진을 쓴다 —
     * 단추 답은 여기서, 말로 한 답은 판단 뒤 답으로 읽혔을 때만(아래 `정한사진`).
     */
    const 사진을정한다 = async (ids: readonly string[]) => {
      const photos = ids.length
        ? await posterReferencesByIds({
          userId: auth.member.userId,
          role: auth.member.profile.role,
          teamId: await teamIdOf(auth.member.userId),
        }, [...ids])
        : [];
      return missingIds(ids, photos).length ? undefined : { ids: [...ids], photos };
    };
    const 이을사진 = (물음사슬?.photoIds ?? []).filter(isPhotoId);
    const 처음사진 = await 사진을정한다(보낸사진.length || !단추판단 ? 보낸사진 : 이을사진);
    if (!처음사진) return 멈춘다(UNUSABLE_PHOTO);
    const provider = createEasyChatProvider(process.env, textModel);
```

(d) ⓑ1 주석 아래의 `    const 지난줄 = await store.listMessages(conversationId);` 한 줄을 지운다(위로 옮겼다).

(e) `    const 광고 = easyAdStep(prompt, 지난줄);` 를 바꾼다:

```ts
    // 단추 답은 물음 줄이 갈래를 안다 — 광고 낱말을 다시 보지 않는다.
    const 광고 = 단추판단 ? undefined : easyAdStep(prompt, 지난줄);
```

(f) 판단 — 아래 첫 줄부터:

```ts
    /*
     * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
```

아래 끝 줄까지를(그 사이의 `판정예약`, `고른갈래` · `골랐나`, `let decision`, `try { … judgeEasyTurn … writeAdGuide … } catch`, 포함):

```ts
    await settleAiUsage(판정예약, true, 0, undefined, llmSettleCost());
```

통째로 바꾼다:

```ts
    // 옛 화면이 싣는 「갈래를 단추로 골랐다」(1차 A2). 판단 모델의 빈 talk 재질문을 막는 데만 쓴다.
    const 옛골랐나 = (input.kind === "image" || input.kind === "cardnews") && input.kindPicked === true;

    /*
     * **판정도 값이 나간다 — 예약부터**(설계 2026-09-30 §3.1).
     *
     * 기존 작업 이름(`poster_image`) + `easy:decide`, 0 크레딧(D1). 크레딧이 없거나
     * 운영자가 멈췄으면 여기서 막혀 글 모델을 안 부른다. 열쇠는 단계마다 가른다 —
     * 바깥 열쇠를 그대로 쓰면 뒤의 기획·생성 예약이 `duplicate_request` 로 막힌다.
     * 대신 부르는 세 라우트와 같은 규칙으로 요청 식별자를 가른다. 이것이 네 번째 단계(`decide`)다.
     *
     * **단추 답도 이 예약은 한다**(2차 최종 리뷰 4). 글 모델만 안 부른다 — 운영자 멈춤 · 크레딧 확인이 그대로
     * 걸리고, 뒤의 사진 읽기 · 역할 판단 · 끝 장 글의 원가가 이 예약(`bindAiCaller`)에 묶인다.
     */
    const 판정예약 = await reserveAiUsage(
      relay(request, "/api/easy/generate", {}, "decide"), "poster_image", 0, freeCreditPlan("easy:decide"),
    );
    if (!판정예약.ok) return 판정예약.response;

    let decision: EasyDecision;
    let 광고안내 = "";
    try {
      if (단추판단) {
        /*
         * 단추 답은 물음 줄의 판단으로 바로 간다 — 글 모델을 안 부른다(2차 D1, 값 한 번 절약). 물은 뒤 고칠
         * 것이 사라졌으면 판단 읽기와 같은 사실로 다시 보고 사실만 말한다 — 다른 일로 새지 않는다
         * (`fitButtonDecision`, 2차 최종 리뷰 1).
         */
        decision = fitButtonDecision(단추판단, { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: Boolean(고칠그림) });
      } else {
        // 한 턴의 판단 — 선택지(A1) · 빈 답 재질문(A3)은 `lib/easy/judge.ts` 가 한다.
        decision = await judgeEasyTurn({
          decide: (text, wants) => provider.decide(text, wants),
          history: 지난줄.map((row) => ({ id: row.id, role: row.role, body: row.body })),
          prompt,
          // 붙인 것이 있는지 알려 준다. 안 알려 주면 「이걸로 하나 그려줘」를 되묻는다(2026-09-21 실측).
          attachmentCount: 처음사진.ids.length,
          choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },
          // 골랐으면 판단의 갈래는 버려진다 — 빈 talk 재질문을 안 한다(A3 · 최종 리뷰).
          kindPicked: 옛골랐나,
          adStep: 광고,
        });
        /*
         * **규격 안내는 글 모델이 우리 기능의 사실로 쓴다**(A5). 판정과 같은 예약 안에서 부른다.
         * 갈래를 단추로 골랐으면 쓰지 않는다 — 아래에서 고른 갈래가 이겨 이 글은 버려진다. 이미지 수는
         * 서로 다른 포스터 작업만 센다(`countEasyImages`). 글 모델이 실패해도 코드가 쓴 안내로 대신한다.
         */
        if (decision.wants === "ad_specs" && !옛골랐나) {
          광고안내 = await writeAdGuide((text) => provider.writeAdGuide(text), {
            prompt,
            imageCount: await countEasyImages(auth.member.userId, 지난줄),
          });
        }
      }
    } catch (error) {
      await settleAiUsage(판정예약, false, 0, "easy_decide_failed", llmSettleCost());
      throw error;
    }
    await settleAiUsage(판정예약, true, 0, undefined, llmSettleCost());

    /*
     * **말로 한 답의 갈래 정리**(2차 최종 리뷰 6). 바로 앞 물음의 갈래로 판단을 한 번 더 본다 — 모양 물음
     * 뒤에는 모양을 다시 안 묻고, 갈래 물음 뒤 또 either 면 한 장으로, 번호 · 장 물음 바로 뒤 그 갈래면
     * note 가 없어도 답이다(`settleTypedAnswer`). 단추 답은 물음 줄의 판단이라 안 건다.
     */
    const 말답 = 단추판단 ? undefined : settleTypedAnswer(물음사슬?.ask, decision);
    if (말답) decision = 말답.decision;

    /*
     * **이번 말이 앞 물음의 답인가**(2차 D1). 단추 답(물음 줄 단추 · 광고 단추)이면 「단추」(사진 고르기 중
     * 말로 친 답은 「말」 — 그 말도 잇는다), 말로 한 답은 위 정리가 답이라고 본 때만 「말」. 답이면 물음을
     * 부른 처음 말 + 그 뒤의 답들로 만들고(`askInstruction`), 앞서 단추로 고른 값을 잇는다(`chosenFor`).
     * 답이 아니면 이번 말 그대로 — 새로 친 말에 옛 값 · 옛 사진이 몰래 붙지 않는다(Review Focus 5).
     */
    const 답방식: EasyAnswerWay = 단추판단 || 광고 === "image"
      ? (고른단추?.typed ? "typed" : "button")
      : 말답?.answered ? "typed" : "none";
    const 이음 = 답방식 === "none" ? undefined : 물음사슬;
    const 정한사진 = 답방식 === "typed" && !보낸사진.length && 이을사진.length ? await 사진을정한다(이을사진) : 처음사진;
    if (!정한사진) return 멈춘다(UNUSABLE_PHOTO);
    const 붙인것 = 정한사진.ids;
    const 붙인수 = 붙인것.length;
    const 사진들 = 정한사진.photos;
    const 고른 = chosenFor(input, 이음, 고른단추);
    const 고른역할 = readChosenRoles(고른.photoRoles, 붙인것);
    // 지난 역할도 고른 값과 같은 검사를 한다 — ⓪ 목록 밖 · 모르는 역할 · 겹친 id 는 버린다.
    const 지난역할 = readChosenRoles(input.previousRoles, 붙인것);
    const 고른갈래 = 고른.kind;
    /*
     * 고른 갈래가 판단을 이기는 것(1차 A2)은 **판단 모델이 다시 가른 턴**에만이다. 단추 답의 판단은 물음 줄의
     * 갈래 그대로고, 고칠 것이 사라져 사실 문장(talk)이 된 단추 답을 고른 갈래가 만들기로 되돌리면 값이 나간다
     * (2차 최종 리뷰 1).
     */
    const 골랐나 = Boolean(고른갈래) && 고른.kindPicked && !단추판단;
    const 지시 = askInstruction(이음, prompt, 답방식);
    // 단추 답이면 사용자 줄에 고른 값을 함께 적는다 — 다음 물음 · 실패 뒤 다시 답할 때 그 값을 잇는다.
    const 사용자글 = 고른단추 ? withPick(prompt, 고른단추) : prompt;
```

(g) 물음 맥락 — Task 3 이 넣은 아래 두 줄을 찾아:

```ts
      store, conversation, conversationId, prompt, userBody: prompt, textModel,
      cont: 광고 === "image" || decision.note === AD_ANSWER_NOTE,
```

이렇게 바꾼다:

```ts
      store, conversation, conversationId, prompt, userBody: 사용자글, textModel,
      cont: 답방식 !== "none",
```

(h) 손보기 · 고치기 넘김 — `        request, userId: auth.member.userId, store, conversationId, prompt, textModel, wants, decision, provider,` 를 `        request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel, wants, decision, provider,` 로, `        request, userId: auth.member.userId, store, conversationId, prompt, textModel,` 를 `        request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel,` 로 바꾼다.

(i) 고른 비율 · 그림체 — 아래 두 줄을 찾아:

```ts
      chosenRatio: typeof input.ratio === "string" ? input.ratio : undefined,
      chosenLook: typeof input.look === "string" ? input.look : undefined,
```

이렇게 바꾼다:

```ts
      // 단추로 고른 것(이번 단추 · 이어진 물음의 단추), 없으면 옛 화면이 보낸 칸(2차 D1).
      chosenRatio: 고른.ratio,
      chosenLook: 고른.look,
```

(j) 카드뉴스 턴에 넘긴다 — Task 3 이 고친 `        wants, 사진들, 붙인것, input, decision, provider, 고칠원고, 물음: 물음맥락, 말한것,` 를 `        wants, 사진들, 붙인것, input, decision, provider, 고칠원고, 물음: 물음맥락, 말한것, 고른, 지시, userBody: 사용자글,` 로 바꾼다.

(k) 옛 지시 조립을 지운다 — 아래 주석과 두 줄을 통째로 지운다(지시는 (f) 에서 정했다):

```ts
    /*
     * **광고 물음에 답해 만드는 이미지는 물음 앞의 말로 그린다**(A5). 단추만 눌렀으면 그
     * 말 그대로, 말로 답했으면 그 말 + 답. 물음 뒤가 아니면 이번 말 그대로다.
     *
     * **답일 때만 잇는다**(최종 리뷰 2026-10-06) — 「광고 이미지 만들기」 단추를 눌렀거나,
     * 판단 모델이 이 말을 물음의 답이라고 `note` 에 표시했을 때. 물음 뒤에 「그건 됐고 고양이
     * 포스터 만들어줘」라고 했는데 처음 말을 붙이면 엉뚱한 것을 그린다.
     */
    const 답했나 = 광고 === "image" || decision.note === AD_ANSWER_NOTE;
    const 지시 = adImageInstruction(지난줄, prompt, 답했나) ?? prompt;
```

(l) 사용자 줄 — `    await store.appendMessage({ conversationId, role: "user", body: prompt });` 를 `    await store.appendMessage({ conversationId, role: "user", body: 사용자글 });` 로 바꾼다(글자 `role: "user"` 는 그대로 이 자리에 남는다).

(m) 카드뉴스 원고 턴 — ctx 모양의 `  말한것: { ratio?: string; look?: string };` 아래에 더한다:

```ts
  /** 이번 턴의 고른 값(단추 · 이어진 물음, 2차 D1). */
  고른: EasyChosen;
  /** 만들 때 쓰는 지시 = 처음 말 + 답들(답이 아니면 이번 말). */
  지시: string;
  /** 사용자 줄에 남길 글. */
  userBody: string;
```

그리고 함수 안에서 각각 바꾼다:
- `    입력 = redraftInput(ctx.고칠원고, { words: ctx.prompt });` → `    입력 = redraftInput(ctx.고칠원고, { words: ctx.지시 });`
- `    const 내용 = pickCardSource(ctx.prompt, { webEnabled: isWebSourceEnabled() });` → `    const 내용 = pickCardSource(ctx.지시, { webEnabled: isWebSourceEnabled() });`
- `        words: ctx.prompt,` → `        words: ctx.지시,`
- `        chosen: readChosenRoles(ctx.input.photoRoles, ctx.붙인것, { cardnews: true }),` → `        chosen: readChosenRoles(ctx.고른.photoRoles, ctx.붙인것, { cardnews: true }),`
- `      slots: { ...slotsFromWords(ctx.prompt, ctx.붙인것), ...readChosenSlots(ctx.input.photoSlots, ctx.붙인것) },` → `      slots: { ...slotsFromWords(ctx.지시, ctx.붙인것), ...readChosenSlots(ctx.고른.photoSlots, ctx.붙인것) },`
- `      title: easyTitle(ctx.prompt) || "카드뉴스",` → `      title: easyTitle(ctx.지시) || "카드뉴스",`
- `  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.prompt });` → `  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody });`

(n) 모양 물음을 되풀이하지 않는다(2차 최종 리뷰 6) — Task 3 이 고친 아래 줄을 찾아:

```ts
    if (wants === "image" && 고르기.asks) {
```

이렇게 바꾼다:

```ts
    // 모양 물음 바로 뒤의 말이면 답이든 아니든 같은 물음을 또 하지 않는다 — 말한 비율이 없으면 정사각형(2차 최종 리뷰 6).
    if (wants === "image" && 고르기.asks && (말답?.askRatio ?? true)) {
```

(o) **프로젝트 만들기 앞의 막이**(2차 최종 리뷰 1) — 아래 줄을 찾아:

```ts
    // ① 프로젝트
```

바로 **앞**에 더한다:

```ts
    /*
     * **만들기는 image 갈래만 간다**(2차 최종 리뷰 1 · Review Focus 7). 쓸 수 없게 된 갈래(고칠 것이 사라진
     * 단추 답 · 원고 없는 장 손보기 등)가 위의 갈래들을 다 지나 여기까지 오면, 사용자가 바라지 않은 새 이미지에
     * 값이 나간다. 사용자 줄은 이미 남았다 — 안내 한 줄로 끝낸다. 값은 안 든다.
     */
    if (wants !== "image") {
      const saved = await store.appendMessage({ conversationId, role: "assistant", body: CANNOT_DO_NOW });
      return Response.json({ ok: true, talked: true, message: saved, textModel });
    }

```

`apps/web/app/api/easy/__tests__/generate-wiring.test.ts` — 「말과 주문을 가르는 자리」 묶음 끝에 더한다(행동으로는 단추 답 다시 보기가 먼저 막아 이 자리에 닿는 길이 없다 — 마지막 막이가 남아 있는지 글자로 잰다):

```ts
  /** 2차 최종 리뷰 1 · Review Focus 7 — 쓸 수 없게 된 갈래가 만들기로 새지 않게 마지막으로 막는다. */
  it("프로젝트를 만들기 바로 앞에서 image 가 아닌 갈래를 끝낸다", () => {
    const 막이 = generate.indexOf('if (wants !== "image")');
    expect(막이).toBeGreaterThan(generate.indexOf('(wants === "detail_page")'));
    expect(막이).toBeLessThan(generate.indexOf("await createProject("));
    expect(generate.slice(막이, generate.indexOf("await createProject("))).toContain("CANNOT_DO_NOW");
  });
```

- [ ] **Step 6: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/api/easy/__tests__ app/easy/__tests__/chat.test.ts app/easy/__tests__/chat-wants.test.ts lib/easy/__tests__`
Expected: PASS — 1차의 광고 물음 시험(`generate-ad.test.ts`: 「광고 이미지 만들기」 단추 → 처음 말, 말로 「광고 이미지로요」 + `note` → 처음 말 + 답, 「그건 됐고 고양이 포스터」 → 그 말 그대로)이 새 `askInstruction` 으로 그대로 통과한다. `decide-usage.test.ts` 의 예약 · 정산 차례도 그대로다(단추 답도 같은 예약 블록을 지난다)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `grep -c 'role: "user"' apps/web/app/api/easy/generate/route.ts`
Expected: `2` (턴의 사용자 줄 · 카드뉴스 원고 턴 — 새로 안 늘었다)

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/api/easy/generate/route.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/image-edit-turn.ts apps/web/lib/easy/cardnews-after-turn.ts apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts apps/web/app/api/easy/__tests__/generate-wiring.test.ts apps/web/app/easy/__tests__/chat.test.ts
git commit -m "feat(easy): 물음 줄 단추 답은 판단 없이 잇고 말로 한 답은 처음 말과 이어 만든다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: 화면 — 묻기 상태 · 렌더를 빼고, 물음은 줄 단위로, 새 보내기 약속 (D1 화면 · §3-6)

> **이 Task 가 첫 화면 Task 다.** `easy-client.tsx` 는 지금 정확히 800줄(상한)이다. 묻기 상태 넷(`asking` · `askRatio`/`askLook` · `photoAsking` · 카드뉴스 쪽 `kindAsking`/`referenceAsking`)과 그 렌더를 **먼저 빼서 줄이고**, 그 다음 Task(6 · 7 · 9)가 줄을 더한다.

**Files:**
- Create: `apps/web/app/easy/ask-answers.ts`, `apps/web/app/easy/use-easy-asks.ts`, `apps/web/app/easy/_components/ask-row.tsx`
- Modify: `apps/web/app/easy/easy-client.tsx:18-30, 119-136, 228-233, 253-255, 294-345, 362-403, 466, 507, 520-568, 616, 703`
- Modify: `apps/web/app/easy/use-cardnews.ts:12-15, 56-62, 127-138, 146-149, 189-194`, `apps/web/app/easy/cardnews-state.ts:95-109`
- Modify: `apps/web/app/easy/_components/message.tsx:152-170, 208-210`, `kind-ask.tsx`, `ask-choice.tsx:44-47`, `photo-ask.tsx:38, 42, 51, 61-68`, `reference-ask.tsx:5, 61`
- Delete: `apps/web/app/easy/turn-carry.ts`, `apps/web/app/easy/__tests__/turn-carry.test.ts`, `apps/web/app/easy/__tests__/kind-picked-wiring.test.ts`, `apps/web/app/easy/_components/cardnews-asks.tsx` (새 약속에서 갈래 · 비율 잇기는 서버가 줄로 한다 — 1차 B1 은 `ratioReply`, B2 · A2 는 Task 2 의 `chosenFor` 시험이 맡는다)
- Test: `apps/web/app/easy/__tests__/ask-answers.test.ts` (새), `apps/web/app/easy/__tests__/message-row.test.tsx` (고침 · 더함), `apps/web/app/easy/__tests__/shell-wiring.test.ts` (고침), `apps/web/app/easy/__tests__/cardnews-state.test.ts:3, 58-74` (고침), `apps/web/app/easy/__tests__/collect.test.ts:74-78` (고침 — 실패 뒤 입력창 되채우기 글자)

**Interfaces:**
- Consumes: Task 1 — `askBody`, `readAsk`, `visibleBody`, `withPick`. Task 2 — `EasyPick`, `answerableAskId`. Task 3 — 물음 응답 `{ ok, ask: { kind }, message, userMessage, photoAsk? }`. Task 4 — 단추 답 약속 `{ prompt, answersRowId, pick }`(사진 고르기 중 말로 친 답은 `pick.typed: true`)
- Produces:
  - `ask-answers.ts`: `export interface EasyButtonReply { text: string; answersRowId: string; pick: EasyPick }`, `KIND_REPLY_TEXT: { image: "이미지 한 장"; cardnews: "카드뉴스 여러 장" }`, `kindReply(rowId, kind)`, `ratioReply(rowId, { ratio, look })`, `photoReply(rowId, state: PhotoAskState)`, `photoTypedReply(rowId, state: PhotoAskState, text: string)`(2차 최종 리뷰 8), `referenceReply(rowId, answer: Pick<EasyResend, "photoRoles" | "photoSlots">)` — 모두 `EasyButtonReply`
  - 화면이 단추를 다는 자리 = `answerableAskId(shown)`(마지막 물음 줄, 또는 단추 답이 실패한 짝 바로 앞의 물음 줄 — 2차 최종 리뷰 2). 단추로 보낸 사용자 줄은 화면에서도 `withPick(글, 고른 값)` 으로 든다(그래야 그 자리에서 실패했을 때 그 물음 줄을 알아본다)
  - `use-easy-asks.ts`: `useEasyAsks()` → `{ ratio, look, photo: { rowId; state: PhotoAskState } | null, referenceRowId: string | null, setRatio, setLook, open(rowId, body), close(), pickPhoto(id, role), dropPhoto() }`, `export type EasyAsks = ReturnType<typeof useEasyAsks>`
  - `_components/ask-row.tsx`: `EasyAskControls({ message, asks, attachments, library, onAttach, onAnswer })` — 물음 줄이 아니면 `null`. Task 8 · 10 이 `target` · `card` 를 더한다
  - `message.tsx` 의 `EasyMessageRow` 에 `askControls?: React.ReactNode`
  - `easy-client.tsx` 의 `send(보낼것?: EasyButtonReply | { text: string })`
  - `use-cardnews.ts` 의 `take(body)`(두 번째 인자 없음)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/ask-answers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EASY_DEFAULT_RATIO, easyAsk } from "../ask";
import { KIND_REPLY_TEXT, kindReply, photoReply, photoTypedReply, ratioReply, referenceReply } from "../ask-answers";
import { pickPhoto, startPhotoAsk } from "../photo-ask-state";

/**
 * **단추 답**(2026-10-07 2차 설계 D1). 화면은 처음 말을 다시 보내지 않는다 — 단추 글 · 물음 줄 id ·
 * 고른 값만 보낸다. 서버가 물음 줄의 판단으로 바로 간다(판단 모델 생략).
 */
describe("단추 답", () => {
  it("갈래 단추는 그 글과 갈래를 싣는다", () => {
    expect(kindReply("q1", "image")).toEqual({ text: KIND_REPLY_TEXT.image, answersRowId: "q1", pick: { kind: "image" } });
    expect(kindReply("q1", "cardnews").text).toBe("카드뉴스 여러 장");
  });

  /** 1차 B1 — 아무것도 안 골랐으면 기본 비율을 고른 값으로 싣는다. 그래야 서버가 또 묻지 않는다. */
  it("「이대로 만들기」는 기본 비율을 고른 값으로 싣는다", () => {
    const reply = ratioReply("q1", { ratio: "", look: "" });
    expect(reply).toEqual({ text: "이대로 만들기", answersRowId: "q1", pick: { ratio: EASY_DEFAULT_RATIO } });
    expect(easyAsk({ attachmentCount: 0, chosenRatio: reply.pick.ratio }).asks).toBe(false);
  });

  it("고른 비율 · 그림체는 글에 보이고 그대로 싣는다", () => {
    const reply = ratioReply("q1", { ratio: "9:16", look: "" });
    expect(reply.text).toMatch(/^이걸로 만들기 \(.+\)$/);
    expect(reply.pick).toEqual({ ratio: "9:16" });
  });

  it("사진 단추는 모든 줄의 고른 쓰임을 싣는다", () => {
    const state = pickPhoto(startPhotoAsk("", "unclear", [{ id: "a", role: "unclear" }, { id: "b", role: "style" }]), "a", "preserve_product");
    expect(photoReply("q1", state).pick).toEqual({ photoRoles: [{ id: "a", role: "preserve_product" }, { id: "b", role: "style" }] });
  });

  /**
   * 2차 최종 리뷰 8 — 사진 고르기가 열린 채 말로 치면 그 말 + 손댄 줄의 쓰임을 그 물음의 답으로 보낸다
   * (1차 `photoAnswer(state, 말)` 그대로). `typed` 라 서버가 그 말을 처음 말 뒤에 잇는다.
   */
  it("사진 고르기 중 말로 친 답은 그 말과 손댄 줄의 쓰임을 typed 로 싣는다", () => {
    const state = pickPhoto(startPhotoAsk("", "unclear", [{ id: "a", role: "unclear" }, { id: "b", role: "style" }]), "a", "preserve_product");
    expect(photoTypedReply("q1", state, "1번은 우리 원두 봉투야")).toEqual({
      text: "1번은 우리 원두 봉투야", answersRowId: "q1", pick: { photoRoles: [{ id: "a", role: "preserve_product" }], typed: true },
    });
  });

  it("레퍼런스 답은 카드뉴스 갈래와 분위기 참고 · 자리를 싣는다", () => {
    expect(referenceReply("q1", { photoRoles: [{ id: "a", role: "style" }], photoSlots: [] })).toEqual({
      text: "이걸로 만들기", answersRowId: "q1", pick: { kind: "cardnews", photoRoles: [{ id: "a", role: "style" }] },
    });
  });

  it("단추 글에 줄표가 없다", () => {
    for (const text of [KIND_REPLY_TEXT.image, KIND_REPLY_TEXT.cardnews, ratioReply("q", { ratio: "4:5", look: "" }).text]) {
      expect(text).not.toContain("—");
    }
  });
});
```

`apps/web/app/easy/__tests__/message-row.test.tsx` — (a) 맨 위 `vi.mock` 셋 아래에 한 줄 더한다:

```ts
vi.mock("../_components/reference-ask", () => ({ EasyReferenceAsk: () => null }));
```

(b) import 를 더한다(Task 1 의 `row-marks` import 줄을 바꾼다):

```ts
import { askBody, sayBody, withPick } from "../row-marks";
import { EasyAskControls } from "../_components/ask-row";
import { KIND_REPLY_TEXT } from "../ask-answers";
import { EASY_DEFAULT_RATIO } from "../ask";
```

(c) 「화면이 마지막 물음에만 단추를 단다 (Review Focus 1)」 묶음(65~79줄)을 통째로 바꾼다:

```tsx
describe("화면이 마지막 물음에만 단추를 단다 (Review Focus 1)", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  /**
   * 지금 답할 수 있는 물음 줄(서버가 받아 줄 줄 — `answerableAskId`)이고 보내는 중이 아닐 때만. 단추 답이
   * 실패한 짝 바로 앞의 물음 줄도 다시 단다(2차 최종 리뷰 2) — 실패한 뒤 같은 단추를 다시 누를 수 있다.
   */
  it("지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만 단추를 넘긴다 — 광고 단추 · 물음 줄 단추 둘 다", () => {
    expect(화면).toContain("const 답할물음 = answerableAskId(shown);");
    expect(화면).toContain(
      "onAdChoice={message.id === 답할물음 && !turn.busy ? (answer) => void send({ text: answer }) : undefined}",
    );
    expect(화면).toMatch(/askControls=\{message\.id === 답할물음 && !turn\.busy \? \(/);
  });

  it("처음 말을 다시 보내지 않고 물음 줄 id 와 고른 값만 싣는다 (2차 D1)", () => {
    expect(화면).toContain("...(단추 ? { answersRowId: 단추.answersRowId, pick: 단추.pick } : {}),");
    expect(화면).not.toContain("carryChoices");
    expect(화면).not.toContain("kindPicked");
  });

  /** 화면의 사용자 줄도 고른 값을 들어야 그 자리에서 실패했을 때 [물음, 단추 답] 을 알아본다(2차 최종 리뷰 2). */
  it("단추로 보낸 사용자 줄은 고른 값 표시를 붙여 든다 — 보일 때는 뗀다", () => {
    expect(화면).toContain('role: "user", body: 단추 ? withPick(prompt, 단추.pick) : prompt');
  });

  /** 2차 최종 리뷰 8 — 사진 고르기가 열린 채 친 말은 그 물음의 답이다(입력창 안내와 같다). */
  it("사진 고르기가 열린 채 말로 치면 그 물음 줄 id · 고른 쓰임과 함께 답으로 보낸다", () => {
    expect(화면).toContain("!보낼것 && asks.photo ? photoTypedReply(asks.photo.rowId, asks.photo.state, prompt) : undefined");
  });

  it("단추로 보낸 턴이 실패해도 단추 글을 입력창에 넣지 않는다", () => {
    expect(화면).toContain("if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);");
    expect(화면).not.toMatch(/\n\s*setDraft\(prompt\);/);
  });
});

describe("물음 줄의 단추 · 고르기 (2차 D1)", () => {
  const 고르기 = {
    ratio: "", look: "", photo: null, referenceRowId: null,
    setRatio: vi.fn(), setLook: vi.fn(), open: vi.fn(), close: vi.fn(), pickPhoto: vi.fn(), dropPhoto: vi.fn(),
  };
  const 그린다 = (message: { id: string; role: "assistant"; body: string }, onAnswer: (reply: unknown) => void) => (
    <EasyMessageRow
      message={message}
      askControls={<EasyAskControls message={message} asks={고르기 as never} attachments={[]} library={{} as never} onAttach={vi.fn()} onAnswer={onAnswer} />}
    />
  );

  it("갈래 물음 줄은 문장 밑에 두 단추를 달고, 누르면 줄 id 와 고른 갈래를 보낸다", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q1", role: "assistant" as const, body: askBody("kind", "한 장으로 만들까요?", { ids: [] }) };
    act(() => { view = create(그린다(물음, onAnswer)); });
    expect(글()).toContain("한 장으로 만들까요?");
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual([KIND_REPLY_TEXT.image, KIND_REPLY_TEXT.cardnews]);
    act(() => { 단추[1]!.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: KIND_REPLY_TEXT.cardnews, answersRowId: "q1", pick: { kind: "cardnews" } });
  });

  it("다시 연 모양 물음 줄은 토글과 「이대로 만들기」가 그대로 나온다", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q2", role: "assistant" as const, body: askBody("ratio", "어떤 모양으로 만들까요?", { wants: "image" }) };
    act(() => { view = create(그린다(물음, onAnswer)); });
    const 만들기 = view.root.findAllByType("button").find((one) => 글자(one) === "이대로 만들기")!;
    act(() => { 만들기.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: "이대로 만들기", answersRowId: "q2", pick: { ratio: EASY_DEFAULT_RATIO } });
  });

  it("다시 연 사진 물음 줄은 고르기 없이 문장만 보인다 — 말로 이어 답한다", () => {
    const 물음 = { id: "q3", role: "assistant" as const, body: askBody("photo", "사진을 어떻게 쓸지 알려 주세요.", { ids: ["a"] }) };
    act(() => { view = create(그린다(물음, vi.fn())); });
    expect(글()).toContain("사진을 어떻게 쓸지 알려 주세요.");
    expect(view.root.findAllByType("button")).toHaveLength(0);
  });
});
```

`apps/web/app/easy/__tests__/shell-wiring.test.ts` — (a) 「사진 물음이 떠 있을 때의 입력창」의 정규식을 바꾼다:

```ts
    expect(client).toMatch(/placeholder=\{[\s\S]{0,400}asks\.photo[\s\S]{0,160}사진 물음에 대한 답/);
```

(b) 「카드뉴스 화면 잇기 (2단계)」 묶음 머리의 `  const 물음 = 코드("../_components/cardnews-asks.tsx");` 를 지우고, 첫 `it` 을 바꾼다:

```ts
  it("한 장 · 카드뉴스 물음과 레퍼런스 요청은 물음 줄 밑의 단추 · 고르기로 그린다 (2차 D1)", () => {
    const 물음줄 = 코드("../_components/ask-row.tsx");
    expect(화면쪽).toContain("<EasyAskControls");
    expect(물음줄).toContain("<EasyKindAsk");
    expect(물음줄).toContain("<EasyReferenceAsk");
  });
```

`apps/web/app/easy/__tests__/cardnews-state.test.ts` — 3줄 import 에서 `continuingKind, ` 를 지우고, `describe("고른 갈래가 이어진다 (2단계 §4)", …)` 묶음(58~74줄)을 통째로 지운다(갈래 잇기는 서버의 `chosenFor` 가 한다 — Task 2 시험).

`apps/web/app/easy/__tests__/collect.test.ts` — 「만든 직후 15분을 넘겨 그만두면 입력창에 같은 말을 다시 채우지 않는다」(74~78줄)는 `send` 의 옛 인자 이름(`친말`)을 글자로 잰다. 새 약속(`보낼것`)으로 바꾼다 — 뜻은 같다(단추로 보낸 턴은 안 채우고, 15분 넘김도 안 채운다):

```ts
    /** 재리뷰: 입력창에 같은 말을 다시 채우면 엔터 한 번에 값이 또 나간다. 크레딧 · 권한 실패는 그대로 채운다. */
    it("만든 직후 15분을 넘겨 그만두면 입력창에 같은 말을 다시 채우지 않는다", () => {
      expect(readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8"))
        .toContain("if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);");
    });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/ask-answers.test.ts app/easy/__tests__/message-row.test.tsx app/easy/__tests__/shell-wiring.test.ts app/easy/__tests__/collect.test.ts`
Expected: FAIL — `Failed to resolve import "../ask-answers"` · `"../_components/ask-row"`, `collect.test.ts` 는 화면에 `!보낼것` 글자가 아직 없다

- [ ] **Step 3: `ask-answers.ts` · `use-easy-asks.ts` 를 만든다**

`apps/web/app/easy/ask-answers.ts`:

```ts
import { EASY_DEFAULT_RATIO, EASY_LOOKS, EASY_RATIOS } from "./ask";
import type { EasyPick } from "./ask-chain";
import type { EasyResend } from "./cardnews-state";
import { photoAnswer, type PhotoAskState } from "./photo-ask-state";

/**
 * **단추로 한 답**(2026-10-07 2차 설계 D1 · §3-1). 화면이 보내는 것은 단추 글 · 물음 줄 id · 고른
 * 값뿐이다 — 처음 말은 서버가 대화 줄에서 잇는다. 화면 안에 두면 값으로 못 잰다.
 */
export interface EasyButtonReply {
  /** 사용자 말로 보일 글. */
  text: string;
  answersRowId: string;
  pick: EasyPick;
}

export const KIND_REPLY_TEXT = { image: "이미지 한 장", cardnews: "카드뉴스 여러 장" } as const;

export function kindReply(rowId: string, kind: "image" | "cardnews"): EasyButtonReply {
  return { text: KIND_REPLY_TEXT[kind], answersRowId: rowId, pick: { kind } };
}

/**
 * 「이대로 만들기」(1차 B1): 아무것도 안 골랐으면 **기본 비율을 고른 값으로** 싣는다. 빈 값으로
 * 보내면 서버가 「안 골랐다」로 보고 같은 물음을 또 띄운다.
 */
export function ratioReply(rowId: string, picked: { ratio: string; look: string }): EasyButtonReply {
  const 이름 = [
    EASY_RATIOS.find((one) => one.id === picked.ratio)?.label,
    EASY_LOOKS.find((one) => one.id === picked.look)?.label,
  ].filter(Boolean).join(" · ");
  return {
    text: 이름 ? `이걸로 만들기 (${이름})` : "이대로 만들기",
    answersRowId: rowId,
    pick: { ratio: picked.ratio || EASY_DEFAULT_RATIO, ...(picked.look ? { look: picked.look } : {}) },
  };
}

/** 사진 단추 — 모든 줄의 고른 쓰임을 싣는다. 서버는 고른 사진을 안 읽는다(설계 §2-5). */
export function photoReply(rowId: string, state: PhotoAskState): EasyButtonReply {
  return { text: "이걸로 만들기", answersRowId: rowId, pick: { photoRoles: photoAnswer(state).photoRoles } };
}

/**
 * 사진 고르기가 열린 채 **말로 친 답**(1차 설계 §2-5 그대로, 2차 최종 리뷰 8). 입력창 안내도 「위 사진 물음에
 * 대한 답으로 보냅니다」다. 그 말과 손댄 줄의 쓰임을 그 물음의 답으로 싣는다 — `typed` 라 서버가 그 말을
 * 처음 말 뒤에 잇는다. 이 답은 판단 모델을 안 부른다(물음 줄의 판단으로 간다).
 */
export function photoTypedReply(rowId: string, state: PhotoAskState, text: string): EasyButtonReply {
  return { text, answersRowId: rowId, pick: { photoRoles: photoAnswer(state, text).photoRoles, typed: true } };
}

/** 레퍼런스 요청의 답 — 붙인 그림은 분위기 참고로 확정해 싣는다(`referenceAnswer`). 갈래는 카드뉴스다. */
export function referenceReply(rowId: string, answer: Pick<EasyResend, "photoRoles" | "photoSlots">): EasyButtonReply {
  return {
    text: "이걸로 만들기",
    answersRowId: rowId,
    pick: {
      kind: "cardnews",
      ...(answer.photoRoles?.length ? { photoRoles: answer.photoRoles } : {}),
      ...(answer.photoSlots?.length ? { photoSlots: answer.photoSlots } : {}),
    },
  };
}
```

`apps/web/app/easy/use-easy-asks.ts`:

```ts
"use client";

import * as React from "react";
import { pickPhoto, startPhotoAsk, type PhotoAskState } from "./photo-ask-state";
import type { CardPhotoRole, PhotoRow } from "./photo-roles";

/**
 * **물음 줄에서 화면이 들고 있는 것**(2026-10-07 2차 설계 D1 · §3-6).
 *
 * 물음은 이제 대화 줄로 남는다. 화면은 그 줄 밑에서 **고르는 중인 것**만 든다 — 비율 · 그림체
 * 토글, 사진마다 고른 쓰임, 레퍼런스 고르기. 사진 · 레퍼런스 고르기는 이 화면에서 연 것만 있다
 * (첨부 썸네일이 화면 것이라) — 다시 열면 물음 글만 보이고 말로 이어 답한다.
 *
 * `easy-client.tsx` 가 800줄 상한이라 여기로 뺐다.
 */
export interface EasyAskResponse {
  ask?: { kind?: string };
  photoAsk?: { reason: "unclear" | "people"; rows: PhotoRow[]; mode?: "image" | "cardnews" };
}

export function useEasyAsks() {
  const [ratio, setRatio] = React.useState("");
  const [look, setLook] = React.useState("");
  const [photo, setPhoto] = React.useState<{ rowId: string; state: PhotoAskState } | null>(null);
  const [referenceRowId, setReferenceRowId] = React.useState<string | null>(null);

  function close() {
    setRatio("");
    setLook("");
    setPhoto(null);
    setReferenceRowId(null);
  }

  /** 서버가 물음 줄을 돌려줬을 때. 그 자리에서 고르는 물음이면 고르기를 연다. */
  function open(rowId: string, body: EasyAskResponse) {
    close();
    if (body.ask?.kind === "photo" && body.photoAsk) {
      setPhoto({ rowId, state: startPhotoAsk("", body.photoAsk.reason, body.photoAsk.rows, body.photoAsk.mode) });
    }
    if (body.ask?.kind === "reference") setReferenceRowId(rowId);
  }

  return {
    ratio, look, photo, referenceRowId, setRatio, setLook, open, close,
    pickPhoto: (id: string, role: CardPhotoRole) =>
      setPhoto((current) => (current ? { ...current, state: pickPhoto(current.state, id, role) } : current)),
    /** 사진이 바뀌면 사진 물음의 고르기는 뜻을 잃는다(1차 Review Focus 1). 물음 글은 남는다. */
    dropPhoto: () => setPhoto(null),
  };
}

export type EasyAsks = ReturnType<typeof useEasyAsks>;
```

- [ ] **Step 4: 물음 줄 밑의 단추 · 고르기를 만든다**

`apps/web/app/easy/_components/ask-row.tsx`:

```tsx
"use client";

import { readAsk } from "../row-marks";
import type { EasyMessage } from "../turn";
import { kindReply, photoReply, ratioReply, referenceReply, type EasyButtonReply } from "../ask-answers";
import { photoAskReady } from "../photo-ask-state";
import type { EasyAsks } from "../use-easy-asks";
import { EasyAskChoice } from "./ask-choice";
import { EasyKindAsk } from "./kind-ask";
import { EasyPhotoAsk } from "./photo-ask";
import { EasyReferenceAsk } from "./reference-ask";
import type { EasyLibrary } from "./library-attach";

type Attachment = { id: string; url: string; title: string };

/**
 * **물음 줄 밑의 단추 · 고르기**(2026-10-07 2차 설계 D1).
 *
 * 화면은 이것을 **지금 답할 수 있는 물음 줄(`answerableAskId`)이고 보내는 중이 아닐 때만** 넘긴다 — 지난
 * 물음의 단추로 지금 맥락과 다른 지시에 값이 나가지 않게(서버도 `answersRowId` 로 다시 막는다, Review
 * Focus 1). 단추 답이 실패한 짝 바로 앞의 물음 줄에는 다시 단다(2차 최종 리뷰 2). 다시 연
 * 대화에서 갈래 · 모양 물음은 단추가 그대로 나오고, 사진 · 레퍼런스 물음은 그 자리에서 고르던 것이
 * 화면에만 있어 글만 보인다 — 말로 이어 답하면 된다.
 */
export function EasyAskControls({ message, asks, attachments, library, onAttach, onAnswer }: {
  message: EasyMessage;
  asks: EasyAsks;
  attachments: readonly Attachment[];
  library: EasyLibrary;
  onAttach: (picked: Attachment[]) => void;
  onAnswer: (reply: EasyButtonReply) => void;
}) {
  const ask = readAsk(message);
  if (!ask) return null;
  if (ask.kind === "kind") return <EasyKindAsk onPick={(kind) => onAnswer(kindReply(message.id, kind))} />;
  if (ask.kind === "ratio") {
    return (
      <EasyAskChoice
        ratio={asks.ratio}
        look={asks.look}
        onRatio={asks.setRatio}
        onLook={asks.setLook}
        onSubmit={() => onAnswer(ratioReply(message.id, { ratio: asks.ratio, look: asks.look }))}
      />
    );
  }
  if (ask.kind === "photo" && asks.photo?.rowId === message.id) {
    const state = asks.photo.state;
    return (
      <EasyPhotoAsk
        mode={state.mode}
        rows={state.rows.map((row) => {
          const 붙인것 = attachments.find((one) => one.id === row.id);
          return { ...row, url: 붙인것?.url, title: 붙인것?.title };
        })}
        picked={state.picked}
        ready={photoAskReady(state)}
        onPick={asks.pickPhoto}
        onSubmit={() => onAnswer(photoReply(message.id, state))}
      />
    );
  }
  if (ask.kind === "reference" && asks.referenceRowId === message.id) {
    return (
      <EasyReferenceAsk
        library={library}
        attachedIds={attachments.map((one) => one.id)}
        onAttach={onAttach}
        onSubmit={(answer) => onAnswer(referenceReply(message.id, answer))}
      />
    );
  }
  return null;
}
```

- [ ] **Step 5: 물음 컴포넌트에서 물음 글을 뺀다 — 물음 줄이 보인다**

(a) `apps/web/app/easy/_components/kind-ask.tsx` 를 통째로 바꾼다:

```tsx
"use client";

import { Button } from "@fixup/ui";
import type { EasyKind } from "../cardnews-state";
import { KIND_REPLY_TEXT } from "../ask-answers";

/** **한 장인가 여러 장인가**(2단계 설계 §4)의 단추 둘. 물음 글은 물음 줄이 보인다(2차 D1). */
export function EasyKindAsk({ onPick, disabled }: { onPick: (kind: EasyKind) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("image")}>{KIND_REPLY_TEXT.image}</Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onPick("cardnews")}>{KIND_REPLY_TEXT.cardnews}</Button>
    </div>
  );
}
```

(b) `apps/web/app/easy/_components/ask-choice.tsx` 44~47줄의 `<p className="text-base leading-7">…</p>` 와 그 뒤 빈 줄을 지운다(물음 글은 물음 줄이 보인다 — 2차 D1).

(c) `apps/web/app/easy/_components/photo-ask.tsx` — `EasyPhotoAsk` 의 props 에서 `reason,`(42줄)과 타입 줄 `reason: "unclear" | "people";`(51줄)을 지우고, 61~68줄의 아래를:

```tsx
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
      <p className="text-base leading-7">
        {reason === "people"
          ? "인물을 그대로 지킬 사진은 한 장만 됩니다. 두 사람의 얼굴이 섞이기 때문이에요. 한 장만 「인물 그대로」로 골라 주세요."
          : "사진을 어떻게 쓸지 알려 주세요."}
      </p>

```

이렇게 바꾼다(물음 글은 `turn-words.ts` 의 `photoQuestion` 으로 물음 줄에 남는다):

```tsx
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
```

머리 주석(38줄) 「물음은 코드가 짓는다 — 같은 상황에 같은 물음이 나와야 사용자가 배운다.」를 「물음 글은 코드가 짓고(`turn-words.ts` 의 `photoQuestion`) 물음 줄이 보인다(2차 D1).」로 바꾼다.

(d) `apps/web/app/easy/_components/reference-ask.tsx` — 5줄 `import { NO_REFERENCE } from "../cardnews-attachments";` 와 61줄 `      <p className="text-base leading-7">{NO_REFERENCE}</p>` 를 지운다(요청 글은 물음 줄이 보인다).

(e) `apps/web/app/easy/_components/message.tsx` — `EasyMessageRow` 의 props 에 `onAdChoice` 다음으로 더한다(구조 분해와 타입 둘 다):

```tsx
  /** 물음 줄 밑의 단추 · 고르기(2차 D1). 화면이 마지막 물음 줄에만 넘긴다. */
  askControls?: React.ReactNode;
```

도우미 줄의 마지막 갈래를 찾아:

```tsx
        ) : (
          <p className={cn("max-w-[85%]", 말풍선)}>{visibleBody(message)}</p>
        )}
```

이렇게 바꾼다:

```tsx
        ) : askControls ? (
          <div className="grid max-w-[85%] gap-2">
            <p className={말풍선}>{visibleBody(message)}</p>
            {askControls}
          </div>
        ) : (
          <p className={cn("max-w-[85%]", 말풍선)}>{visibleBody(message)}</p>
        )}
```

- [ ] **Step 6: 카드뉴스 훅에서 물음 상태를 뺀다**

`apps/web/app/easy/use-cardnews.ts`:

(a) 12~15줄 import 에서 `continuingKind, ` 와 `  type EasyKind,` 줄을 지운다:

```ts
import {
  cardnewsJob, generatingProjects, jobsToRegister, latestCardnewsRow, redoCostLabel, startedDespiteError,
} from "./cardnews-state";
```

(b) 56~62줄(「한 장인가 여러 장인가를 묻는 중」 주석과 `kindAsking` · `referenceAsking` · `pendingKind` 상태 셋)을 지운다.

(c) 127~138줄의 `beginTurn` · `rememberKind` 두 함수를 지운다.

(d) `take` 를 찾아:

```ts
  function take(body: { kindAsk?: boolean; needReference?: boolean; cardnews?: { rowId: string; project: Project }; photoRoles?: unknown }, prompt: string) {
    if (after.take(body as Parameters<typeof after.take>[0])) return true;
    if (body.kindAsk) setKindAsking(prompt);
    else if (body.needReference) setReferenceAsking(prompt);
    else if (body.cardnews) {
```

이렇게 바꾼다:

```ts
  // 갈래 · 레퍼런스 물음은 이제 대화 줄이다(2차 D1, `_components/ask-row.tsx`). 여기는 원고 · 손보기만 받는다.
  function take(body: { cardnews?: { rowId: string; project: Project }; photoRoles?: unknown }) {
    if (after.take(body as Parameters<typeof after.take>[0])) return true;
    if (body.cardnews) {
```

(e) 돌려주는 객체에서 아래를 지운다:

```ts
    kindAsking,
    referenceAsking,
    /** 사진이 바뀌면 갈래 물음은 뜻을 잃는다. 레퍼런스 요청은 붙이는 것이 답이라 둔다. */
    dropKindAsk: () => setKindAsking(null),
    beginTurn,
    rememberKind,
```

`apps/web/app/easy/cardnews-state.ts` 95~109줄의 `continuingKind`(머리 주석 포함)를 지운다. `EasyKind` 타입은 `kind-ask.tsx` 가 계속 쓰므로 둔다.

`apps/web/app/easy/turn-carry.ts`, `apps/web/app/easy/__tests__/turn-carry.test.ts`, `apps/web/app/easy/__tests__/kind-picked-wiring.test.ts`, `apps/web/app/easy/_components/cardnews-asks.tsx` 를 지운다:

Run: `git rm apps/web/app/easy/turn-carry.ts apps/web/app/easy/__tests__/turn-carry.test.ts apps/web/app/easy/__tests__/kind-picked-wiring.test.ts apps/web/app/easy/_components/cardnews-asks.tsx`

- [ ] **Step 7: `easy-client.tsx` 를 줄인다 — 묻기를 빼고 새 약속으로 보낸다**

(a) import — 아래 네 줄을 지운다(`import { EASY_DEFAULT_RATIO } from "./ask";` 는 이 Task 와 상관없으니 그대로 둔다):

```ts
import { askSubmission, carryChoices, type EasyCarry } from "./turn-carry";
import { EasyAskChoice } from "./_components/ask-choice";
import { EasyPhotoAsk } from "./_components/photo-ask";
import { EasyCardnewsAsks } from "./_components/cardnews-asks";
```

아래 세 줄을:

```ts
import {
  photoAnswer, photoAskReady, pickPhoto, previousRolesFor, rememberRoles, startPhotoAsk, type PhotoAskState,
} from "./photo-ask-state";
```

`import { previousRolesFor, rememberRoles } from "./photo-ask-state";` 로, `import { cardResults, type EasyResend } from "./cardnews-state";` 를 `import { cardResults } from "./cardnews-state";` 로 바꾸고, `import { useEasyResume } from "./use-resume-images";` 아래에 다섯을 더한다:

```ts
import { useEasyAsks } from "./use-easy-asks";
import { photoTypedReply, type EasyButtonReply } from "./ask-answers";
import { answerableAskId } from "./ask-chain";
import { withPick } from "./row-marks";
import { EasyAskControls } from "./_components/ask-row";
```

(b) 상태 — `  /*\n   * **물어본 뒤 답을 기다리는 중인가** (2026-09-21 사용자).` 부터 `  const [photoAsking, setPhotoAsking] = React.useState<PhotoAskState | null>(null);` 까지(비율 물음 상태 · `carried` · 사진 물음 상태와 그 주석)를 통째로 바꾼다:

```ts
  /*
   * **물음 줄에서 고르는 중인 것**(2026-10-07 2차 D1). 물음은 이제 대화 줄로 남는다 — 화면은 비율
   * 토글 · 사진 고르기 · 레퍼런스 고르기처럼 그 자리에서 고르는 것만 든다(`use-easy-asks.ts`).
   */
  const asks = useEasyAsks();
```

(c) `upload` 안의 아래를:

```ts
        // 사진이 바뀌면 묻던 것은 뜻을 잃는다(Review Focus 1).
        setPhotoAsking(null);
        cardnews.dropKindAsk();
```

이렇게 바꾼다:

```ts
        // 사진이 바뀌면 사진 물음의 고르기는 뜻을 잃는다(1차 Review Focus 1). 물음 글은 남는다.
        asks.dropPhoto();
```

`pickFromLibrary` 안의 `    setPhotoAsking(null);\n    cardnews.dropKindAsk();` 두 줄을 `    asks.dropPhoto();` 한 줄로, 첨부 「빼기」 단추의 `onClick={() => { setAttachments((c) => c.filter((x) => x.id !== one.id)); setPhotoAsking(null); }}` 를 `onClick={() => { setAttachments((c) => c.filter((x) => x.id !== one.id)); asks.dropPhoto(); }}` 로 바꾼다.

(d) `send` 머리 — 아래를 찾아:

```ts
  async function send(
    /** 물어본 뒤 다시 보낼 때 쓴다. 비우면 입력창의 말을 보낸다. */
     다시?: EasyResend,
    친말?: string, // 단추로 고른 답(광고 물음, 설계 A5) — 입력창 말 대신 새 말로 보낸다
  ) {
    /* **사진을 물은 뒤 말로 답하면** 처음 말과 답을 잇는다(설계 §2-5). */
    const 말답 = !다시 && !친말 && photoAsking && draft.trim() ? photoAnswer(photoAsking, draft) : undefined;
    const prompt = 다시?.prompt ?? 말답?.prompt ?? 친말 ?? draft.trim();
    const photoRoles = 다시?.photoRoles ?? 말답?.photoRoles;
    if (!prompt || (!다시 && !turn.canSend)) return;
    const 이어감 = Boolean(다시 || 말답);
    const 고른값 = carryChoices({ continuing: 이어감, carry: carried.current, picked: 다시 });
    carried.current = 고른값;
    // 고른 갈래는 이어지는 답에만 싣는다. 새로 친 말은 서버가 다시 가른다(2단계 §4).
    const kind = cardnews.beginTurn({ explicit: 다시?.kind, continuing: 이어감, photoMode: photoAsking?.mode });
```

이렇게 바꾼다:

```ts
  async function send(
    /** 단추로 한 답(물음 줄 단추 · 광고 단추). 비우면 입력창의 말을 보낸다(2차 D1). */
    보낼것?: EasyButtonReply | { text: string },
  ) {
    const prompt = 보낼것?.text ?? draft.trim();
    if (!prompt || !turn.canSend) return;
    /*
     * 물음 줄 단추면 그 줄 id 와 고른 값을 싣는다. 처음 말은 서버가 대화 줄에서 잇는다(2차 D1). 사진 고르기가
     * 열린 채 말로 치면 그 말 + 손댄 쓰임을 그 물음의 답으로 보낸다 — 입력창 안내 그대로(2차 최종 리뷰 8).
     */
    const 단추 = 보낼것 && "answersRowId" in 보낼것
      ? 보낼것
      : !보낼것 && asks.photo ? photoTypedReply(asks.photo.rowId, asks.photo.state, prompt) : undefined;
    const 고른역할 = (단추?.pick.photoRoles ?? []) as Array<{ id: string; role: CardPhotoRole }>;
```

그리고 아래를 찾아:

```ts
    setSending(true);
    setError(null);
    setPhotoAsking(null);

    if (다시) {
      // 물음 줄을 거둔다. 내 말은 이미 그려져 있다.
      setAsking(null);
    } else {
      if (!친말) setDraft("");
      /*
        **묻던 것을 거둔다.** 답하지 않고 새 말을 치면 그 물음은 버린 것이다.
        남겨 두면 지난 말에 딸린 토글이 새 말 밑에 붙어 무엇을 묻는지 흐려진다.
      */
      setAsking(null);
      setAskRatio("");
      setAskLook("");
      // 내 말을 먼저 그린다. 답이 말일지 그림일지는 아직 모른다 — 서버가 가른다.
      setMessages((current) => [...current, { id: `user-${자리}`, role: "user", body: 말답 ? draft.trim() : prompt }]);
    }
```

이렇게 바꾼다:

```ts
    setSending(true);
    setError(null);
    // 물음은 대화 줄에 남아 있다. 보내면 그 자리의 단추 · 고르기만 거둔다(2차 D1).
    asks.close();
    if (!보낼것) setDraft("");
    /*
     * 내 말을 먼저 그린다. 답이 말일지 그림일지는 아직 모른다 — 서버가 가른다. 단추 답이면 서버 줄과 같게
     * 고른 값 표시를 붙여 든다(보일 때는 뗀다) — 그 자리에서 실패해도 그 물음 줄에 단추를 다시 단다(2차 최종 리뷰 2).
     */
    setMessages((current) => [...current, { id: `user-${자리}`, role: "user", body: 단추 ? withPick(prompt, 단추.pick) : prompt }]);
```

(e) 보내는 글 — 아래를 찾아:

```ts
          referenceIds: attachments.map((one) => one.id),
          // 물음에 답한 것. 서버가 다시 확인한다(설계 §2-5).
          ...(photoRoles?.length ? { photoRoles } : {}),
          // 지난 역할. 이번에 고른 사진은 빼고 보낸다 — 서버도 다시 확인한다.
          previousRoles: previousRolesFor(lastRoles, attachments.map((one) => one.id), photoRoles),
          // 고른 것이 있으면 함께 보낸다. 없으면 서버가 물어볼지 정한다.
          ...(고른값.ratio ? { ratio: 고른값.ratio } : {}),
          ...(고른값.look ? { look: 고른값.look } : {}),
          // 카드뉴스(2단계): 고른 갈래 · 세트에서 온 자리. 있을 때만 싣는다.
          ...(kind ? { kind } : {}), ...(다시?.photoSlots?.length ? { photoSlots: 다시.photoSlots } : {}),
          // 갈래 단추로 고른 턴과 그 뒤 단추로 이어 답한 턴만(설계 A2). 말로 친 답은 고른 것이 아니다(`carryChoices`).
          ...(고른값.kindPicked ? { kindPicked: true } : {}),
```

이렇게 바꾼다:

```ts
          referenceIds: attachments.map((one) => one.id),
          // 지난 역할. 이번에 단추로 고른 사진은 빼고 보낸다 — 서버도 다시 확인한다.
          previousRoles: previousRolesFor(lastRoles, attachments.map((one) => one.id), 고른역할),
          // 물음 줄 단추면 그 줄 id 와 고른 값(갈래 · 비율 · 사진 쓰임 · 번호)만 싣는다(2차 D1).
          ...(단추 ? { answersRowId: 단추.answersRowId, pick: 단추.pick } : {}),
```

(f) 답 받기 — `      if (body.ok && body.asked) {` 부터 `      if (body.ok && cardnews.take(body, prompt)) return;` 까지(비율 물음 · 사진 물음 두 갈래와 카드뉴스 줄)를 통째로 바꾼다:

```ts
      if (body.ok && body.ask && body.message) {
        /*
         * **물음도 대화의 한 줄이다**(2차 D1). 물음 줄을 붙이고, 사진 · 레퍼런스처럼 그 자리에서
         * 고르는 물음이면 그 고르기를 이 줄에 연다. 값은 안 들었다.
         */
        setMessages((current) => [...current, { id: body.message.id, role: "assistant", body: body.message.body ?? "" }]);
        asks.open(body.message.id, body);
        router.refresh();
        return;
      }
      // 카드뉴스 원고 · 손보기(2단계 · 3단계). 값은 원고까지 안 든다.
      if (body.ok && cardnews.take(body)) return;
```

(g) `      if (!친말 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);` 를 `      if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);` 로 바꾼다.

(h) 대화 줄 — `  const shown = messages.length ? messages : [인사];` 아래에 한 줄 더한다:

```ts
  // 단추를 달 물음 줄 — 서버가 받아 줄 줄과 같다(마지막 물음, 또는 단추 답이 실패한 짝 바로 앞, 2차 최종 리뷰 2).
  const 답할물음 = answerableAskId(shown);
```

그리고 `              onAdChoice={message.id === shown[shown.length - 1]?.id && !turn.busy ? (answer) => void send(undefined, answer) : undefined}` 를 아래로 바꾼다:

```tsx
              onAdChoice={message.id === 답할물음 && !turn.busy ? (answer) => void send({ text: answer }) : undefined}
              // 물음 줄 밑의 단추 · 고르기. 지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만(Review Focus 1, 2차 D1).
              askControls={message.id === 답할물음 && !turn.busy ? (
                <EasyAskControls
                  message={message} asks={asks} attachments={attachments} library={library}
                  onAttach={pickFromLibrary} onAnswer={(reply) => void send(reply)}
                />
              ) : undefined}
```

(i) 렌더의 옛 물음 셋 — `          {/*\n            **비율·그림체를 한 번 묻는다**(2026-09-21 사용자).` 부터 아래 줄까지(비율 물음 · 사진 물음 · `EasyCardnewsAsks` 와 생각 중 줄):

```tsx
          {turn.busy && !asking && !photoAsking && shown[shown.length - 1]?.role === "user" ? <EasyThinkingRow /> : null}
```

를 통째로 이 한 줄로 바꾼다:

```tsx
          {turn.busy && shown[shown.length - 1]?.role === "user" ? <EasyThinkingRow /> : null}
```

(j) 입력창 안내 — `                  : photoAsking ? "위 사진 물음에 대한 답으로 보냅니다. 예: 1번은 우리 원두 봉투야"` 를 `                  : asks.photo ? "위 사진 물음에 대한 답으로 보냅니다. 예: 1번은 우리 원두 봉투야"` 로 바꾼다.

- [ ] **Step 8: 시험 · 타입 · 줄 수를 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy`
Expected: PASS (실패 0)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `wc -l apps/web/app/easy/easy-client.tsx apps/web/app/easy/use-easy-asks.ts apps/web/app/easy/ask-answers.ts apps/web/app/easy/_components/ask-row.tsx apps/web/app/easy/use-cardnews.ts`
Expected: `easy-client.tsx` 가 800 보다 **줄었다**(예상 690~720). 새 파일 셋은 각각 100 줄 아래. 줄 수를 보고에 적는다

Run: `grep -n "turn-carry\|cardnews-asks\|continuingKind\|kindPicked\|photoAsking\|setAsking" -r apps/web/app/easy --include=*.ts --include=*.tsx --exclude-dir=__tests__`
Expected: 출력 없음(남은 부르는 곳이 없다 — 시험 파일의 「없어야 한다」 글자는 빼고 본다)

- [ ] **Step 9: 커밋**

```bash
git add -A apps/web/app/easy
git commit -m "feat(easy): 물음을 대화 줄로 그리고 단추 답은 물음 줄 id 와 고른 값만 보낸다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: 쓴 사진은 입력창에서 내린다 (D3)

**Files:**
- Create: `apps/web/app/easy/attachments-after.ts`
- Modify: `apps/web/app/easy/easy-client.tsx` (답 받은 직후 한 줄 + import 한 줄)
- Modify: `apps/web/lib/easy/image-edit-turn.ts:2, 27-35, 43-58, 113-118`
- Modify: `apps/web/app/easy/chat-facts.ts` (`easyPhotoGoneLines`), `apps/web/app/easy/chat.ts` (사진 줄 아래)
- Modify: `apps/web/app/api/easy/generate/route.ts` (판단에 주는 붙인 장수 — 새로고침 뒤 물음 줄의 사진, 2차 최종 리뷰 7)
- Test: `apps/web/app/easy/__tests__/attachments-after.test.ts` (새), `apps/web/app/easy/__tests__/chat.test.ts` (더함), `apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts` (모의 · 더함)
- Test (고침): `apps/web/lib/easy/__tests__/image-edit-turn.test.ts:128-131, 159-170`, `apps/web/app/api/easy/__tests__/generate-image-edit.test.ts:113-114`

**Interfaces:**
- Consumes: Task 5 — `send` 의 답 받기 자리(`observeAccountResponse(body, true);` 바로 뒤). Task 4 — 라우트의 `처음사진` · `이을사진`
- Produces:
  - `attachments-after.ts`: `usedAttachments(body: Record<string, unknown>): boolean` — 이미지 만들기 · 고치기(`projectId` + `submission`) · 카드뉴스 원고(`cardnews`)면 `true`
  - `image-edit-turn.ts`: `EasyImageTarget.usedIds` → **`keptIds`**(원래 작업의 지킬 사진 `preservedIds` · `personIds` 만). Task 8 이 이 이름을 쓴다
  - `chat-facts.ts`: `easyPhotoGoneLines(): string[]`
  - 라우트: 판단에 주는 붙인 장수 = `처음사진.ids.length || 이을사진.length`(첨부가 비었으면 물음 사슬의 사진 수 — 2차 최종 리뷰 7)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/attachments-after.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { usedAttachments } from "../attachments-after";

/**
 * **쓴 사진은 입력창에서 내린다**(2026-10-07 2차 설계 D3 · §3-3, ChatGPT 처럼). 만들기 · 고치기 ·
 * 카드뉴스 원고에 쓴 턴만 비운다. 물음 · 대화 · 실패에는 그대로 둔다(아직 안 썼거나 다시 보낸다).
 */
describe("쓴 사진은 내린다 (2차 D3)", () => {
  it("이미지 만들기 · 고치기 · 카드뉴스 원고 턴이면 내린다", () => {
    expect(usedAttachments({ ok: true, projectId: "p1", submission: { requestRowId: "r" } })).toBe(true);
    expect(usedAttachments({ ok: true, cardnews: { rowId: "r", project: {} } })).toBe(true);
  });

  it("물음 · 대화 · 실패 · 손보기면 그대로 둔다", () => {
    expect(usedAttachments({ ok: true, ask: { kind: "photo" }, message: {} })).toBe(false);
    expect(usedAttachments({ ok: true, talked: true, message: {} })).toBe(false);
    expect(usedAttachments({ ok: false, message: "x" })).toBe(false);
    expect(usedAttachments({ ok: true, cardEdited: {} })).toBe(false);
  });

  it("화면은 답을 받자마자 이 판단으로 첨부를 비운다", () => {
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    expect(화면).toContain("if (usedAttachments(body)) setAttachments([]);");
  });
});
```

`apps/web/app/easy/__tests__/chat.test.ts` 끝에 더한다:

```ts
describe("쓴 사진은 내려간다 (2차 D3)", () => {
  it("만든 것이 있고 붙은 사진이 없으면, 앞의 사진을 다시 쓰자는 말에 다시 붙여 달라고 하게 한다", () => {
    const prompt = easyChatPrompt([말("user", "카페 포스터"), 말("image", "")], "같은 사진으로 하나 더");
    expect(prompt).toContain("그 사진을 다시 붙여 주세요");
  });

  it("사진이 붙어 있거나 아직 만든 것이 없으면 안 적는다", () => {
    expect(easyChatPrompt([말("user", "카페 포스터"), 말("image", "")], "하나 더", 1)).not.toContain("다시 붙여 주세요");
    expect(easyChatPrompt([], "하나 더")).not.toContain("다시 붙여 주세요");
  });
});
```

`apps/web/lib/easy/__tests__/image-edit-turn.test.ts` — 128~131줄의 `it` 을 바꾼다:

```ts
  /**
   * 2차 D3: 첨부는 만들기 · 고치기에 쓴 뒤 입력창에서 내려간다. 붙어 있다면 이번에 일부러 붙인 것이다.
   * 원래 작업의 **지킬 사진**(제품 · 인물 그대로)만 뺀다 — 고치기 라우트가 알아서 다시 붙인다.
   */
  it("지킬 사진만 빼고 붙인 사진을 넣는다 — 따라 만들 사진도 다시 붙였으면 넣는다 (2차 D3)", async () => {
    await 고친다([줄.image("p1")], ["src-1", "keep-1", "logo-1"]);
    expect(edits[0]!.body.addedReferenceIds).toEqual(["src-1", "logo-1"]);
  });
```

159~170줄의 `it` 을 바꾼다:

```ts
  /** 2차 D3: 예전에는 남아 있던 첨부를 걸렀다. 이제 첨부가 내려가므로 다시 붙인 로고는 일부러 붙인 것이다. */
  it("앞서 고칠 때 넣은 로고를 다시 붙이면 다시 넣는다 (2차 D3)", async () => {
    images = [
      { id: "img-1", generationRequestId: "r1", selected: false },
      { id: "img-2", generationRequestId: "r2", selected: false },
    ];
    await 고친다(대화(
      { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "i2", role: "image", body: editRowBody("r2", ["logo-1"]), workId: "p1" },
    ), ["src-1", "logo-1"]);
    expect(edits[0]!.body.addedReferenceIds).toEqual(["src-1", "logo-1"]);
    expect(edits[0]!.body.imageId).toBe("img-2");
  });
```

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts` — 113~114줄을 바꾼다:

```ts
    // 2차 D3: 첨부는 쓴 뒤 내려간다 — 붙어 있으면 일부러 붙인 것이라 다 넣는다(지킬 사진만 뺀다. 이 작업엔 없다).
    expect(부른라우트[0]!.body).toEqual({ instruction: 로고바꿔줘, imageId: "img-1", addedReferenceIds: [사진(1), 사진(2)] });
```

`apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts` — (a) 맨 위 모의들 사이(`lib/poster/references` 모의 아래)에 더한다(대화에 그림 줄이 있으면 라우트가 마지막 이미지를 읽는다 — 지운 작업처럼 없다고 답한다):

```ts
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => undefined },
    images: { byProject: async () => [], byProjects: async () => [] },
  }),
}));
```

(b) 파일 끝에 더한다:

```ts
/**
 * 2차 최종 리뷰 7 — 새로고침하면 화면에 첨부가 없다. 그 뒤 사진 물음에 말로 답하면 판단 프롬프트가 「붙은 사진
 * 없음」으로 보고 「그 사진을 다시 붙여 주세요」를 시켰다(D3 줄). 물음 사슬에 사진이 있으면 그 수를 준다.
 */
describe("새로고침 뒤 말로 한 답의 사진 (2차 최종 리뷰 7)", () => {
  const 만든대화 = [{ id: "u0", role: "user", body: "카페 포스터", workId: null }, { id: "i0", role: "image", body: "", workId: "p0" }];

  it("이미지를 만든 대화에서 새로고침 뒤 사진 물음에 말로 답하면 물음 줄의 사진 수를 판단에 준다", async () => {
    지난줄 = [...만든대화, { ...처음, body: "이 사진으로 포스터" }, 물음("q1", "photo", { wants: "image", ids: [사진(1)] })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "1번은 우리 제품이야" });
    expect(받은판단글[0]).toContain("이미지 1장을 붙여 두었습니다");
    expect(받은판단글[0]).not.toContain("그 사진을 다시 붙여 주세요");
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "이 사진으로 포스터\n1번은 우리 제품이야" });
  });

  it("물음 사슬에 사진이 없으면 예전처럼 다시 붙여 달라고 하게 한다", async () => {
    지난줄 = 만든대화;
    판단 = { wants: "talk", reply: "그 사진을 다시 붙여 주세요. 라이브러리에 있습니다.", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "같은 사진으로 하나 더" });
    expect(받은판단글[0]).toContain("그 사진을 다시 붙여 주세요");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/attachments-after.test.ts app/easy/__tests__/chat.test.ts lib/easy/__tests__/image-edit-turn.test.ts app/api/easy/__tests__/generate-image-edit.test.ts app/api/easy/__tests__/generate-ask-answer.test.ts`
Expected: FAIL — `Failed to resolve import "../attachments-after"`, `addedReferenceIds` 가 `["logo-1"]`, 프롬프트에 「그 사진을 다시 붙여 주세요」 없음, 새로고침 뒤 말 답의 판단 프롬프트에 붙인 장수가 없다

- [ ] **Step 3: 만들기에 쓴 턴을 가르는 함수를 만든다**

`apps/web/app/easy/attachments-after.ts`:

```ts
/**
 * **쓴 사진은 입력창에서 내린다**(2026-10-07 2차 설계 D3 · §3-3, ChatGPT 처럼).
 *
 * 이미지를 만들거나 고치거나(`projectId` + `submission`) 카드뉴스 원고를 쓴(`cardnews`) 턴에만
 * 비운다. 물음 · 대화 · 실패 · 손보기에는 그대로 둔다 — 아직 안 썼거나 다시 보내야 한다.
 * 다시 쓰려면 다시 붙인다(라이브러리에 있다). 화면 안에 두면 값으로 못 잰다.
 */
export function usedAttachments(body: Record<string, unknown>): boolean {
  if (body.ok !== true) return false;
  return (typeof body.projectId === "string" && Boolean(body.submission)) || Boolean(body.cardnews);
}
```

`apps/web/app/easy/easy-client.tsx` — `import { useEasyAsks } from "./use-easy-asks";` 아래에 `import { usedAttachments } from "./attachments-after";` 를 더하고, `send` 안의 아래 두 줄을 찾아:

```ts
      const body = await response.json().catch(() => ({}));
      observeAccountResponse(body, true);
```

바로 아래에 더한다:

```ts
      // 만들기에 쓴 턴이면 붙인 사진을 내린다(2차 D3). 물음 · 대화 · 실패에는 그대로 둔다.
      if (usedAttachments(body)) setAttachments([]);
```

- [ ] **Step 4: 고치기는 지킬 사진만 거른다**

`apps/web/lib/easy/image-edit-turn.ts`:

(a) 2줄 `import { editAddedOf, editRowBody, editTargetImage, withRowJob } from "../../app/easy/row-image";` 를 `import { editRowBody, editTargetImage, withRowJob } from "../../app/easy/row-image";` 로 바꾼다.

(b) `EasyImageTarget` 의 아래를 찾아:

```ts
  /**
   * 그 작업에 이미 쓴 사진 — 처음 만들 때 쓴 것과 앞서 고칠 때 넣은 것. 다시 붙어
   * 와도 새것으로 안 넣는다(화면의 첨부는 보낸 뒤에도 남는다, 2026-10-06 리뷰).
   */
  usedIds: ReadonlySet<string>;
```

이렇게 바꾼다:

```ts
  /**
   * 그 작업의 **지킬 사진**(제품 · 인물 그대로). 고치기 라우트가 알아서 다시 붙이므로 새로 안 넣는다.
   * 그 밖에 붙어 있는 사진은 이번에 일부러 붙인 새 재료다 — 첨부는 쓴 뒤 입력창에서 내려가므로
   * (2026-10-07 2차 D3) 예전 고치기에 넣은 로고 · 따라 만들 사진도 다시 붙였으면 넣는다.
   */
  keptIds: ReadonlySet<string>;
```

(c) `lastEasyImage` 의 돌려주는 값에서 아래를 찾아:

```ts
    usedIds: new Set([
      ...(data.referenceIds ?? []), ...(data.preservedIds ?? []),
      ...(data.personIds ?? []), ...(data.restyledIds ?? []),
      ...rows.filter((one) => one.role === "image" && one.workId === project.id).flatMap((one) => editAddedOf(one.body)),
    ]),
```

이렇게 바꾼다:

```ts
    keptIds: new Set([...(data.preservedIds ?? []), ...(data.personIds ?? [])]),
```

(d) `imageEditTurn` 의 아래를 찾아:

```ts
  /*
   * **새로 붙인 사진만** 넣는다. 처음에 쓴 원본 사진은 입력창에 그대로 붙어 있기
   * 쉬운데, 그것을 다시 넣으면 고친 그림에 원본의 모습이 되살아난다. 원래 작업의
   * 지킬 대상은 고치기 라우트가 알아서 다시 붙인다.
   */
  const added = ctx.attachments.filter((id) => !ctx.target.usedIds.has(id));
```

이렇게 바꾼다:

```ts
  /*
   * **이번에 붙인 사진은 넣는다**(2026-10-07 2차 D3). 첨부는 만들기 · 고치기에 쓴 뒤 입력창에서
   * 내려가므로, 붙어 있다면 사용자가 이번에 일부러 붙인 것이다. 원래 작업의 지킬 사진만 뺀다 —
   * 고치기 라우트가 알아서 다시 붙인다.
   */
  const added = ctx.attachments.filter((id) => !ctx.target.keptIds.has(id));
```

- [ ] **Step 5: 사진 없이 「같은 사진으로」면 다시 붙여 달라고 하게 한다**

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/**
 * 쓴 사진은 입력창에서 내려간다(2026-10-07 2차 D3). 「같은 사진으로 하나 더」처럼 앞에서 쓴 사진을
 * 다시 쓰자는데 지금 붙은 사진이 없으면, 만들지 말고 다시 붙여 달라고 답하게 한다 — 사진 없이 만들면
 * 값만 나가고 바라는 것이 안 나온다.
 */
export function easyPhotoGoneLines(): string[] {
  return [
    "**붙인 사진은 이미지를 만들거나 고치는 데 쓴 뒤 입력창에서 내려갑니다.** 지금은 붙은 사진이 없습니다.",
    "사용자가 앞에서 쓴 사진을 다시 쓰자고 하면(「같은 사진으로 하나 더」 · 「아까 그 로고로」) 만들지 말고 talk 로 고르고,",
    "reply 에 「그 사진을 다시 붙여 주세요. 라이브러리에 있습니다.」라고 알려 주세요.",
    "",
  ];
}
```

`apps/web/app/easy/chat.ts` — chat-facts import 줄에 `easyPhotoGoneLines` 를 더하고(가나다 차례로 `easyFirstPhotoLines, ` 뒤), 아래를 찾아:

```ts
        ...(갈래.includes("image_edit") || 갈래.includes("revise") ? [] : easyFirstPhotoLines()),
      ]
      : []),
```

바로 아래에 더한다:

```ts
    // 2차 D3: 쓴 사진은 내려간다. 만든 것이 있는데 붙은 사진이 없으면 다시 붙여 달라고 하게 한다.
    ...(attachmentCount === 0 && history.some((message) => message.role === "image") ? easyPhotoGoneLines() : []),
```

`apps/web/app/api/easy/generate/route.ts` — Task 4 가 넣은 판단 입력의 아래 두 줄을 찾아:

```ts
          // 붙인 것이 있는지 알려 준다. 안 알려 주면 「이걸로 하나 그려줘」를 되묻는다(2026-09-21 실측).
          attachmentCount: 처음사진.ids.length,
```

이렇게 바꾼다(2차 최종 리뷰 7):

```ts
          /*
           * 붙인 것이 있는지 알려 준다. 안 알려 주면 「이걸로 하나 그려줘」를 되묻는다(2026-09-21 실측).
           * 새로고침 뒤 물음에 말로 답하면 화면에 첨부가 없다 — 물음 줄에 적어 둔 사진을 센다. 안 세면
           * 「그 사진을 다시 붙여 주세요」(D3 줄)가 나가는데, 그 사진은 답으로 읽히면 아래에서 그대로 쓴다.
           */
          attachmentCount: 처음사진.ids.length || 이을사진.length,
```

- [ ] **Step 6: 시험 · 타입 · 줄 수를 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy`
Expected: PASS

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `wc -l apps/web/app/easy/easy-client.tsx`
Expected: 800 이하(Task 5 의 줄 수 + 3). 보고에 적는다

- [ ] **Step 7: 커밋**

```bash
git add apps/web/app/easy/attachments-after.ts apps/web/app/easy/easy-client.tsx apps/web/lib/easy/image-edit-turn.ts apps/web/app/easy/chat-facts.ts apps/web/app/easy/chat.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/__tests__/attachments-after.test.ts apps/web/app/easy/__tests__/chat.test.ts apps/web/lib/easy/__tests__/image-edit-turn.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts
git commit -m "feat(easy): 만들기 · 고치기에 쓴 사진은 입력창에서 내린다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 이 대화의 결과물 번호 — 화면 「이미지 N」 · 「카드뉴스 N」 · 판단 모델의 목록 (D2 번호)

> **번호는 결과물 줄 모두에 대화 차례대로 붙인다**(2차 최종 리뷰 5 — 컨트롤러 결정). 포스터 그림 줄 · 카드뉴스 줄 · 작업을 지운 줄을 함께 센다. 표시도 작업 조회도 안 보므로 운영의 옛 줄(표시 없는 빈 글)도 데이터 SQL 없이 번호가 안 바뀌고, 무엇을 지워도 뒤 번호가 당겨지지 않는다. 그 번호가 무엇인지(이미지 · 카드뉴스 · 지운 것)는 따로 가른다 — 고치기는 이미지 번호일 때만이다(Task 8).

**Files:**
- Modify: `apps/web/app/easy/row-image.ts:32, 42-45, 55-70` (`;from=`)
- Create: `apps/web/app/easy/image-numbers.ts`
- Create: `apps/web/lib/easy/image-list.ts`
- Modify: `apps/web/lib/easy/cardnews-steps.ts:84-90` (`cardnewsProjectIds` 더함 — 카드뉴스 작업인지만 본다, 서명 없음)
- Modify: `apps/web/app/easy/chat.ts` (옵션 · 결과물 줄 글 · 목록), `apps/web/app/easy/chat-facts.ts` (`easyResultListLines` · `easyResultRowText`), `apps/web/lib/easy/judge.ts:1-6, 31, 43`
- Modify: `apps/web/app/api/easy/generate/route.ts` (결과물 사실 읽기 · 판단에 넘기기 · 응답 이름표 · 카드뉴스 원고 응답 이름표)
- Modify: `apps/web/app/easy/_components/load.ts:10, 89, 115, 157`, `apps/web/app/easy/[id]/page.tsx:26-35`, `apps/web/app/easy/easy-client.tsx` (이름표 상태 · 줄에 넘기기), `apps/web/app/easy/_components/message.tsx` (이름표)
- Test: `apps/web/app/easy/__tests__/image-numbers.test.ts` (새), `apps/web/lib/easy/__tests__/image-list.test.ts` (새), `apps/web/lib/easy/__tests__/cardnews-steps.test.ts` (더함), `apps/web/app/easy/__tests__/row-image.test.ts` (더함), `apps/web/app/easy/__tests__/chat.test.ts` (더함), `apps/web/app/easy/__tests__/message-row.test.tsx` (더함), `apps/web/app/api/easy/__tests__/generate-route.test.ts` (더함), `apps/web/app/api/easy/__tests__/cardnews-route.test.ts` (더함), `apps/web/app/easy/__tests__/shell-wiring.test.ts` (더함), `apps/web/app/api/easy/__tests__/generate-ad.test.ts` · `generate-image-edit.test.ts` · `generate-ask-answer.test.ts` (모의 한 줄씩)

**Interfaces:**
- Consumes: Task 1 — `visibleBody`. 1차 `row-image.ts` — `editRequestOf`, `pickRowImage`, `editedRequestIds`
- Produces:
  - `row-image.ts`: `withRowFrom(body: string, rowId: string | undefined): string`, `rowFromOf(body: string | null | undefined): string | undefined`
  - `image-numbers.ts`: `export interface EasyResultNumber { n: number; rowId: string; workId: string; fromRowId?: string }`, `export type EasyResultKind = "image" | "cardnews" | "deleted"`, `export type EasyImageState = "done" | "making" | "failed" | "deleted"`, `export interface EasyResultEntry extends EasyResultNumber { kind: EasyResultKind; state: EasyImageState; words: string; fromN?: number }`, `numberEasyResults(rows): EasyResultNumber[]`, `nextResultNumber(rows): number`, `resultKindOf(workId, posters: ReadonlySet<string>, cardnews: ReadonlySet<string>): EasyResultKind`, `resultLabel(kind: EasyResultKind, n: number): string`(「이미지 N」 · 「카드뉴스 N」 · 「결과물 N」), `describeEasyResults(rows, numbered, factOf: (one) => { kind; state }): EasyResultEntry[]`, `doneImageNumbers(entries): number[]`
  - `lib/easy/image-list.ts`: `export interface EasyPicture { id: string; projectId: string; generationRequestId: string; selected: boolean; assetPath: string; thumbPath?: string | null }`, `export interface EasyImageFacts { entries: EasyResultEntry[]; posters: ReadonlySet<string>; pictures: ReadonlyMap<number, EasyPicture>; madeImage: boolean; lastIsImage: boolean }`, `loadEasyImages(userId: string, rows, now?: number): Promise<EasyImageFacts>` (실패해도 빈 사실, 던지지 않는다). `madeImage` = 지우지 않은 이미지가 있나(만드는 중 · 못 만든 것도 넣는다 — 2차 최종 리뷰 a), `lastIsImage` = 지운 것을 뺀 마지막 결과물이 이미지인가
  - `lib/easy/cardnews-steps.ts`: `cardnewsProjectIds(userId: string, ids: readonly string[]): Promise<Set<string>>`
  - `chat.ts`: `EasyPromptOptions.images?: readonly EasyResultEntry[]`, `chat-facts.ts`: `easyResultListLines(entries): string[]` · `easyResultRowText(entry: EasyResultEntry | undefined): string`, `judge.ts`: `EasyJudgeInput.images?`
  - 라우트 지역 이름 `이미지들: EasyImageFacts`(Task 8 · 11 이 쓴다), 응답 칸 `resultLabel`(이미지 「이미지 N」, 카드뉴스 원고 「카드뉴스 N」), `cardnewsTurn` ctx 의 `결과번호: number`
  - 화면: `EasyClient` prop `initialResultLabels?: Record<string, string>`, `EasyMessageRow` prop `resultLabel?: string`, `loadEasyConversation` 의 `labels`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/image-numbers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeEasyResults, doneImageNumbers, nextResultNumber, numberEasyResults, resultKindOf, resultLabel,
} from "../image-numbers";
import { editRowBody, withRowFrom, withRowJob } from "../row-image";

/**
 * **이 대화의 결과물 번호**(2026-10-07 2차 설계 D2 · §3-2, 2차 최종 리뷰 5). 화면과 서버가 같은 함수를 쓴다.
 * 이미지 · 카드뉴스 · 지운 것 모두 대화 차례대로 센다 — 표시를 안 보므로 운영의 옛 줄도 번호가 안 바뀌고,
 * 무엇을 지워도 뒤 번호가 당겨지지 않는다(「아까 1번」이 늘 같은 것을 가리킨다).
 */
const 일감 = { requestRowId: "r", falRequestId: "f", endpoint: "e" };
const 말 = (id: string, body: string) => ({ id, role: "user", body, workId: null });
const 결과 = (id: string, workId: string, body = withRowJob("", 일감)) => ({ id, role: "image", body, workId });

describe("결과물 번호", () => {
  it("이미지 · 카드뉴스 줄 모두 대화 차례대로 1, 2, … — 말 줄 · 작업 없는 줄은 안 센다", () => {
    const rows = [
      말("u1", "카페"), 결과("i1", "p1"), 말("u2", "카드뉴스"), 결과("c1", "card-1", ""), 말("u3", "배너"), 결과("i2", "p2"),
      { id: "x", role: "image", body: "", workId: null },
    ];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "i1", workId: "p1" }, { n: 2, rowId: "c1", workId: "card-1" }, { n: 3, rowId: "i2", workId: "p2" },
    ]);
    expect(nextResultNumber(rows)).toBe(4);
  });

  /** Review Focus 4 · 6 — 2차 최종 리뷰 5 */
  it("표시 없는 옛 줄도 · 지운 작업 줄도 자리를 지킨다 — 지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다", () => {
    // 운영의 옛 줄: 표시 없는 빈 글. 첫 줄은 지운 카드뉴스, 둘째는 표시 없는 옛 포스터 줄.
    const rows = [결과("c-gone", "card-gone", ""), 결과("i-old", "p-old", "")];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "c-gone", workId: "card-gone" }, { n: 2, rowId: "i-old", workId: "p-old" },
    ]);
    // 지웠는지는 번호를 안 바꾼다 — 그 번호의 갈래만 바뀐다.
    expect(resultKindOf("card-gone", new Set(["p-old"]), new Set())).toBe("deleted");
    expect(resultKindOf("p-old", new Set(["p-old"]), new Set())).toBe("image");
    expect(resultKindOf("card-1", new Set(), new Set(["card-1"]))).toBe("cardnews");
  });

  it("고친 줄도 제 번호를 받고 무엇을 고쳤는지 안다 — 표시가 없는 옛 고친 줄은 같은 작업의 첫 줄", () => {
    const rows = [
      결과("i1", "p1"), 결과("i2", "p2"),
      결과("i3", "p1", withRowJob(withRowFrom(editRowBody("r3"), "i1"), 일감)),
      결과("i4", "p2", editRowBody("r4")),
    ];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "i1", workId: "p1" }, { n: 2, rowId: "i2", workId: "p2" },
      { n: 3, rowId: "i3", workId: "p1", fromRowId: "i1" }, { n: 4, rowId: "i4", workId: "p2", fromRowId: "i2" },
    ]);
  });

  it("번호마다 갈래 · 만든 말 · 상태 · 고친 번호를 적고, 다 만든 이미지 번호만 고른다", () => {
    const rows = [
      말("u1", "카페 딸기라떼 포스터 만들어줘"), 결과("i1", "p1"),
      말("u2", "건강 카드뉴스"), 결과("c1", "card-1", ""),
      말("u3", "배경만 파랗게"), 결과("i2", "p1", withRowFrom(editRowBody("r2"), "i1")),
    ];
    const entries = describeEasyResults(rows, numberEasyResults(rows), (one) =>
      (one.workId === "card-1" ? { kind: "cardnews", state: "done" } : { kind: "image", state: one.n === 1 ? "done" : "making" }));
    expect(entries).toEqual([
      { n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페 딸기라떼 포스터 만들어줘" },
      { n: 2, rowId: "c1", workId: "card-1", kind: "cardnews", state: "done", words: "건강 카드뉴스" },
      { n: 3, rowId: "i2", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image", state: "making", words: "배경만 파랗게" },
    ]);
    expect(doneImageNumbers(entries)).toEqual([1]);
  });

  it("화면 이름표는 갈래를 따른다 — 지운 것은 무엇이었는지 모를 수 있어 「결과물 N」", () => {
    expect(resultLabel("image", 3)).toBe("이미지 3");
    expect(resultLabel("cardnews", 2)).toBe("카드뉴스 2");
    expect(resultLabel("deleted", 1)).toBe("결과물 1");
  });
});
```

`apps/web/lib/easy/__tests__/image-list.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이 대화의 결과물 사실**(2026-10-07 2차 D2). 번호마다 이미지 · 카드뉴스 · 지운 것, 이미지면 다 만들었나 ·
 * 만드는 중인가 · 못 만들었나와 그 줄에 보이는 그림. 판단 모델의 목록 · 고칠 번호 검증 · 이미지 보기가 쓴다.
 */
vi.mock("server-only", () => ({}));

type 그림 = { id: string; projectId: string; generationRequestId: string; selected: boolean; assetPath: string; thumbPath: string | null };
let 작업들: Record<string, { id: string; ratio: string; data: Record<string, unknown> }>;
let 그림들: 그림[];
let 카드뉴스: Set<string>;
let 실패 = false;
let 읽은수 = 0;

vi.mock("../../poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async (id: string) => { 읽은수 += 1; return 작업들[id]; } },
    images: { byProjects: async () => { if (실패) throw new Error("db"); return 그림들; } },
  }),
}));
vi.mock("../cardnews-steps", () => ({
  cardnewsProjectIds: async (_userId: string, ids: readonly string[]) => new Set(ids.filter((id) => 카드뉴스.has(id))),
}));

const { loadEasyImages } = await import("../image-list");
const { withRowJob } = await import("../../../app/easy/row-image");

const 지금 = Date.parse("2026-10-07T12:00:00Z");
const 일감 = (r: string) => withRowJob("", { requestRowId: r, falRequestId: "f", endpoint: "e" });
const 줄 = (id: string, workId: string, body: string, 몇분전: number) =>
  ({ id, role: "image", body, workId, createdAt: new Date(지금 - 몇분전 * 60_000).toISOString() });

beforeEach(() => {
  작업들 = {
    p1: { id: "p1", ratio: "1:1", data: {} }, p2: { id: "p2", ratio: "1:1", data: {} }, p3: { id: "p3", ratio: "1:1", data: {} },
  };
  그림들 = [{ id: "img-1", projectId: "p1", generationRequestId: "r1", selected: false, assetPath: "me/1.png", thumbPath: null }];
  카드뉴스 = new Set(["card-1"]);
  실패 = false;
  읽은수 = 0;
});

describe("이 대화의 결과물 사실", () => {
  it("결과물 줄이 없으면 저장소를 안 읽고 비어 있다", async () => {
    const facts = await loadEasyImages("me", [{ id: "u1", role: "user", body: "안녕", workId: null }], 지금);
    expect(facts).toMatchObject({ entries: [], madeImage: false, lastIsImage: false });
    expect(읽은수).toBe(0);
  });

  it("이미지는 다 만든 것 · 만드는 중 · 못 만듦, 그 밖은 카드뉴스 · 지운 것으로 가르고, 다 만든 번호의 그림을 든다", async () => {
    const rows = [
      { id: "u1", role: "user", body: "카페 포스터", workId: null },
      줄("i1", "p1", 일감("r1"), 30), 줄("i2", "p2", 일감("r2"), 1), 줄("i3", "p3", 일감("r3"), 20),
      줄("c1", "card-1", "", 15), 줄("i4", "gone", 일감("r4"), 40),
    ];
    const facts = await loadEasyImages("me", rows, 지금);
    expect(facts.entries.map((one) => [one.n, one.kind, one.state])).toEqual([
      [1, "image", "done"], [2, "image", "making"], [3, "image", "failed"], [4, "cardnews", "done"], [5, "deleted", "deleted"],
    ]);
    expect(facts.entries[0]!.words).toBe("카페 포스터");
    expect(facts.madeImage).toBe(true);
    expect(facts.pictures.get(1)?.id).toBe("img-1");
    expect(facts.pictures.has(2)).toBe(false);
  });

  /** Review Focus 4 · 6 — 2차 최종 리뷰 5 */
  it("지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다 — 표시 없는 옛 포스터 줄도 그 번호의 그림을 든다", async () => {
    카드뉴스 = new Set();
    const facts = await loadEasyImages("me", [줄("c1", "card-gone", "", 9), 줄("i1", "p1", "", 5)], 지금);
    expect(facts.entries.map((one) => [one.n, one.kind])).toEqual([[1, "deleted"], [2, "image"]]);
    expect(facts.pictures.get(2)?.id).toBe("img-1");
  });

  /** 2차 최종 리뷰 a — 만드는 중에 「글자 크게」면 「고칠 것이 없다」가 아니라 「아직 준비 안 됨」이어야 한다. */
  it("만드는 중 · 못 만든 이미지만 있어도 고칠 수 있는 이미지로 본다 — 지운 것만 있으면 아니다", async () => {
    그림들 = [];
    expect((await loadEasyImages("me", [줄("i2", "p2", 일감("r2"), 1)], 지금)).madeImage).toBe(true);
    expect((await loadEasyImages("me", [줄("i3", "p3", 일감("r3"), 20)], 지금)).madeImage).toBe(true);
    expect((await loadEasyImages("me", [줄("i4", "gone", 일감("r4"), 1)], 지금)).madeImage).toBe(false);
  });

  it("지운 것을 뺀 마지막 결과물이 카드뉴스면 lastIsImage 는 false, 이미지면 true", async () => {
    expect((await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 5), 줄("c1", "card-1", "", 1)], 지금)).lastIsImage).toBe(false);
    expect((await loadEasyImages("me", [줄("c1", "card-1", "", 9), 줄("i1", "p1", 일감("r1"), 5), 줄("i4", "gone", "", 1)], 지금)).lastIsImage)
      .toBe(true);
  });

  it("저장소가 실패해도 턴을 깨지 않는다 — 빈 사실", async () => {
    실패 = true;
    const facts = await loadEasyImages("me", [줄("i1", "p1", 일감("r1"), 5)], 지금);
    expect(facts).toMatchObject({ entries: [], madeImage: false });
  });
});
```

`apps/web/lib/easy/__tests__/cardnews-steps.test.ts` — 44줄 import 를 `const { cardnewsProject, cardnewsProjectIds, draftCardnews, lastCardnewsProject } = await import("../cardnews-steps");` 로 바꾸고, 「카드뉴스 작업 찾기」 묶음 끝에 더한다:

```ts
  /** 2차 D2 — 결과물 번호의 갈래(카드뉴스인가)만 본다. 턴마다 부르므로 서명하지 않는다. */
  it("카드뉴스 작업인 id 만 고른다 — 남의 것 · 포스터는 빼고, 서명하지 않는다", async () => {
    expect(await cardnewsProjectIds("me", ["mine", "theirs", "poster-1"])).toEqual(new Set(["mine"]));
    expect(서명한것).toEqual([]);
    expect(await cardnewsProjectIds("me", [])).toEqual(new Set());
  });

  it("저장소 오류가 나도 실패하지 않고 빈 모음이다", async () => {
    expect(await cardnewsProjectIds("me", ["mine", "boom"])).toEqual(new Set());
  });
```

`apps/web/app/easy/__tests__/row-image.test.ts` — 맨 위 import 에 `rowFromOf, withRowFrom,` 를 더하고 파일 끝에 더한다:

```ts
/** 2차 D2 · Review Focus 3 — 고친 대상 줄 표시가 다른 표시와 섞이지 않는다. */
describe("고친 대상 줄 (;from=)", () => {
  const 일감 = { requestRowId: "r2", falRequestId: "f;a,b", endpoint: "fal-ai/x;from=y" };

  it("고친 줄 표시 · 넣은 사진 · 고친 대상 · 받을 정보가 안 섞인다", () => {
    const body = withRowJob(withRowFrom(editRowBody("r2", ["logo-1", "logo-2"]), "row;1,2"), 일감);
    expect(editRequestOf(body)).toBe("r2");
    expect(editAddedOf(body)).toEqual(["logo-1", "logo-2"]);
    expect(rowFromOf(body)).toBe("row;1,2");
    expect(rowJobOf(body)).toEqual(일감);
  });

  it("고친 대상이 없으면 붙이지 않고, 옛 줄은 비어 있다", () => {
    expect(withRowFrom(editRowBody("r2"), undefined)).toBe("edit-request:r2");
    expect(rowFromOf(withRowJob(editRowBody("r2"), 일감))).toBeUndefined();
    expect(rowFromOf("")).toBeUndefined();
  });
});
```

`apps/web/app/easy/__tests__/chat.test.ts` 끝에 더한다:

```ts
describe("이 대화의 결과물 목록 (2차 D2)", () => {
  const 목록 = [
    { n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "카페 포스터" },
    { n: 2, rowId: "c1", workId: "card-1", kind: "cardnews" as const, state: "done" as const, words: "건강 카드뉴스" },
    { n: 3, rowId: "i2", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image" as const, state: "making" as const, words: "배경만 파랗게" },
    { n: 4, rowId: "i3", workId: "gone", kind: "deleted" as const, state: "deleted" as const, words: "배너" },
  ];

  it("번호 · 갈래 · 만든 말 · 상태 · 고친 관계를 따로 싣고, 지난 대화의 결과물 줄에도 번호를 적는다", () => {
    const prompt = easyChatPrompt([말("image", "", "i1"), 말("image", "", "c1")], "아까 거", 0, false, false, true, { images: 목록 });
    expect(prompt).toContain("── 이 대화의 결과물");
    expect(prompt).toContain("#1 이미지 · 「카페 포스터」 · 완료");
    expect(prompt).toContain("#2 카드뉴스 · 「건강 카드뉴스」");
    expect(prompt).toContain("#3 이미지 · 「배경만 파랗게」 · 만드는 중 · #1 을 고친 것");
    expect(prompt).toContain("#4 (지운 결과) · 「배너」");
    expect(prompt).toContain("(#1 이미지를 만들어 보여 줬습니다)");
    expect(prompt).toContain("(#2 카드뉴스를 만들어 보여 줬습니다)");
  });

  it("결과물이 없으면 목록을 안 싣는다", () => {
    expect(easyChatPrompt([], "안녕")).not.toContain("── 이 대화의 결과물");
  });
});
```

`apps/web/app/easy/__tests__/message-row.test.tsx` 끝에 더한다:

```tsx
describe("결과물 이름표 (2차 D2)", () => {
  it("그림 밑에 「이미지 N」을 보인다 — 만드는 중에도", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} imageUrl="/a.png" resultLabel="이미지 2" />); });
    expect(글()).toContain("이미지 2");
    act(() => { view.update(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} resultLabel="이미지 3" />); });
    expect(글()).toContain("이미지 3");
    expect(글()).toContain("이미지를 만들고 있습니다");
  });

  it("지운 결과 줄에도 이름표가 남는다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "assistant", body: "이 작업은 지워졌습니다." }} resultLabel="결과물 1" />); });
    expect(글()).toContain("이 작업은 지워졌습니다.");
    expect(글()).toContain("결과물 1");
  });
});
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts` — 「실패 줄 · 받을 정보」 묶음 끝에 더한다:

```ts
  it("만든 이미지의 이름표를 응답에 싣는다 — 화면의 「이미지 N」 (2차 D2)", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    expect((await 보낸다({})).json.resultLabel).toBe("이미지 1");
  });
```

`apps/web/app/api/easy/__tests__/cardnews-route.test.ts` — 「카드뉴스 원고 (2단계 §3 · §5)」 묶음 끝에 더한다:

```ts
  /** 2차 D2 · 최종 리뷰 5 — 카드뉴스 줄도 결과물 번호를 받는다. 앞의 이미지 줄과 함께 센다. */
  it("원고 응답에 「카드뉴스 N」 이름표를 싣는다 — 번호는 앞의 결과물 줄과 함께 센다", async () => {
    역할판단 = 역할(["style", false]);
    expect((await 보낸다({ prompt: "건강 카드뉴스", referenceIds: [사진(1)] })).json.resultLabel).toBe("카드뉴스 1");
    지난줄들 = [{ id: "r0", role: "image", body: "", workId: "p-old" }];
    expect((await 보낸다({ prompt: "건강 카드뉴스", referenceIds: [사진(1)] })).json.resultLabel).toBe("카드뉴스 2");
  });
```

`apps/web/app/api/easy/__tests__/generate-ad.test.ts` — `lib/poster/stores` 모의의 `    images: { byProject: async () => [] },` 를 `    images: { byProject: async () => [], byProjects: async () => [] },` 로 바꾸고, `lib/easy/cardnews-steps` 모의의 `  lastCardnewsProject: async () => null,` 아래에 `  cardnewsProjectIds: async () => new Set<string>(),` 를 더한다(이 대화의 결과물 사실이 `byProjects` · `cardnewsProjectIds` 를 읽는다 — 진짜 카드뉴스 저장소로 가지 않게).

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts` · `generate-ask-answer.test.ts` — `lib/easy/cardnews-steps` 모의의 `  lastCardnewsProject: async () => null,` 아래에 같은 한 줄 `  cardnewsProjectIds: async () => new Set<string>(),` 를 더한다. `generate-ask-answer.test.ts` 의 `lib/poster/stores` 모의(Task 6)는 이미 `byProjects` 가 있다.

`apps/web/app/easy/__tests__/shell-wiring.test.ts` — 「카드뉴스 다시 열기 (2단계 §8)」 묶음 끝에 더한다:

```ts
  it("다시 열 때 결과물 이름표를 같은 함수로 세어 넘긴다 (2차 D2)", () => {
    expect(load).toContain("numberEasyResults(rows)");
    expect(코드("../[id]/page.tsx")).toContain("initialResultLabels={loaded.labels}");
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/image-numbers.test.ts lib/easy/__tests__/image-list.test.ts lib/easy/__tests__/cardnews-steps.test.ts app/easy/__tests__/row-image.test.ts app/easy/__tests__/chat.test.ts app/easy/__tests__/message-row.test.tsx app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/cardnews-route.test.ts app/easy/__tests__/shell-wiring.test.ts`
Expected: FAIL — `Failed to resolve import "../image-numbers"` · `"../image-list"`, `withRowFrom is not a function`, `cardnewsProjectIds is not a function`

- [ ] **Step 3: 고친 대상 표시를 더한다**

`apps/web/app/easy/row-image.ts` — 32줄을 찾아:

```ts
const 일감머리 = ";job=";
```

바로 아래에 더한다:

```ts

/**
 * **고친 대상 줄**(2026-10-07 2차 D2). 고친 줄 글에 「어느 줄의 그림을 고쳤나」를 적는다 — 판단
 * 모델에 주는 목록의 「#3 이미지 · #1 을 고친 것」이 이것으로 나온다. 고친 줄 표시 **뒤**,
 * 받을 정보 **앞**에 붙인다. 앞부분만 읽는 `editRequestOf` · `editAddedOf` 와 안 섞인다.
 */
const 고친곳머리 = ";from=";
```

`앞부분`(42~45줄)을 찾아:

```ts
/** 받을 정보 앞부분(고친 줄 표시 · 빈 글). */
function 앞부분(body: string): string {
  const at = body.indexOf(일감머리);
  return at < 0 ? body : body.slice(0, at);
}
```

이렇게 바꾼다:

```ts
/** 고친 대상 · 받을 정보 앞부분(고친 줄 표시 · 빈 글). */
function 앞부분(body: string): string {
  const 자리들 = [body.indexOf(고친곳머리), body.indexOf(일감머리)].filter((at) => at >= 0);
  return 자리들.length ? body.slice(0, Math.min(...자리들)) : body;
}
```

`rowJobOf` 함수(55줄부터) 바로 아래에 더한다:

```ts
/** 고친 줄에 고친 대상 줄을 붙인다. `withRowJob` 보다 먼저 부른다(받을 정보가 끝에 온다). */
export function withRowFrom(body: string, rowId: string | undefined): string {
  return rowId ? `${body}${고친곳머리}${encodeURIComponent(rowId)}` : body;
}

/** 고친 대상 줄 id. 없거나 깨졌으면 비어 있다. */
export function rowFromOf(body: string | null | undefined): string | undefined {
  const at = body?.indexOf(고친곳머리) ?? -1;
  if (at < 0) return undefined;
  const end = body!.indexOf(일감머리, at);
  try {
    return decodeURIComponent(body!.slice(at + 고친곳머리.length, end < 0 ? undefined : end)) || undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: 번호 함수를 만든다**

`apps/web/app/easy/image-numbers.ts`:

```ts
import { editRequestOf, rowFromOf } from "./row-image";
import { visibleBody } from "./row-marks";

/**
 * **이 대화의 결과물 번호**(2026-10-07 2차 설계 D2 · §3-2, 2차 최종 리뷰 5 — 컨트롤러 결정).
 *
 * 화면(「이미지 N」 · 「카드뉴스 N」)과 서버(판단 모델에 주는 목록 · 고칠 번호 검증)가 **같은 함수**를 쓴다.
 * 결과물 줄 — 포스터 그림 줄 · 카드뉴스 줄 · 작업을 지운 줄 **모두**(`role: "image"` + `workId`) — 에 대화
 * 차례대로 1, 2, … 를 붙인다. 고친 줄도 제 번호를 받는다(다른 그림이다).
 *
 * **표시도 작업 조회도 안 본다.** 그래서 2차 전에 남은 운영의 옛 줄(표시 없는 빈 글)도 데이터 SQL 없이 같은
 * 번호를 받고, 무엇을 지워도 뒤 번호가 당겨지지 않는다 — 「아까 1번」이 늘 같은 것을 가리킨다. 그 번호가
 * 무엇인지(이미지 · 카드뉴스 · 지운 것)는 따로 가른다(`resultKindOf`). 고치기는 이미지 번호일 때만이다.
 */
type Row = { id: string; role: string; workId?: string | null; body?: string | null };

export interface EasyResultNumber {
  n: number;
  rowId: string;
  workId: string;
  /** 고친 줄이면 고친 대상 줄. */
  fromRowId?: string;
}

export type EasyResultKind = "image" | "cardnews" | "deleted";

/** 이미지의 상태. 카드뉴스는 `done`, 지운 것은 `deleted` 로 둔다. */
export type EasyImageState = "done" | "making" | "failed" | "deleted";

export interface EasyResultEntry extends EasyResultNumber {
  kind: EasyResultKind;
  state: EasyImageState;
  /** 그 결과물을 만든 사용자 말 앞부분. */
  words: string;
  /** 고친 대상의 번호. */
  fromN?: number;
}

export function numberEasyResults(rows: readonly Row[]): EasyResultNumber[] {
  const 결과줄 = rows.filter((row): row is Row & { workId: string } => row.role === "image" && Boolean(row.workId));
  return 결과줄.map((row, index) => {
    // 고친 줄이면 고친 대상. `;from=` 이 없는 옛 고친 줄은 같은 작업의 첫 줄을 고친 것으로 본다.
    const from = rowFromOf(row.body)
      ?? (editRequestOf(row.body) ? 결과줄.find((one) => one.workId === row.workId)?.id : undefined);
    return { n: index + 1, rowId: row.id, workId: row.workId, ...(from && from !== row.id ? { fromRowId: from } : {}) };
  });
}

/** 다음에 남길 결과물 줄의 번호. */
export function nextResultNumber(rows: readonly Row[]): number {
  return numberEasyResults(rows).length + 1;
}

/** 그 번호가 무엇인가. 포스터 저장소에 있으면 이미지, 카드뉴스 저장소에 있으면 카드뉴스, 둘 다 없으면 지운 것. */
export function resultKindOf(workId: string, posters: ReadonlySet<string>, cardnews: ReadonlySet<string>): EasyResultKind {
  return posters.has(workId) ? "image" : cardnews.has(workId) ? "cardnews" : "deleted";
}

/** 화면 이름표. 지운 것은 무엇이었는지 모를 수 있어(표시 없는 옛 줄) 「결과물 N」이다. */
export function resultLabel(kind: EasyResultKind, n: number): string {
  return kind === "image" ? `이미지 ${n}` : kind === "cardnews" ? `카드뉴스 ${n}` : `결과물 ${n}`;
}

const 앞말길이 = 40;

/** 번호마다 갈래 · 상태 · 만든 말 · 고친 번호. 갈래 · 상태는 부르는 쪽(서버)이 안다. */
export function describeEasyResults(
  rows: readonly Row[],
  numbered: readonly EasyResultNumber[],
  factOf: (entry: EasyResultNumber) => { kind: EasyResultKind; state: EasyImageState },
): EasyResultEntry[] {
  const 번호 = new Map(numbered.map((one) => [one.rowId, one.n]));
  return numbered.map((one) => {
    const at = rows.findIndex((row) => row.id === one.rowId);
    const 말 = rows.slice(0, Math.max(at, 0)).reverse().find((row) => row.role === "user");
    const fromN = one.fromRowId ? 번호.get(one.fromRowId) : undefined;
    return {
      ...one,
      ...factOf(one),
      words: 말 ? visibleBody({ role: "user", body: 말.body ?? "" }).slice(0, 앞말길이) : "",
      ...(fromN ? { fromN } : {}),
    };
  });
}

/** 고칠 수 있는(다 만든) 이미지 번호. 카드뉴스 · 지운 것 · 만드는 중은 뺀다. */
export function doneImageNumbers(entries: readonly EasyResultEntry[]): number[] {
  return entries.filter((one) => one.kind === "image" && one.state === "done").map((one) => one.n);
}
```

- [ ] **Step 5: 서버가 결과물 사실을 읽는다**

`apps/web/lib/easy/cardnews-steps.ts` — `cardnewsProject`(84~90줄) 바로 아래에 더한다:

```ts
/**
 * 이 회원의 카드뉴스 작업인 id(2026-10-07 2차 D2 — 결과물 번호의 갈래). 턴마다 부르므로 **있는지만** 보고
 * 그림 주소는 서명하지 않는다. 못 읽어도 턴을 깨지 않는다 — 빈 모음(그 번호는 「지운 결과」로 보인다).
 */
export async function cardnewsProjectIds(userId: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const store = await snsFlowStoreForUser(userId);
    const found = await Promise.all(ids.map((id) => store.get(id)));
    return new Set(found.flatMap((one) => (one && one.userId === userId ? [one.id] : [])));
  } catch (error) {
    console.warn("[easy] 카드뉴스 작업을 읽지 못했습니다", error instanceof Error ? error.message : error);
    return new Set();
  }
}
```

`apps/web/lib/easy/image-list.ts`:

```ts
import {
  describeEasyResults, numberEasyResults, resultKindOf,
  type EasyImageState, type EasyResultEntry, type EasyResultKind, type EasyResultNumber,
} from "../../app/easy/image-numbers";
import { editedRequestIds, pickRowImage } from "../../app/easy/row-image";
import { posterStoresForUser } from "../poster/stores";
import { cardnewsProjectIds } from "./cardnews-steps";

/**
 * **이 대화의 결과물 사실**(2026-10-07 2차 설계 D2 · D5).
 *
 * 번호(`numberEasyResults` — 이미지 · 카드뉴스 · 지운 것 모두)마다 갈래 · 상태와 이미지 줄에 보이는 그림.
 * 판단 모델의 목록(12줄 창 밖의 결과물도 고를 수 있게) · 고칠 번호 검증(`edit-target.ts`) · 이미지
 * 보기(`see-turn.ts`)가 쓴다.
 *
 * **못 읽어도 턴을 깨지 않는다** — 빈 사실을 돌려준다(목록 없이 예전처럼 판단한다). 결과물 줄이 없으면
 * 저장소를 안 읽는다.
 */
type Row = { id: string; role: string; workId?: string | null; body?: string | null; createdAt?: string };

export interface EasyPicture {
  id: string;
  projectId: string;
  generationRequestId: string;
  selected: boolean;
  assetPath: string;
  thumbPath?: string | null;
}

export interface EasyImageFacts {
  entries: EasyResultEntry[];
  /** 포스터 저장소에 있는 작업(지운 것 · 카드뉴스는 없다). */
  posters: ReadonlySet<string>;
  /** 번호 → 그 줄에 보이는 그림(다 만든 이미지 번호만). */
  pictures: ReadonlyMap<number, EasyPicture>;
  /**
   * 고칠 수 있는 이미지가 있나 — **지운 것만 뺀다**(2차 최종 리뷰 a). 만드는 중 · 못 만든 이미지도 넣는다:
   * 그때 「글자 크게」면 「고칠 것이 없다」가 아니라 「아직 준비 안 됨」 · 「못 만든 이미지」를 말해야 한다.
   */
  madeImage: boolean;
  /** 지운 것을 뺀 이 대화의 마지막 결과물이 이미지인가. 카드뉴스면 false. */
  lastIsImage: boolean;
}

const 비었다: EasyImageFacts = { entries: [], posters: new Set(), pictures: new Map(), madeImage: false, lastIsImage: false };

/** 그림이 없는 줄이 이만큼 지나면 못 만든 것으로 본다(`row-image.ts` 의 고치기 실패 시간과 같다). */
const 실패로볼시간 = 10 * 60 * 1000;

export async function loadEasyImages(userId: string, rows: readonly Row[], now = Date.now()): Promise<EasyImageFacts> {
  const ids = [...new Set(rows.flatMap((row) => (row.role === "image" && row.workId ? [row.workId] : [])))];
  if (!ids.length) return 비었다;
  try {
    const stores = posterStoresForUser(userId);
    const found = await Promise.all(ids.map((id) => stores.projects.get(id).catch(() => undefined)));
    const posters = new Set(found.flatMap((project) => (project ? [project.id] : [])));
    // 포스터가 아닌 작업만 카드뉴스인지 본다(있는지만 — 서명하지 않는다).
    const cards = await cardnewsProjectIds(userId, ids.filter((id) => !posters.has(id)));
    const images: EasyPicture[] = posters.size ? await stores.images.byProjects([...posters]) : [];
    const numbered = numberEasyResults(rows);
    const 줄 = (rowId: string) => rows.find((row) => row.id === rowId);
    const pictures = new Map(numbered.flatMap((one) => {
      const picked = posters.has(one.workId)
        ? pickRowImage(줄(one.rowId) ?? {}, images.filter((image) => image.projectId === one.workId), editedRequestIds(rows, one.workId))
        : undefined;
      return picked ? [[one.n, picked] as const] : [];
    }));
    const factOf = (one: EasyResultNumber): { kind: EasyResultKind; state: EasyImageState } => {
      const kind = resultKindOf(one.workId, posters, cards);
      if (kind !== "image") return { kind, state: kind === "deleted" ? "deleted" : "done" };
      if (pictures.has(one.n)) return { kind, state: "done" };
      const at = Date.parse(줄(one.rowId)?.createdAt ?? "");
      return { kind, state: Number.isFinite(at) && now - at >= 실패로볼시간 ? "failed" : "making" };
    };
    const entries = describeEasyResults(rows, numbered, factOf);
    const 마지막 = [...entries].reverse().find((one) => one.kind !== "deleted");
    return {
      entries, posters, pictures,
      madeImage: entries.some((one) => one.kind === "image"),
      lastIsImage: 마지막?.kind === "image",
    };
  } catch (error) {
    console.warn("[easy] 이 대화의 결과물을 읽지 못했습니다", error instanceof Error ? error.message : error);
    return 비었다;
  }
}
```

- [ ] **Step 6: 판단 모델에 목록을 준다**

`apps/web/app/easy/chat-facts.ts` — 맨 위 import 아래에 더한다:

```ts
import type { EasyImageState, EasyResultEntry } from "./image-numbers";
```

끝에 더한다:

```ts
const 상태말: Record<EasyImageState, string> = { done: "완료", making: "만드는 중", failed: "만들지 못함", deleted: "지움" };

function 결과물줄(one: EasyResultEntry): string {
  const 말 = one.words ? `「${one.words}」` : "";
  if (one.kind === "deleted") return [`#${one.n} (지운 결과)`, 말].filter(Boolean).join(" · ");
  if (one.kind === "cardnews") return [`#${one.n} 카드뉴스`, 말].filter(Boolean).join(" · ");
  return [`#${one.n} 이미지`, 말, 상태말[one.state], one.fromN ? `#${one.fromN} 을 고친 것` : ""].filter(Boolean).join(" · ");
}

/**
 * **이 대화의 결과물 목록**(2026-10-07 2차 D2, 최종 리뷰 5). 지난 대화 창 밖의 결과물도 번호로 고를 수 있게
 * 따로 싣는다. 번호는 화면의 「이미지 N」 · 「카드뉴스 N」과 같고, 이미지 · 카드뉴스 · 지운 것을 함께 센다.
 */
export function easyResultListLines(entries: readonly EasyResultEntry[]): string[] {
  if (!entries.length) return [];
  return [
    "── 이 대화의 결과물 (번호는 화면의 「이미지 N」 · 「카드뉴스 N」과 같습니다) ──",
    ...entries.map(결과물줄),
    "번호는 이미지 · 카드뉴스 · 지운 결과를 함께 셉니다. 이미지로 고칠 수 있는 것은 「이미지」라고 적힌 번호뿐입니다.",
    "",
  ];
}

/** 지난 대화의 결과물 줄을 판단 모델에 보일 글(2차 D2). 번호를 모르면 예전 글 그대로다. */
export function easyResultRowText(entry: EasyResultEntry | undefined): string {
  if (!entry) return "(이미지 한 장을 만들어 보여 줬습니다)";
  if (entry.kind === "cardnews") return `(#${entry.n} 카드뉴스를 만들어 보여 줬습니다)`;
  if (entry.kind === "deleted") return `(#${entry.n} 결과물을 만들어 보여 줬습니다. 지금은 지웠습니다)`;
  return `(#${entry.n} 이미지를 만들어 보여 줬습니다)`;
}
```

`apps/web/app/easy/chat.ts`:

(a) chat-facts import 줄에 `easyResultListLines, easyResultRowText` 를 더하고, 그 아래에 `import type { EasyResultEntry } from "./image-numbers";` 를 더한다.

(b) `EasyPromptOptions` 의 `  adNegated?: boolean;` 아래에 더한다:

```ts
  /** 2차 D2: 이 대화의 결과물(번호 · 갈래 · 상태). 목록으로 싣고, 지난 대화의 결과물 줄에도 번호를 적는다. */
  images?: readonly EasyResultEntry[];
```

(c) 아래를 찾아:

```ts
  const 지난말 = history
```

바로 **앞**에 더한다:

```ts
  // 2차 D2: 결과물 줄에도 화면의 「이미지 N」 · 「카드뉴스 N」 번호를 적는다.
  const 결과물 = new Map((options.images ?? []).map((one) => [one.rowId, one]));
```

그리고 아래를 찾아:

```ts
      const body = message.role === "image"
        ? "(이미지 한 장을 만들어 보여 줬습니다)"
        : visibleBody(message).slice(0, 한줄최대);
```

이렇게 바꾼다:

```ts
      const body = message.role === "image"
        ? easyResultRowText(결과물.get(message.id))
        : visibleBody(message).slice(0, 한줄최대);
```

(d) 아래 한 줄을 찾아:

```ts
    지난말.length ? "── 지난 대화 ──" : "── 첫 말입니다 ──",
```

바로 **앞**에 더한다:

```ts
    // 2차 D2: 지난 대화 창 밖의 결과물도 고를 수 있게 목록을 따로 싣는다.
    ...easyResultListLines(options.images ?? []),
```

`apps/web/lib/easy/judge.ts`:

(a) 1~6줄 import 아래에 `import type { EasyResultEntry } from "../../app/easy/image-numbers";` 를 더한다.

(b) `EasyJudgeInput` 의 `  adStep?: EasyAdStep;`(31줄) 아래에 더한다:

```ts
  /** 2차 D2: 이 대화의 결과물(번호 · 갈래 · 상태). 판단 모델이 고칠 번호를 고른다. */
  images?: readonly EasyResultEntry[];
```

(c) 43줄 `easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, { retry, adNegated }),` 를 아래로 바꾼다:

```ts
      easyChatPrompt(input.history, input.prompt, input.attachmentCount, hasDraft, made, madeImage, {
        retry, adNegated, images: input.images,
      }),
```

- [ ] **Step 7: 라우트가 결과물 사실을 읽고 이름표를 돌려준다**

`apps/web/app/api/easy/generate/route.ts`:

(a) `import { askTurn, type AskTurnContext } from "../../../../lib/easy/ask-turn";` 아래에 더한다:

```ts
import { loadEasyImages } from "../../../../lib/easy/image-list";
import { nextResultNumber, resultLabel } from "../../../easy/image-numbers";
```

(b) `    const 고칠그림 = await lastEasyImage(auth.member.userId, 지난줄);` 아래에 더한다:

```ts
    // 이 대화의 결과물(번호 · 갈래 · 상태 · 그림, 2차 D2). 판단 모델에 목록으로 준다. 못 읽어도 턴은 간다.
    const 이미지들 = await loadEasyImages(auth.member.userId, 지난줄);
```

(c) 판단 입력의 `          adStep: 광고,` 아래에 더한다:

```ts
          images: 이미지들.entries,
```

(d) 이미지 응답의 `      photoRoles: 사진판단?.rows ?? [],` 아래에 더한다:

```ts
      // 화면의 「이미지 N」(2차 D2). 화면과 같은 함수로 센 결과물 번호다.
      resultLabel: resultLabel("image", nextResultNumber(지난줄)),
```

(e) 카드뉴스 원고 턴 — Task 4 가 고친 넘김 줄 `        wants, 사진들, 붙인것, input, decision, provider, 고칠원고, 물음: 물음맥락, 말한것, 고른, 지시, userBody: 사용자글,` 아래에 `        결과번호: nextResultNumber(지난줄),` 를 더하고, ctx 모양의 `  userBody: string;`(Task 4 가 더한 것) 아래에 더한다:

```ts
  /** 남길 원고 줄의 결과물 번호(2차 D2 — 화면의 「카드뉴스 N」). */
  결과번호: number;
```

원고 응답 `  return Response.json({ ok: true, cardnews: { rowId: row.id, project }, message: row, photoRoles, textModel: ctx.textModel });` 를 바꾼다:

```ts
  return Response.json({
    ok: true, cardnews: { rowId: row.id, project }, message: row, photoRoles, textModel: ctx.textModel,
    // 화면의 「카드뉴스 N」(2차 D2). 이미지와 같은 결과물 번호다.
    resultLabel: resultLabel("cardnews", ctx.결과번호),
  });
```

- [ ] **Step 8: 다시 열 때 · 만든 직후 화면이 이름표를 보인다**

`apps/web/app/easy/_components/load.ts`:

(a) 10줄 `import { editedRequestIds, jobRowStates, pickRowImage, rowJobRequestIds } from "../row-image";` 아래에 `import { numberEasyResults, resultKindOf, resultLabel } from "../image-numbers";` 를 더한다.

(b) 89줄 `  let 아는작업 = new Set<string>();` 아래에 더한다:

```ts
  // 포스터 작업(결과물 이름표의 「이미지」, 2차 D2). 아는 작업 가운데 포스터가 아닌 것이 카드뉴스다.
  let 포스터작업 = new Set<string>();
```

(c) 115줄 `    아는작업 = new Set([...projects.keys(), ...카드작업.keys()]);` 아래에 `    포스터작업 = new Set(projects.keys());` 를 더한다.

(d) 157줄 마지막 `  return { conversation, messages, urls, options, cardnews, pending: 받기.pending, failed: 받기.failed };` 를 바꾼다:

```ts
  /*
   * 결과물 이름표(2차 D2) — 이미지 · 카드뉴스 · 지운 것 모두 대화 차례대로 센다. 서버 판단과 같은 함수다.
   * `resultKindOf` 는 포스터를 먼저 보므로 「아는 작업」을 카드뉴스 자리에 넘겨도 된다.
   */
  const labels = Object.fromEntries(numberEasyResults(rows).map((one) => [
    one.rowId, resultLabel(resultKindOf(one.workId, 포스터작업, 아는작업), one.n),
  ]));
  return { conversation, messages, urls, options, cardnews, pending: 받기.pending, failed: 받기.failed, labels };
```

`apps/web/app/easy/[id]/page.tsx` — `      initialFailed={loaded.failed}` 아래에 `      initialResultLabels={loaded.labels}` 를 더한다.

`apps/web/app/easy/easy-client.tsx`:

(a) `EasyClientProps` 의 `  initialFailed?: string[];` 아래에 더한다:

```ts
  /** 줄 id → 「이미지 N」 · 「카드뉴스 N」(2차 D2). 다시 열 때 `load.ts` 가 서버와 같은 함수로 센다. */
  initialResultLabels?: Record<string, string>;
```

구조 분해의 `  initialFailed,` 아래에 `  initialResultLabels,` 를 더한다.

(b) `  const [urls, setUrls] = React.useState<Record<string, string>>(initialUrls ?? {});` 아래에 더한다:

```ts
  const [labels, setLabels] = React.useState<Record<string, string>>(initialResultLabels ?? {});
```

(c) Task 5 가 넣은 `      // 카드뉴스 원고 · 손보기(2단계 · 3단계). 값은 원고까지 안 든다.` 줄 바로 **앞**에 더한다:

```ts
      // 화면의 「카드뉴스 N」(2차 D2). 서버가 같은 함수로 센 결과물 번호다.
      if (body.ok && body.cardnews?.rowId && typeof body.resultLabel === "string") {
        setLabels((current) => ({ ...current, [body.cardnews.rowId]: body.resultLabel }));
      }
```

그리고 `      setMessages((current) => [...current, { id: 자리, role: "image", body: "" }]);` 아래에 더한다:

```ts
      // 화면의 「이미지 N」(2차 D2). 서버가 같은 함수로 센 결과물 번호다.
      if (typeof body.resultLabel === "string") setLabels((current) => ({ ...current, [자리]: body.resultLabel }));
```

(d) `              failed={failed[message.id]}` 아래에 `              resultLabel={labels[message.id]}` 를 더한다.

`apps/web/app/easy/_components/message.tsx`:

(a) `AssistantMark` 함수 아래에 더한다:

```tsx
/** 「이미지 N」 · 「카드뉴스 N」(2차 D2). 사용자가 번호로 말할 수 있게 결과물 밑에 작게 적는다. */
function ResultLabel({ label }: { label?: string }) {
  return label ? <span className="text-meta text-subtle-foreground">{label}</span> : null;
}
```

(b) `EasyMessageRow` props 에 `askControls` 다음으로 더한다(구조 분해와 타입 둘 다):

```tsx
  /** 이 대화의 결과물 이름표(2차 D2). 지운 결과의 줄에도 자리를 지킨 이름표가 온다. */
  resultLabel?: string;
```

(c) 도우미 줄 갈래의 Task 5 가 넣은 아래를 찾아:

```tsx
        ) : askControls ? (
```

바로 **앞**에 더한다(지운 작업의 줄은 도우미 줄로 바뀌어 온다 — `deleted-work.ts`):

```tsx
        ) : resultLabel ? (
          <div className="grid max-w-[85%] gap-1">
            <p className={말풍선}>{visibleBody(message)}</p>
            <ResultLabel label={resultLabel} />
          </div>
```

(d) 카드뉴스 줄을 찾아:

```tsx
  if (cardnews) {
    return (
      <div className="flex items-start gap-2">
        <AssistantMark />
        <EasyCardnewsCard {...cardnews} />
      </div>
    );
  }
```

이렇게 바꾼다:

```tsx
  if (cardnews) {
    return (
      <div className="flex items-start gap-2">
        <AssistantMark />
        <div className="grid min-w-0 flex-1 gap-1">
          <EasyCardnewsCard {...cardnews} />
          <ResultLabel label={resultLabel} />
        </div>
      </div>
    );
  }
```

(e) 그림 줄(마지막 `return`)에서 아래를 찾아:

```tsx
    <div className="flex items-start gap-2">
      <AssistantMark />
      {imageUrl ? (
```

이렇게 바꾼다:

```tsx
    <div className="flex items-start gap-2">
      <AssistantMark />
      <div className="grid gap-1">
      {imageUrl ? (
```

그리고 같은 `return` 의 끝을 찾아:

```tsx
        <EasyImageWorking />
      )}
    </div>
  );
}
```

이렇게 바꾼다:

```tsx
        <EasyImageWorking />
      )}
      <ResultLabel label={resultLabel} />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: 시험 · 타입 · 줄 수를 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy`
Expected: PASS

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `wc -l apps/web/app/easy/easy-client.tsx apps/web/app/easy/chat.ts apps/web/app/easy/image-numbers.ts apps/web/lib/easy/image-list.ts`
Expected: `easy-client.tsx` 800 이하, 새 파일 둘은 각각 130 줄 아래. 보고에 적는다

- [ ] **Step 10: 커밋**

```bash
git add apps/web/app/easy/row-image.ts apps/web/app/easy/image-numbers.ts apps/web/lib/easy/image-list.ts apps/web/lib/easy/cardnews-steps.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/judge.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/_components/load.ts "apps/web/app/easy/[id]/page.tsx" apps/web/app/easy/easy-client.tsx apps/web/app/easy/_components/message.tsx apps/web/app/easy/__tests__/image-numbers.test.ts apps/web/lib/easy/__tests__/image-list.test.ts apps/web/lib/easy/__tests__/cardnews-steps.test.ts apps/web/app/easy/__tests__/row-image.test.ts apps/web/app/easy/__tests__/chat.test.ts apps/web/app/easy/__tests__/message-row.test.tsx apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/cardnews-route.test.ts apps/web/app/easy/__tests__/shell-wiring.test.ts apps/web/app/api/easy/__tests__/generate-ad.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts apps/web/app/api/easy/__tests__/generate-ask-answer.test.ts
git commit -m "feat(easy): 이 대화의 결과물에 차례 번호를 붙여 화면과 판단 모델이 같은 번호로 부른다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: 이 대화의 어느 이미지든 번호로 고친다 — 줄 단위 검증 · 「어느 이미지?」 물음 (D2 고치기)

**Files:**
- Create: `apps/web/lib/easy/edit-target.ts`
- Modify: `apps/web/app/easy/chat.ts` (`readEasyDecision` 번호 · `EasyPromptOptions.lastIsImage` · image_edit 안내 · 마지막 결과 줄 · 번호 줄), `apps/web/app/easy/chat-facts.ts` (`ASK_TARGET_NOTE` · `easyTargetLines` · `easyLastResultLines`)
- Modify: `apps/web/lib/easy/chat-provider.ts:69-71` (`target`), `apps/web/lib/easy/judge.ts` (`lastIsImage`)
- Modify: `apps/web/lib/easy/image-edit-turn.ts` (`projectTarget` · 줄 단위 그림 · `;from=` · 이름표)
- Modify: `apps/web/lib/easy/ask-turn.ts` (`replyTurn`), `apps/web/app/easy/turn-words.ts` (`TARGET_QUESTION`)
- Modify: `apps/web/app/api/easy/generate/route.ts` (마지막 이미지 → 결과물 사실, 번호 물음, 고치기 길, 단추 답 다시 보기의 고칠 이미지)
- Modify: `apps/web/app/easy/ask-answers.ts` (`askNumbers` · `targetReply`), `apps/web/app/easy/_components/ask-row.tsx` (번호 단추)
- Test: `apps/web/lib/easy/__tests__/edit-target.test.ts` (새), `apps/web/app/easy/__tests__/chat-image-edit.test.ts` (더함), `apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts:21-23`, `apps/web/lib/easy/__tests__/image-edit-turn.test.ts` (고침 · 더함), `apps/web/app/api/easy/__tests__/generate-image-edit.test.ts` (모의 · 더함), `apps/web/app/easy/__tests__/message-row.test.tsx` (더함)

**Interfaces:**
- Consumes: Task 2 — `EasyDecision.target`, `buttonDecision`(target 물음 → `image_edit`), `fitButtonDecision`, `settleTypedAnswer`(번호 물음 뒤 image_edit 은 답). Task 3 — `askTurn`, `AskTurnContext`, `askText`, `aiText`. Task 6 — `EasyImageTarget.keptIds`. Task 7 — `EasyImageFacts`(`entries` · `posters` · `madeImage` · `lastIsImage`), `EasyResultEntry`(`kind`), `doneImageNumbers`, `nextResultNumber`, `resultLabel`, `withRowFrom`, `rowFromOf`
- Produces:
  - `chat-facts.ts`: `ASK_TARGET_NOTE = "ask_target"`, `easyTargetLines(doneCount: number): string[]`, `easyLastResultLines(lastIsImage: boolean): string[]`
  - `chat.ts`: `EasyPromptOptions.lastIsImage?: boolean`; `readEasyDecision` 이 `image_edit` 일 때만 `target` 을 준다
  - `judge.ts`: `EasyJudgeInput.lastIsImage?: boolean`
  - `image-edit-turn.ts`: `projectTarget(userId: string, projectId: string | undefined): Promise<EasyImageTarget | null>`; `imageEditTurn` ctx 에 `rowId?: string`, `resultLabel?: string`(새 고친 줄의 「이미지 N」 — 응답 칸 `resultLabel`)
  - `edit-target.ts`: `export type EditTargetPick = { ok: true; target: EasyImageTarget; rowId?: string; n?: number } | { ok: false; message: string }`, `pickEditTarget(userId, rows, facts: EasyImageFacts, target: number | undefined): Promise<EditTargetPick>` — 번호는 **이미지 번호일 때만** 고친다(카드뉴스 · 지운 결과 번호는 값 없이 사실 문장, 2차 최종 리뷰 5), `targetAskNumbers(decision: { wants: string; note?: string }, facts: EasyImageFacts): number[] | undefined` — 라우트는 실행하는 갈래(`wants`)로 부른다
  - `ask-turn.ts`: `replyTurn(ctx: AskTurnContext, body: string): Promise<Response>` — 사용자 줄 + 도우미 줄, `{ ok, talked: true, message, textModel }`
  - `turn-words.ts`: `TARGET_QUESTION`
  - `ask-answers.ts`: `askNumbers(value: unknown): number[]`, `targetReply(rowId: string, n: number): EasyButtonReply`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/easy/__tests__/edit-target.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **고칠 번호 검증 — 줄 단위**(2026-10-07 2차 설계 D2 · §3-2). 고칠 수 있는 것은 이 대화에서
 * 만든, 지워지지 않은, 다 만들어진 포스터 이미지뿐이다. 결과물 번호는 카드뉴스 · 지운 결과도 함께
 * 세므로(2차 최종 리뷰 5) 그 번호면 값 없이 사실대로 답한다. 없는 번호 · 못 만듦도 같고, 만드는 중이면
 * 기다리라고 한다.
 */
vi.mock("server-only", () => ({}));

let 마지막: unknown;
// 진짜 모듈은 포스터 고치기 라우트까지 불러온다 — 여기서 쓰는 셋만 가짜로 준다.
vi.mock("../image-edit-turn", () => ({
  IMAGE_NOT_READY: "아직 만드는 중입니다.",
  lastEasyImage: async () => 마지막,
  projectTarget: async (_userId: string, projectId: string | undefined) =>
    (projectId ? { projectId, ratio: "1:1", keptIds: new Set<string>() } : null),
}));

const { pickEditTarget, targetAskNumbers } = await import("../edit-target");
const { IMAGE_NOT_READY } = await import("../image-edit-turn");

type 항목 = {
  n: number; rowId: string; workId: string; fromRowId?: string; fromN?: number;
  kind: "image" | "cardnews" | "deleted"; state: "done" | "making" | "failed" | "deleted"; words: string;
};
const 목록: 항목[] = [
  { n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페" },
  { n: 2, rowId: "i2", workId: "p2", kind: "image", state: "making", words: "배너" },
  { n: 3, rowId: "i3", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image", state: "done", words: "배경" },
  { n: 4, rowId: "i4", workId: "gone", kind: "deleted", state: "deleted", words: "옛것" },
  { n: 5, rowId: "i5", workId: "p2", kind: "image", state: "failed", words: "실패" },
  { n: 6, rowId: "c6", workId: "card-1", kind: "cardnews", state: "done", words: "건강 카드뉴스" },
];
const 사실 = (entries: 항목[] = 목록) =>
  ({ entries, posters: new Set(["p1", "p2"]), pictures: new Map(), madeImage: true, lastIsImage: true });

beforeEach(() => { 마지막 = { projectId: "last", ratio: "1:1", keptIds: new Set() }; });

describe("고칠 번호 (2차 D2)", () => {
  /** Review Focus 4 — 같은 작업의 마지막 줄이 아니라 그 번호의 줄이다. */
  it("번호를 주면 그 줄을 고칠 대상으로 준다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 1)).toMatchObject({ ok: true, target: { projectId: "p1" }, rowId: "i1", n: 1 });
    expect(await pickEditTarget("me", [], 사실(), 3)).toMatchObject({ ok: true, target: { projectId: "p1" }, rowId: "i3", n: 3 });
  });

  it("없는 번호 · 지운 결과 · 못 만든 이미지는 값 없이 사실대로 답한다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 9))
      .toEqual({ ok: false, message: "9번은 이 대화에 없습니다. 고칠 수 있는 것은 이미지 1 · 이미지 3 입니다." });
    expect(await pickEditTarget("me", [], 사실(), 4)).toMatchObject({ ok: false, message: expect.stringContaining("지운 결과") });
    expect(await pickEditTarget("me", [], 사실(), 5)).toMatchObject({ ok: false, message: expect.stringContaining("만들지 못한") });
  });

  /** 2차 최종 리뷰 5 · Review Focus 4 — 결과물 번호는 카드뉴스도 센다. 그 번호를 이미지 고치기로 고치지 않는다. */
  it("카드뉴스 번호는 이미지 고치기로 안 고치고 값 없이 사실대로 답한다", async () => {
    const 답 = await pickEditTarget("me", [], 사실(), 6);
    expect(답).toMatchObject({ ok: false, message: expect.stringContaining("6번은 카드뉴스") });
    expect(답).toMatchObject({ message: expect.stringContaining("고칠 수 있는 것은 이미지 1 · 이미지 3 입니다.") });
  });

  it("만드는 중이면 기다리라고 한다", async () => {
    expect(await pickEditTarget("me", [], 사실(), 2)).toEqual({ ok: false, message: IMAGE_NOT_READY });
  });

  it("번호가 없으면 지금처럼 마지막 결과, 마지막이 카드뉴스면 이 대화의 마지막 이미지(지운 것 · 카드뉴스는 건너뜀)", async () => {
    expect(await pickEditTarget("me", [], 사실(), undefined)).toMatchObject({ ok: true, target: { projectId: "last" } });
    마지막 = null;
    expect(await pickEditTarget("me", [], 사실(), undefined)).toMatchObject({ ok: true, target: { projectId: "p2" } });
  });
});

describe("어느 이미지인지 묻기 (2차 D2)", () => {
  it("판단 모델이 talk + ask_target 이고 다 만든 이미지가 둘 이상이면 그 번호들", () => {
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실())).toEqual([1, 3]);
  });

  it("다 만든 이미지가 하나뿐이거나 표시가 없으면 묻지 않는다 — 카드뉴스 번호는 세지 않는다", () => {
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실(목록.slice(0, 2)))).toBeUndefined();
    expect(targetAskNumbers({ wants: "talk", note: "ask_target" }, 사실([목록[0]!, 목록[5]!]))).toBeUndefined();
    expect(targetAskNumbers({ wants: "talk", note: "" }, 사실())).toBeUndefined();
    expect(targetAskNumbers({ wants: "image_edit", note: "ask_target" }, 사실())).toBeUndefined();
  });
});
```

`apps/web/app/easy/__tests__/chat-image-edit.test.ts` 끝에 더한다:

```ts
describe("고칠 이미지 번호 (2차 D2)", () => {
  const 둘 = [
    { n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "a" },
    { n: 2, rowId: "i2", workId: "p2", kind: "image" as const, state: "done" as const, words: "b" },
  ];

  it("돌아온 번호는 image_edit 일 때만, 1 이상의 정수만 읽는다", () => {
    expect(readEasyDecision({ wants: "image_edit", reply: "", target: 2 }, { editableImage: true })).toMatchObject({ wants: "image_edit", target: 2 });
    expect(readEasyDecision({ wants: "image", reply: "", target: 2 }).target).toBeUndefined();
    expect(readEasyDecision({ wants: "image_edit", reply: "", target: 0 }, { editableImage: true }).target).toBeUndefined();
    expect(readEasyDecision({ wants: "image_edit", reply: "", target: 1.5 }, { editableImage: true }).target).toBeUndefined();
  });

  it("이미지 고치기가 있을 때만 번호 고르는 법을 알리고, 다 만든 것이 둘 이상이면 모를 때 묻게 한다", () => {
    expect(easyChatPrompt([], "고쳐줘", 0, false, false, true, { images: 둘 })).toContain("`ask_target`");
    expect(easyChatPrompt([], "고쳐줘", 0, false, false, true, { images: 둘.slice(0, 1) })).toContain("`target`");
    expect(easyChatPrompt([], "고쳐줘", 0, false, false, true, { images: 둘.slice(0, 1) })).not.toContain("ask_target");
    expect(easyChatPrompt([], "고쳐줘", 0, false, false, false)).not.toContain("`target`");
  });

  it("마지막 결과가 카드뉴스면 콕 집지 않은 고치기는 원고 고치기라고 알린다", () => {
    const prompt = easyChatPrompt([], "고쳐줘", 0, true, false, true, { lastIsImage: false });
    expect(prompt).toContain("마지막으로 만든 것은 카드뉴스입니다");
    expect(prompt).not.toContain("마지막으로 만든 것은 이미지 한 장");
  });
});
```

`apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts` — 21~23줄을 바꾼다:

```ts
    expect(schema.properties.card).toEqual({ type: "integer" });
    expect(schema.properties.note).toEqual({ type: "string" });
    // 2차 D2: 고칠 이미지 번호(없으면 0). 틀에 없으면 아무리 시켜도 안 온다.
    expect(schema.properties.target).toEqual({ type: "integer" });
    expect(schema.required).toEqual(["wants", "reply", "ratio", "look", "card", "note", "target"]);
```

`apps/web/lib/easy/__tests__/image-edit-turn.test.ts`:

(a) 40~41줄 import 를 바꾼다:

```ts
const { countEasyImages, imageEditTurn, lastEasyImage, projectTarget } = await import("../image-edit-turn");
const { editRowBody, rowFromOf, withRowFrom, withRowJob } = await import("../../../app/easy/row-image");
```

(b) 「말과 고친 줄을 대화에 남긴다」의 둘째 기대를 바꾼다(고친 대상 줄 `;from=` 이 붙는다 — 2차 D2):

```ts
      { conversationId: "c1", role: "image", workId: "p1", body: withRowJob(withRowFrom(editRowBody("r2"), "i-p1-"), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) },
```

(c) 「넣은 사진을 고친 줄에 적어 둔다」의 기대를 바꾼다:

```ts
    expect(남긴줄.at(-1)).toMatchObject({ role: "image", body: withRowJob(withRowFrom(editRowBody("r2", ["logo-1"]), "i1"), { requestRowId: "r2", falRequestId: "f2", endpoint: "e" }) });
```

(d) 파일 끝에 더한다:

```ts
describe("번호로 고르기 (2차 D2)", () => {
  const 줄들 = [
    { id: "i1", role: "image", body: "", workId: "p1" },
    { id: "i3", role: "image", body: editRowBody("r3"), workId: "p1" },
  ];
  const 고친다 = async (rowId: string | undefined, resultLabel?: string) => imageEditTurn({
    request: 요청(), userId: "me", store, conversationId: "c1", prompt: "배경만 파랗게", textModel: "m",
    target: (await projectTarget("me", "p1"))!, rows: 줄들, attachments: [], rowId, resultLabel,
  });

  /** Review Focus 4 */
  it("번호로 고른 줄의 그림을 고친다 — 같은 작업의 나중 줄이 아니라", async () => {
    images = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    const json = await (await 고친다("i1", "이미지 4")).json();
    expect(edits[0]!.body.imageId).toBe("img-1");
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i1");
    expect(json.resultLabel).toBe("이미지 4");
  });

  it("번호가 없으면 예전처럼 그 작업의 마지막 줄의 그림이고, 그 줄을 고친 대상으로 적는다", async () => {
    images = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    await 고친다(undefined);
    expect(edits[0]!.body.imageId).toBe("img-3");
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i3");
  });

  it("고른 줄의 그림이 아직 없으면 값 없이 기다리라고 한다", async () => {
    images = [];
    const json = await (await 고친다("i1")).json();
    expect(edits).toEqual([]);
    expect(json.talked).toBe(true);
  });

  it("작업 대상은 지킬 사진만 들고, 없는 작업이면 비어 있다", async () => {
    expect([...(await projectTarget("me", "p1"))!.keptIds]).toEqual(["keep-1"]);
    expect(await projectTarget("me", "nope")).toBeNull();
    expect(await projectTarget("me", undefined)).toBeNull();
  });
});
```

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts`:

(a) 19줄 `let 받은갈래: string[] = [];` 아래에 더한다:

```ts
let 그림들: Array<{ id: string; generationRequestId: string; selected: boolean }> = [];
```

(b) `lib/poster/stores` 모의의 `    images: { byProject: async () => [{ id: "img-1", generationRequestId: "r1", selected: false }] },` 를 바꾼다(이 대화의 이미지 사실이 `byProjects` 를 읽는다 — 2차 D2):

```ts
    images: {
      byProject: async () => 그림들,
      byProjects: async () => 그림들.map((one) => ({ ...one, projectId: "p1", assetPath: `me-1/${one.id}.png`, thumbPath: null })),
    },
```

(c) 82~84줄 import 아래에 더한다:

```ts
const { askBody, readAsk } = await import("../../../easy/row-marks");
const { editRowBody, rowFromOf } = await import("../../../easy/row-image");
const { IMAGE_NOT_READY } = await import("../../../../lib/easy/image-edit-turn");
```

(d) `beforeEach` 의 `  남긴줄.length = 0; 부른라우트.length = 0;` 아래에 `  그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }];` 를 더한다.

(e) 파일 끝에 더한다:

```ts
describe("번호로 고르기 (2차 D2)", () => {
  beforeEach(() => {
    그림들 = [{ id: "img-1", generationRequestId: "r1", selected: false }, { id: "img-3", generationRequestId: "r3", selected: false }];
    지난줄 = [
      { id: "u1", role: "user", body: "화장품을 넣어줘", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" },
      { id: "u2", role: "user", body: "배경 파랗게", workId: null }, { id: "i3", role: "image", body: editRowBody("r3"), workId: "p1" },
    ];
  });

  /** Review Focus 4 — 이미지 2 는 이미지 1 을 고친 것이다. 「이미지 1」은 1번 줄의 그림이다. */
  it("「이미지 1 고쳐줘」는 1번 줄의 그림을 고친다 — 같은 작업의 나중 줄(이미지 2)이 아니라", async () => {
    판단 = { ...(판단 as object), wants: "image_edit", target: 1 };
    const { json } = await 보낸다({ prompt: "이미지 1 글자 크게" });
    expect(부른라우트[0]!.body).toMatchObject({ imageId: "img-1" });
    expect(rowFromOf(남긴줄.at(-1)!.body)).toBe("i1");
    expect(json.resultLabel).toBe("이미지 3");
  });

  it("없는 번호면 값 없이 사실대로 답한다", async () => {
    판단 = { ...(판단 as object), wants: "image_edit", target: 7 };
    const { json } = await 보낸다({ prompt: "이미지 7 고쳐줘" });
    expect(부른라우트).toEqual([]);
    expect(json.talked).toBe(true);
    expect(json.message.body).toContain("7번은 이 대화에 없습니다");
  });

  /** 2차 최종 리뷰 5 — 결과물 번호는 지운 결과도 센다. 그 번호는 값 없이 코드가 쓴 사실 문장이다. */
  it("지운 결과의 번호면 값 없이 사실대로 답한다 — 뒤 번호는 그대로다", async () => {
    지난줄 = [...지난줄, { id: "u3", role: "user", body: "배너", workId: null }, { id: "c3", role: "image", body: "", workId: "gone" }];
    판단 = { ...(판단 as object), wants: "image_edit", target: 3 };
    const { json } = await 보낸다({ prompt: "3번 고쳐줘" });
    expect(부른라우트).toEqual([]);
    expect(json.message.body).toContain("3번은 지운 결과라 고칠 수 없습니다");
  });

  it("어느 이미지인지 모르면 묻고 번호 단추용 물음 줄을 남긴다", async () => {
    판단 = { wants: "talk", reply: "어느 이미지를 고칠까요?", ratio: "", look: "", card: 0, note: "ask_target" };
    await 보낸다({ prompt: "고쳐줘" });
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "target", text: "어느 이미지를 고칠까요?", data: { numbers: [1, 2] } });
    expect(부른라우트).toEqual([]);
  });

  it("번호 단추로 답하면 판단 없이 물음을 부른 말로 그 이미지를 고친다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = undefined; // 판단 모델을 부르면 읽기가 실패한다 — 단추 답은 안 부른다
    await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(부른라우트.map((call) => call.step)).toEqual(["edit"]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
  });

  /** 2차 최종 리뷰 6 · Review Focus 8 — 번호 물음 바로 뒤 image_edit 이면 note 가 없어도 답이다. 처음 말로 고친다. */
  it("번호 물음에 말로 「1번」이라 답하면 note 가 없어도 물음을 부른 말로 그 이미지를 고친다", async () => {
    지난줄 = [
      ...지난줄,
      { id: "u3", role: "user", body: "배경만 하얗게", workId: null },
      { id: "q1", role: "assistant", body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 2] }), workId: null },
    ];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 1 };
    await 보낸다({ prompt: "1번" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "배경만 하얗게", imageId: "img-1" });
  });
});

/**
 * 2차 최종 리뷰 a — 고칠 수 있는 이미지는 지운 것만 뺀다. 만드는 중에 「글자 크게」면 「이 대화에는 아직 고칠
 * 이미지가 없습니다」가 아니라 「아직 준비되지 않았습니다」여야 한다. 값은 안 든다.
 */
describe("만드는 중인 이미지를 고쳐 달라면 (2차 최종 리뷰 a)", () => {
  it("고칠 것이 없다가 아니라 아직 준비 안 됐다고 답한다", async () => {
    그림들 = [];
    지난줄 = [{ id: "u1", role: "user", body: "카페 포스터", workId: null }, { id: "i1", role: "image", body: "", workId: "p1" }];
    판단 = { wants: "image_edit", reply: "", ratio: "", look: "", card: 0, note: "", target: 0 };
    const { json } = await 보낸다({ prompt: "글자 크게" });
    expect(json.message.body).toBe(IMAGE_NOT_READY);
    expect(부른라우트).toEqual([]);
  });
});
```

`apps/web/app/easy/__tests__/message-row.test.tsx` — 「물음 줄의 단추 · 고르기 (2차 D1)」 묶음 끝에 더한다:

```tsx
  it("어느 이미지 물음 줄은 번호 단추를 달고, 누르면 그 번호를 보낸다 (2차 D2)", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q4", role: "assistant" as const, body: askBody("target", "어느 이미지를 고칠까요?", { numbers: [1, 3] }) };
    act(() => { view = create(그린다(물음, onAnswer)); });
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual(["이미지 1", "이미지 3"]);
    act(() => { 단추[1]!.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: "이미지 3", answersRowId: "q4", pick: { target: 3 } });
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/easy/__tests__/edit-target.test.ts app/easy/__tests__/chat-image-edit.test.ts lib/easy/__tests__/chat-provider-wiring.test.ts lib/easy/__tests__/image-edit-turn.test.ts app/api/easy/__tests__/generate-image-edit.test.ts app/easy/__tests__/message-row.test.tsx`
Expected: FAIL — `Failed to resolve import "../edit-target"`, `projectTarget is not a function`, 틀에 `target` 없음

- [ ] **Step 3: 판단 틀 · 프롬프트에 고칠 번호를 더한다**

`apps/web/lib/easy/chat-provider.ts` — 말 판단 틀의 `        note: { type: "string" },` 아래에 더하고 `required` 를 바꾼다:

```ts
        // 2차 D2: 고칠 이미지 번호(이 대화의 「이미지 N」, 말하지 않았으면 0).
        target: { type: "integer" },
      },
      required: ["wants", "reply", "ratio", "look", "card", "note", "target"],
```

(옛 `      },\n      required: ["wants", "reply", "ratio", "look", "card", "note"],` 두 줄을 위 넷으로 바꾸는 것이다.)

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/** 판단 모델이 「어느 이미지인지 물어야 한다」고 `note` 에 적는 값(2026-10-07 2차 D2). */
export const ASK_TARGET_NOTE = "ask_target";

/**
 * 고칠 이미지 번호를 고르는 법(2차 D2). 갈래 목록에 image_edit 이 있을 때만 싣는다. 다 만든 이미지가
 * 둘 이상이면, 어느 것인지 말에서 알 수 없을 때 묻게 한다(`ask:target` 물음 줄 · 번호 단추).
 */
export function easyTargetLines(doneCount: number): string[] {
  return [
    "`target`: image_edit 이면 고칠 이미지 번호(아래 「이 대화의 결과물」의 #N 가운데 「이미지」 번호)를 적습니다. 「아까 첫 번째 거」는 첫 이미지의 번호입니다.",
    "카드뉴스 번호나 지운 결과의 번호는 이미지로 고칠 수 없습니다.",
    "「방금 거」 · 「마지막 거」처럼 마지막 이미지를 가리키거나 바로 앞에서 만든 이미지 이야기를 이어 가면 0 입니다.",
    "image_edit 이 아니면 0 입니다.",
    ...(doneCount >= 2
      ? [
        `이 대화에 다 만든 이미지가 ${doneCount}장 있습니다. 고쳐 달라는데 **어느 이미지인지 말에서 알 수 없으면**`,
        `image_edit 대신 talk 로 고르고, reply 에 몇 번 이미지를 고칠지 묻는 한 문장을 쓰고, note 에 \`${ASK_TARGET_NOTE}\` 라고 적으세요.`,
      ]
      : []),
    "",
  ];
}

/**
 * 원고와 이미지가 함께 있을 때 **마지막 결과**를 알린다(2026-10-06 독립 리뷰, 2차 D2). 마지막이
 * 카드뉴스면 콕 집지 않은 「고쳐줘」는 원고 고치기다.
 */
export function easyLastResultLines(lastIsImage: boolean): string[] {
  return lastIsImage
    ? [
      "  **이 대화에서 마지막으로 만든 것은 이미지 한 장입니다.** 무엇을 고칠지 콕 집지 않은 고쳐 달라는 말은",
      "  image_edit 입니다. 카드뉴스 원고나 카드를 **콕 집어** 말할 때만 revise · card_text 입니다.",
    ]
    : [
      "  **이 대화에서 마지막으로 만든 것은 카드뉴스입니다.** 무엇을 고칠지 콕 집지 않은 고쳐 달라는 말은",
      "  revise 입니다. 「이미지 2」처럼 이미지를 **콕 집어** 말할 때만 image_edit 입니다.",
    ];
}
```

`apps/web/app/easy/chat.ts`:

(a) chat-facts import 줄에 `easyLastResultLines, easyTargetLines` 를 더하고, Task 7 이 더한 `import type { EasyResultEntry } from "./image-numbers";` 를 `import { doneImageNumbers, type EasyResultEntry } from "./image-numbers";` 로 바꾼다.

(b) `EasyPromptOptions` 의 `images?: …` 아래에 더한다:

```ts
  /** 2차 D2: 이 대화의 마지막 결과가 이미지인가(카드뉴스면 false). 모르면 예전처럼 이미지로 본다. */
  lastIsImage?: boolean;
```

(c) image_edit 갈래 안내를 찾아:

```ts
        "  image_edit  이 대화에서 **마지막으로 만든 이미지를 고쳐** 달라는 것입니다. 「로고를 이걸로 바꿔줘」 ·",
        "              「글자를 크게」 · 「배경만 파랗게」 · 「방금 거에서 ○○만 바꿔줘」. 붙인 이미지가 있으면 그것을",
        "              넣어 고쳐 달라는 뜻입니다. 전혀 다른 새 이미지를 말하면 image 입니다.",
```

이렇게 바꾼다:

```ts
        "  image_edit  이 대화의 **이미지를 고쳐** 달라는 것입니다. 「로고를 이걸로 바꿔줘」 · 「글자를 크게」 ·",
        "              「배경만 파랗게」 · 「아까 첫 번째 거에서 ○○만 바꿔줘」. 붙인 이미지가 있으면 그것을",
        "              넣어 고쳐 달라는 뜻입니다. 전혀 다른 새 이미지를 말하면 image 입니다. 고칠 번호는 target 에 적습니다.",
```

(d) 마지막 결과 줄을 찾아:

```ts
    ...(갈래.includes("revise") && 갈래.includes("image_edit")
      ? [
        "  **이 대화에서 마지막으로 만든 것은 이미지 한 장입니다.** 무엇을 고칠지 콕 집지 않은 고쳐 달라는 말은",
        "  image_edit 입니다. 카드뉴스 원고나 카드를 **콕 집어** 말할 때만 revise · card_text 입니다.",
      ]
      : []),
```

이렇게 바꾼다:

```ts
    ...(갈래.includes("revise") && 갈래.includes("image_edit") ? easyLastResultLines(options.lastIsImage !== false) : []),
```

(e) `    ...easyCapabilityLines(갈래),` 아래에 더한다:

```ts
    // 2차 D2: 고칠 이미지 번호 고르는 법. 다 만든 것이 둘 이상이면 모를 때 묻게 한다.
    ...(갈래.includes("image_edit")
      ? easyTargetLines(doneImageNumbers(options.images ?? []).length)
      : []),
```

(f) `readEasyDecision` — `const value = raw as { wants?: unknown; reply?: unknown; ratio?: unknown; look?: unknown; card?: unknown; note?: unknown } | null;` 를 바꾼다:

```ts
  const value = raw as {
    wants?: unknown; reply?: unknown; ratio?: unknown; look?: unknown; card?: unknown; note?: unknown; target?: unknown;
  } | null;
```

`  const note = …` 줄 아래에 더한다:

```ts
  // 2차 D2: 고칠 이미지 번호. image_edit 일 때만 쓴다.
  const target = typeof value?.target === "number" && Number.isInteger(value.target) && value.target > 0 ? value.target : undefined;
```

돌려주는 객체의 `    ...(note ? { note } : {}),` 아래에 더한다:

```ts
    ...(target && wants === "image_edit" ? { target } : {}),
```

`apps/web/lib/easy/judge.ts` — `EasyJudgeInput` 의 `images?: …` 아래에 더한다:

```ts
  /** 2차 D2: 마지막 결과가 이미지인가(카드뉴스면 false). */
  lastIsImage?: boolean;
```

`        retry, adNegated, images: input.images,` 를 `        retry, adNegated, images: input.images, lastIsImage: input.lastIsImage,` 로 바꾼다.

- [ ] **Step 4: 고치기가 작업 대상 · 줄 단위 그림을 쓴다**

`apps/web/lib/easy/image-edit-turn.ts`:

(a) 2줄 import 를 바꾼다:

```ts
import {
  editRowBody, editTargetImage, editedRequestIds, pickRowImage, withRowFrom, withRowJob,
} from "../../app/easy/row-image";
```

(b) `type Row = { role: string; workId?: string | null; body?: string | null; createdAt?: string };` 를 바꾼다:

```ts
type Row = { id?: string; role: string; workId?: string | null; body?: string | null; createdAt?: string };
```

(c) `lastEasyImage` 함수(머리 주석은 둔다)의 몸통을 찾아:

```ts
export async function lastEasyImage(userId: string, rows: readonly Row[]): Promise<EasyImageTarget | null> {
  const row = [...rows].reverse().find((one) => one.role === "image" && one.workId);
  if (!row?.workId) return null;
  const project = await posterStoresForUser(userId).projects.get(row.workId).catch(() => undefined);
  if (!project) return null;
  const data = project.data;
  return {
    projectId: project.id,
    ratio: project.ratio,
    keptIds: new Set([...(data.preservedIds ?? []), ...(data.personIds ?? [])]),
  };
}
```

이렇게 바꾼다:

```ts
export async function lastEasyImage(userId: string, rows: readonly Row[]): Promise<EasyImageTarget | null> {
  const row = [...rows].reverse().find((one) => one.role === "image" && one.workId);
  return projectTarget(userId, row?.workId ?? undefined);
}

/** 포스터 작업 하나를 고칠 대상으로(2차 D2). 없거나 볼 수 없는 작업(카드뉴스 · 지운 것)이면 `null`. */
export async function projectTarget(userId: string, projectId: string | undefined): Promise<EasyImageTarget | null> {
  if (!projectId) return null;
  const project = await posterStoresForUser(userId).projects.get(projectId).catch(() => undefined);
  if (!project) return null;
  const data = project.data;
  return {
    projectId: project.id,
    ratio: project.ratio,
    keptIds: new Set([...(data.preservedIds ?? []), ...(data.personIds ?? [])]),
  };
}

type Picture = { id: string; generationRequestId: string; selected: boolean };

/**
 * 고칠 그림과 그 그림이 보이는 줄(2차 D2). **번호로 골랐으면 그 줄의 그림** — 같은 작업의 마지막 줄로
 * 가면 「이미지 1 고쳐줘」가 이미지 3(1 을 고친 것)을 고친다. 번호가 없으면 예전처럼 그 작업의 마지막
 * 줄의 그림(실패면 앞으로 거슬러 감). 없으면 `undefined` — 아직 만드는 중이다.
 */
function 고칠그림<T extends Picture>(
  rows: readonly Row[], projectId: string, images: readonly T[], rowId: string | undefined,
): { image: T; fromRowId?: string } | undefined {
  const edited = editedRequestIds(rows, projectId);
  if (rowId) {
    const row = rows.find((one) => one.id === rowId);
    const image = row ? pickRowImage(row, images, edited) : undefined;
    return image ? { image, fromRowId: rowId } : undefined;
  }
  const found = editTargetImage(rows, projectId, images, Date.now());
  if (!("image" in found)) return undefined;
  const 줄 = [...rows].reverse().find((row) =>
    row.role === "image" && row.workId === projectId && pickRowImage(row, images, edited)?.id === found.image.id);
  return { image: found.image, fromRowId: 줄?.id };
}
```

(d) `imageEditTurn` ctx 모양의 `  attachments: readonly string[];` 아래에 더한다:

```ts
  /** 2차 D2: 번호로 고른 줄. 있으면 그 줄의 그림을 고친다. */
  rowId?: string;
  /** 2차 D2: 새 고친 줄의 이름표(화면의 「이미지 N」 — 결과물 번호). */
  resultLabel?: string;
```

(e) 아래를 찾아:

```ts
  // 마지막 줄의 그림. 앞의 고치기가 실패했으면 그 앞의 그림으로 거슬러 간다(`row-image.ts`).
  const found = editTargetImage(ctx.rows, projectId, images, Date.now());
```

이렇게 바꾼다:

```ts
  // 번호로 골랐으면 그 줄의 그림, 아니면 마지막 줄의 그림(실패면 앞으로 거슬러 간다).
  const found = 고칠그림(ctx.rows, projectId, images, ctx.rowId);
```

`  if (!("image" in found)) {` 를 `  if (!found) {` 로 바꾼다.

(f) 고친 줄 글을 찾아:

```ts
    body: withRowJob(editRowBody(submitted.submission.requestRowId, added), submitted.submission),
```

이렇게 바꾼다:

```ts
    // 고친 대상 줄도 적는다 — 목록의 「#N 을 고친 것」(2차 D2).
    body: withRowJob(withRowFrom(editRowBody(submitted.submission.requestRowId, added), found.fromRowId), submitted.submission),
```

(g) 마지막 응답의 `    photoRoles: [],` 아래에 더한다:

```ts
    ...(ctx.resultLabel ? { resultLabel: ctx.resultLabel } : {}),
```

- [ ] **Step 5: 고칠 번호 검증 · 안내 한 줄 턴을 만든다**

`apps/web/lib/easy/edit-target.ts`:

```ts
import { NOTHING_TO_EDIT } from "../../app/easy/chat";
import { ASK_TARGET_NOTE } from "../../app/easy/chat-facts";
import { doneImageNumbers } from "../../app/easy/image-numbers";
import { IMAGE_NOT_READY, lastEasyImage, projectTarget, type EasyImageTarget } from "./image-edit-turn";
import type { EasyImageFacts } from "./image-list";

/**
 * **고칠 번호 검증 — 줄 단위**(2026-10-07 2차 설계 D2 · §3-2).
 *
 * 고칠 수 있는 것은 이 대화에서 만든, 지워지지 않은, 다 만들어진 포스터 이미지뿐이다. 판단 모델이
 * 목록을 보고 고른 번호를 여기서 다시 본다. 결과물 번호는 카드뉴스 · 지운 결과도 함께 세므로(2차 최종
 * 리뷰 5) **이미지 번호일 때만** 고친다 — 없는 번호 · 카드뉴스 · 지운 결과 · 못 만듦은 값 없이 사실대로
 * 답하고, 만드는 중이면 기다리라고 한다. 이 답들은 코드가 쓴 사실 문장이다(설계 §3-2 · §4 의 의도한 차이 —
 * 그때 판단 모델의 reply 는 고치겠다고 쓴 글이다). 번호가 없으면 예전처럼 마지막 결과(「방금 거」).
 */
type Row = { id?: string; role: string; workId?: string | null; body?: string | null; createdAt?: string };

export type EditTargetPick =
  | { ok: true; target: EasyImageTarget; rowId?: string; n?: number }
  | { ok: false; message: string };

function 고칠수있는것(facts: EasyImageFacts): string {
  const 번호들 = doneImageNumbers(facts.entries).map((n) => `이미지 ${n}`);
  return 번호들.length ? `고칠 수 있는 것은 ${번호들.join(" · ")} 입니다.` : "";
}

const 잇는다 = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** 번호의 사정을 사실대로(이미지가 아니거나 다 안 만든 번호). 다 만든 이미지면 `undefined`. */
function 못고치는까닭(facts: EasyImageFacts, target: number): string | undefined {
  const entry = facts.entries.find((one) => one.n === target);
  const 고칠것 = 고칠수있는것(facts);
  if (!entry) return 잇는다(`${target}번은 이 대화에 없습니다.`, 고칠것);
  if (entry.kind === "cardnews") {
    return 잇는다(`${target}번은 카드뉴스라 이미지 고치기로는 고칠 수 없습니다. 카드뉴스는 「3번 장 더 짧게」처럼 말씀해 주세요.`, 고칠것);
  }
  if (entry.kind === "deleted") return 잇는다(`${target}번은 지운 결과라 고칠 수 없습니다.`, 고칠것);
  if (entry.state === "making") return IMAGE_NOT_READY;
  if (entry.state === "failed") return 잇는다(`이미지 ${target}번은 만들지 못한 이미지라 고칠 수 없습니다. 새로 만들어 주세요.`, 고칠것);
  return undefined;
}

export async function pickEditTarget(
  userId: string, rows: readonly Row[], facts: EasyImageFacts, target: number | undefined,
): Promise<EditTargetPick> {
  if (!target) {
    // 말하지 않았으면 마지막 결과. 마지막이 카드뉴스면 이 대화의 마지막 이미지(지운 것 · 카드뉴스는 건너뜀).
    const 마지막 = await lastEasyImage(userId, rows)
      ?? await projectTarget(userId, [...facts.entries].reverse().find((one) => one.kind === "image")?.workId);
    return 마지막 ? { ok: true, target: 마지막 } : { ok: false, message: NOTHING_TO_EDIT };
  }
  const 까닭 = 못고치는까닭(facts, target);
  if (까닭) return { ok: false, message: 까닭 };
  const entry = facts.entries.find((one) => one.n === target)!;
  const found = await projectTarget(userId, entry.workId);
  return found ? { ok: true, target: found, rowId: entry.rowId, n: entry.n } : { ok: false, message: NOTHING_TO_EDIT };
}

/**
 * **어느 이미지를 고칠지 묻는다**(2차 D2). 판단 모델이 `talk` + `note` = `ask_target` 이고 다 만든
 * 이미지가 둘 이상일 때만 그 번호들(카드뉴스 번호는 안 센다). 물음 줄(`ask:target`)에 번호 단추가 달린다.
 * 라우트는 **실행하는 갈래**(`wants`)로 부른다 — 고른 갈래가 이겨 image 로 가는 턴에서 묻지 않게.
 */
export function targetAskNumbers(decision: { wants: string; note?: string }, facts: EasyImageFacts): number[] | undefined {
  const 다만든 = doneImageNumbers(facts.entries);
  return decision.wants === "talk" && decision.note === ASK_TARGET_NOTE && 다만든.length >= 2 ? 다만든 : undefined;
}
```

`apps/web/lib/easy/ask-turn.ts` 끝에 더한다:

```ts
/**
 * 물음이 아니라 안내 한 줄로 끝내는 턴(2차 D2 — 고칠 번호가 없거나 지운 이미지일 때). 사용자 줄 +
 * 도우미 줄을 남긴다. 값은 안 든다.
 */
export async function replyTurn(ctx: AskTurnContext, body: string): Promise<Response> {
  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody });
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  const message = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "assistant", body });
  return Response.json({ ok: true, talked: true, message, textModel: ctx.textModel });
}
```

`apps/web/app/easy/turn-words.ts` 의 `RATIO_QUESTION` 아래에 더한다:

```ts
/** 어느 이미지를 고칠지(2차 D2). AI 가 물음으로 쓴 글이 먼저다. */
export const TARGET_QUESTION = "어느 이미지를 고칠까요? 아래에서 고르시거나 「이미지 2」처럼 말씀해 주세요.";
```

- [ ] **Step 6: 라우트가 이미지 사실로 고치고, 모르면 묻는다**

`apps/web/app/api/easy/generate/route.ts`:

(a) import — `import { countEasyImages, imageEditTurn, lastEasyImage } from "../../../../lib/easy/image-edit-turn";` 를 `import { countEasyImages, imageEditTurn } from "../../../../lib/easy/image-edit-turn";` 로, `import { askTurn, type AskTurnContext } from "../../../../lib/easy/ask-turn";` 를 `import { askTurn, replyTurn, type AskTurnContext } from "../../../../lib/easy/ask-turn";` 로, `import { KIND_QUESTION, RATIO_QUESTION, aiText, askText, photoQuestion } from "../../../easy/turn-words";` 를 `import { KIND_QUESTION, RATIO_QUESTION, TARGET_QUESTION, aiText, askText, photoQuestion } from "../../../easy/turn-words";` 로 바꾸고, 한 줄 더한다:

```ts
import { pickEditTarget, targetAskNumbers } from "../../../../lib/easy/edit-target";
```

(b) 아래 두 줄을 지운다(이미지 사실이 대신한다):

```ts
    // 이 대화의 마지막 결과가 이미지 한 장이면 그것을 이어서 고친다(2026-10-06).
    const 고칠그림 = await lastEasyImage(auth.member.userId, 지난줄);
```

(c) 판단 입력의 `          choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: Boolean(고칠그림) },` 를 바꾼다:

```ts
          // 고칠 수 있는 이미지가 이 대화에 있나(2차 D2 — 마지막 결과만이 아니라 지우지 않은 이미지 하나라도. 최종 리뷰 a).
          choices: { hasDraft: Boolean(고칠원고), made: 만들었나, madeImage: 이미지들.madeImage },
          lastIsImage: 이미지들.lastIsImage,
```

같은 판정 예약 블록의 단추 답 다시 보기(Task 4)도 같은 사실을 본다 — `        decision = fitButtonDecision(단추판단, { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: Boolean(고칠그림) });` 를 `        decision = fitButtonDecision(단추판단, { canRevise: Boolean(고칠원고), made: 만들었나, editableImage: 이미지들.madeImage });` 로 바꾼다(2차 최종 리뷰 1 — 판단 읽기와 단추 답이 같은 사실을 본다).

(d) 갈래 물음 바로 **앞** — `    // 한 장인지 여러 장인지 모르면 묻는다(2단계 §4).` 줄 앞에 더한다:

```ts
    /*
     * 고칠 이미지가 둘 이상인데 어느 것인지 모르면 AI 가 묻는다(2차 D2). 번호 단추를 단다. 실행하는 갈래(`wants`)로
     * 본다 — 고른 갈래가 이겨 image 로 가는 턴에서는 묻지 않는다. 물음 글은 AI 가 이 갈래로 쓴 물음이 먼저다.
     */
    const 고칠번호들 = targetAskNumbers({ wants, note: decision.note }, 이미지들);
    if (고칠번호들) {
      return await askTurn(물음맥락, { kind: "target", text: askText(aiText(decision, wants), TARGET_QUESTION), data: { numbers: 고칠번호들 } });
    }
```

(e) 고치기 갈래를 찾아:

```ts
    // 마지막으로 만든 이미지 한 장 고치기(2026-10-06). 판단 읽기가 고칠 그림이 있을 때만 이 갈래를 준다.
    if (wants === "image_edit" && 고칠그림) {
      return await imageEditTurn({
        request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel,
        target: 고칠그림, rows: 지난줄, attachments: 붙인것,
      });
    }
```

이렇게 바꾼다:

```ts
    /*
     * **이 대화의 이미지 고치기**(2026-10-06, 2차 D2). 번호(target)로 고르면 그 줄의 그림을 고치고,
     * 말하지 않았으면 마지막 이미지다. 없는 번호 · 카드뉴스 번호 · 지운 결과 · 못 만든 것 · 만드는 중이면
     * 값 없이 코드가 쓴 사실 문장으로 답한다(`lib/easy/edit-target.ts`).
     */
    if (wants === "image_edit" && 이미지들.madeImage) {
      const 고칠것 = await pickEditTarget(auth.member.userId, 지난줄, 이미지들, decision.target);
      if (!고칠것.ok) return await replyTurn(물음맥락, 고칠것.message);
      return await imageEditTurn({
        request, userId: auth.member.userId, store, conversationId, prompt: 지시, userBody: 사용자글, textModel,
        target: 고칠것.target, rowId: 고칠것.rowId, rows: 지난줄, attachments: 붙인것,
        // 새 고친 줄의 「이미지 N」(결과물 번호, 2차 D2).
        resultLabel: resultLabel("image", nextResultNumber(지난줄)),
      });
    }
```

- [ ] **Step 7: 번호 단추를 단다**

`apps/web/app/easy/ask-answers.ts` 끝에 더한다:

```ts
/** 물음 줄 자료의 번호 목록. 모양만 거른다(서버가 쓴 값이다). */
export function askNumbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((one): one is number => typeof one === "number" && Number.isInteger(one) && one >= 1 && one <= 999).slice(0, 20)
    : [];
}

/** 어느 이미지를 고칠지(2차 D2). 서버는 판단 없이 그 번호로 고친다. */
export function targetReply(rowId: string, n: number): EasyButtonReply {
  return { text: `이미지 ${n}`, answersRowId: rowId, pick: { target: n } };
}
```

`apps/web/app/easy/_components/ask-row.tsx`:

(a) 맨 위 `"use client";` 아래 import 에 더한다:

```tsx
import { Button } from "@fixup/ui";
```

`import { kindReply, photoReply, ratioReply, referenceReply, type EasyButtonReply } from "../ask-answers";` 를 바꾼다:

```tsx
import {
  askNumbers, kindReply, photoReply, ratioReply, referenceReply, targetReply, type EasyButtonReply,
} from "../ask-answers";
```

(b) `EasyAskControls` 의 마지막 `  return null;` 바로 **앞**에 더한다:

```tsx
  if (ask.kind === "target") {
    return (
      <EasyNumberAsk numbers={askNumbers(ask.data.numbers)} label={(n) => `이미지 ${n}`} onPick={(n) => onAnswer(targetReply(message.id, n))} />
    );
  }
```

(c) 파일 끝에 더한다:

```tsx
/** 번호 단추(어느 이미지 · 몇 번 장, 2차 D1 · D2). 다시 열어도 그대로 나온다. */
function EasyNumberAsk({ numbers, label, onPick }: {
  numbers: readonly number[];
  label: (n: number) => string;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {numbers.map((n) => (
        <Button key={n} size="sm" variant="secondary" onClick={() => onPick(n)}>{label(n)}</Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy`
Expected: PASS — 1차의 「모델이 revise 라고 해도 마지막 이미지를 고친다」 · 「선택지와 고른 갈래」 시험이 이미지 사실로 그대로 통과한다

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `grep -n "lastEasyImage\|고칠그림" apps/web/app/api/easy/generate/route.ts`
Expected: 출력 없음

- [ ] **Step 9: 커밋**

```bash
git add apps/web/lib/easy/edit-target.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/chat-provider.ts apps/web/lib/easy/judge.ts apps/web/lib/easy/image-edit-turn.ts apps/web/lib/easy/ask-turn.ts apps/web/app/easy/turn-words.ts apps/web/app/api/easy/generate/route.ts apps/web/app/easy/ask-answers.ts apps/web/app/easy/_components/ask-row.tsx apps/web/lib/easy/__tests__/edit-target.test.ts apps/web/app/easy/__tests__/chat-image-edit.test.ts apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts apps/web/lib/easy/__tests__/image-edit-turn.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts apps/web/app/easy/__tests__/message-row.test.tsx
git commit -m "feat(easy): 이 대화의 어느 이미지든 번호로 고르고 모르면 어느 것인지 묻는다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: 일하는 턴에도 AI 가 말한다 — 같은 호출의 reply · 머리말 줄 · 지난 대화 창 (D4 ①)

**Files:**
- Modify: `apps/web/app/easy/chat.ts` (reply 규칙 · `빈답갈래` 지움 · 지난 대화 창), `apps/web/app/easy/chat-facts.ts` (`easyReplyLines`)
- Modify: `apps/web/app/easy/turn-words.ts` (머리말 문장 · `sayText`)
- Modify: `apps/web/app/api/easy/generate/route.ts` (이미지 길 머리말 · 고치기에 넘김 · 카드뉴스 원고 머리말 · 응답 `say`)
- Modify: `apps/web/lib/easy/image-edit-turn.ts` (머리말)
- Modify: `apps/web/app/easy/easy-client.tsx` (머리말을 그림 · 원고 자리 앞에)
- Test: `apps/web/app/easy/__tests__/chat.test.ts` (더함), `apps/web/app/easy/__tests__/chat-image-edit.test.ts` (고침), `apps/web/app/easy/__tests__/turn-words.test.ts` (더함), `apps/web/lib/easy/__tests__/image-edit-turn.test.ts` (더함), `apps/web/app/easy/__tests__/message-row.test.tsx` (더함)
- Test (고침): `apps/web/app/api/easy/__tests__/generate-route.test.ts` (실패 줄 둘 · 더함), `apps/web/app/api/easy/__tests__/cardnews-route.test.ts` (원고 줄 셋), `apps/web/app/api/easy/__tests__/generate-image-edit.test.ts` (줄 둘 · 바꿔 읽은 갈래의 머리말)

**Interfaces:**
- Consumes: Task 1 — `sayBody`, `isSayBody`(실패 줄 규칙). Task 3 — `askText`, `aiText`. Task 8 — `pickEditTarget` 의 `n`
- Produces:
  - `turn-words.ts`: `SAY_IMAGE`, `SAY_CARDNEWS`, `SAY_REVISE`, `sayEditText(n?: number): string`, `sayText(reply: string | undefined, fallback: string): string` — **비지 않았으면 AI 글**(물음이 섞여도 — 2차 최종 리뷰 3). 라우트는 늘 `sayText(aiText(decision, wants), …)` 로 부른다(실행하는 갈래로 쓴 글만 — 최종 리뷰 b)
  - `chat-facts.ts`: `easyReplyLines(wants: readonly EasyWant[]): string[]` — 만들기 · 고치기 · 원고는 **하는 중**으로, 글 고치기 · 게시글(일을 마친 뒤 남는 끝 문장)은 **끝난 일**로(2차 최종 리뷰 g)
  - `cardnewsTurn` ctx 의 `decision` 이 `{ wants: string; reply: string; ratio?: string; look?: string }` 이 된다(머리말의 `aiText`)
  - `imageEditTurn` ctx 에 `say?: string`(있으면 사용자 줄 뒤 · 고치기 앞에 머리말 줄)
  - 응답 칸 `say`(머리말 줄) — 이미지 · 고치기 · 카드뉴스 원고(성공 · 0장)
  - 저장 차례: 사용자 줄 → `say:` 머리말 줄 → 그림 줄. 묻기로 끝나면 머리말 대신 물음 줄

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/chat.test.ts` — 맨 위 `import { askBody } from "../row-marks";` 를 `import { askBody, sayBody } from "../row-marks";` 로 바꾸고 끝에 더한다:

```ts
describe("AI 가 늘 말한다 (2차 D4)", () => {
  it("모든 갈래에서 reply 를 쓰게 하고, 일하는 갈래는 하는 중으로 말하게 한다", () => {
    const prompt = easyChatPrompt([], "카페 포스터 만들어줘");
    expect(prompt).toContain("모든 갈래에서 `reply` 에");
    expect(prompt).toContain("아직 하는 중");
    expect(prompt).toContain("either 이면 한 장으로 만들지 여러 장짜리 카드뉴스로 만들지 묻는 한 문장");
    expect(prompt).toContain("어떤 모양으로 만들지 묻는 한 문장");
    expect(prompt).not.toContain("면 `reply` 는 빈 글로 두세요");
    expect(prompt).not.toContain("`detail_page` 도 `reply` 는 빈 글로");
  });

  /** 2차 최종 리뷰 g — 글 고치기 · 게시글의 끝 문장은 일을 마친 뒤 대화에 남는다. 「고칠게요」면 시제가 틀린다. */
  it("글 고치기 · 게시글은 끝난 일로 쓰게 하고, 그 둘은 「하는 중」 갈래에 넣지 않는다", () => {
    const prompt = easyChatPrompt([], "2번 더 짧게", 0, true, true, false);
    expect(prompt).toContain("card_text · caption 이면 일을 마친 뒤에 보이는 말입니다");
    expect(prompt).toMatch(/image · cardnews · revise 이면 무엇을 이해했고/);
    expect(easyChatPrompt([], "안녕")).not.toContain("일을 마친 뒤에 보이는 말");
  });

  it("지난 대화는 사용자 말 8번까지 싣는다 — 물음 · 머리말 줄이 많아도 (2차 §3-4)", () => {
    const 대화 = Array.from({ length: 10 }, (_, at) => [
      말("user", `말${at}`, `u${at}`), 말("assistant", sayBody(`머리말${at}`), `s${at}`), 말("assistant", `답${at}`, `a${at}`),
    ]).flat();
    const prompt = easyChatPrompt(대화, "마지막");
    expect(prompt).toContain("사용자: 말2\n");
    expect(prompt).not.toContain("사용자: 말1\n");
    expect(prompt).toContain("도우미: 머리말9");
    expect(prompt).not.toContain("say:");
  });
});
```

`apps/web/app/easy/__tests__/chat-image-edit.test.ts` — 「image_edit 이면 reply 를 비우라고 한다」 `it` 을 바꾼다(2차 D4 가 그 규칙을 바꿨다 — 모든 갈래에서 말한다):

```ts
  it("image_edit 도 reply 에 무엇을 이해했고 무엇을 하는지 말하게 한다 (2차 D4)", () => {
    expect(easyChatPrompt([], "로고 바꿔줘", 0, false, false, true)).toMatch(/image_edit[^\n]*무엇을 이해했고/);
  });
```

`apps/web/app/easy/__tests__/turn-words.test.ts` — import 를 `import { KIND_QUESTION, RATIO_QUESTION, SAY_IMAGE, aiText, askText, photoQuestion, sayEditText, sayText } from "../turn-words";` 로 바꾸고 끝에 더한다:

```ts
describe("머리말 문장 (2차 D4)", () => {
  /**
   * 2차 최종 리뷰 3 — 프롬프트가 「다음에 할 수 있는 것도 덧붙이라」고 시켜 머리말 끝에 물음이 올 수 있다
   * (「다른 크기도 만들어 드릴까요?」). 비지 않았으면 받는다. 다른 갈래로 쓴 글은 `aiText` 가 먼저 거른다.
   */
  it("AI 가 쓴 글이면 그것(물음이 섞여도), 비었으면 코드 문장 — 다시 묻지 않는다", () => {
    expect(sayText("딸기라떼 포스터를 세로로 만들겠습니다.", SAY_IMAGE)).toBe("딸기라떼 포스터를 세로로 만들겠습니다.");
    expect(sayText("포스터를 만들겠습니다. 다른 크기도 필요하세요?", SAY_IMAGE)).toBe("포스터를 만들겠습니다. 다른 크기도 필요하세요?");
    expect(sayText("  ", SAY_IMAGE)).toBe(SAY_IMAGE);
    expect(sayText(undefined, SAY_IMAGE)).toBe(SAY_IMAGE);
  });

  it("고치기 머리말은 번호를 말한다", () => {
    expect(sayEditText(2)).toBe("이미지 2번을 말씀대로 고치겠습니다.");
    expect(sayEditText()).toBe("방금 이미지를 말씀대로 고치겠습니다.");
  });
});
```

`apps/web/lib/easy/__tests__/image-edit-turn.test.ts` — 41줄 import 아래에 `const { sayBody } = await import("../../../app/easy/row-marks");` 를 더하고 끝에 더한다:

```ts
describe("고치기 머리말 (2차 D4)", () => {
  it("사용자 줄 → 머리말 줄 → 고친 줄 차례로 남기고 머리말을 응답에 싣는다", async () => {
    const all = [줄.user("만들어줘"), 줄.image("p1")];
    const json = await (await imageEditTurn({
      request: 요청(), userId: "me", store, conversationId: "c1", prompt: "글자 크게", textModel: "m",
      target: (await lastEasyImage("me", all))!, rows: all, attachments: [], say: "글자를 크게 고치겠습니다.",
    })).json();
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "image"]);
    expect(남긴줄[1]!.body).toBe(sayBody("글자를 크게 고치겠습니다."));
    expect(json.say).toMatchObject({ body: sayBody("글자를 크게 고치겠습니다.") });
  });
});
```

`apps/web/app/easy/__tests__/message-row.test.tsx` 끝에 더한다:

```ts
describe("일하는 턴의 AI 말 (2차 D4)", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  it("머리말 줄을 그림 · 원고 자리보다 먼저 붙인다", () => {
    const 머리말 = 화면.indexOf("if (body.ok && body.say?.id)");
    expect(머리말).toBeGreaterThan(0);
    expect(머리말).toBeLessThan(화면.indexOf("cardnews.take(body)"));
    expect(머리말).toBeLessThan(화면.indexOf('{ id: 자리, role: "image", body: "" }'));
  });
});
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts` — 95줄 근처 import 에 더한다:

```ts
const { sayBody } = await import("../../../easy/row-marks");
const { SAY_IMAGE } = await import("../../../easy/turn-words");
```

「말을 남긴 뒤 기획이 권한 때문에 막히면…」의 두 기대를 바꾼다(머리말 뒤 실패 — Review Focus 2):

```ts
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[1]!.body).toBe(sayBody(SAY_IMAGE));
    expect(남긴줄[2]!.body).toBe(failureRowBody("기획이 막혔습니다."));
```

「안쪽 라우트가 날것의 오류 글을 주면 일반 문장을 남긴다」의 세 기대를 바꾼다:

```ts
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody(FAILED_TURN_GENERIC));
    expect(남긴줄[2]!.body).not.toContain("poster_projects");
```

파일 끝에 더한다:

```ts
describe("일하는 턴에도 AI 가 말한다 (2차 D4)", () => {
  it("사용자 줄 → 머리말 줄 → 그림 줄 차례로 남기고, 머리말을 응답에 싣는다", async () => {
    판단 = { wants: "image", reply: "딸기라떼 포스터를 세로로 만들겠습니다.", ratio: "4:5", look: "" };
    const { json } = await 보낸다({});
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "image"]);
    expect(남긴줄[1]!.body).toBe(sayBody("딸기라떼 포스터를 세로로 만들겠습니다."));
    expect(json.say).toMatchObject({ id: "m2", body: sayBody("딸기라떼 포스터를 세로로 만들겠습니다.") });
  });

  it("reply 가 비면 코드 문장으로 대신한다 — 다시 묻지 않는다(값 두 번)", async () => {
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "" };
    await 보낸다({});
    expect(남긴줄[1]!.body).toBe(sayBody(SAY_IMAGE));
    expect(부른횟수.decide).toBe(1);
  });

  /** 2차 최종 리뷰 b — 옛 화면이 고른 갈래가 이겨 image 로 가면, 판단 모델이 talk 로 쓴 말은 머리말이 아니다. */
  it("코드가 갈래를 바꿔 읽으면 AI 말 대신 코드 문장을 머리말로 쓴다", async () => {
    판단 = { wants: "talk", reply: "무엇을 도와드릴까요?", ratio: "1:1", look: "" };
    await 보낸다({ kind: "image", kindPicked: true });
    expect(남긴줄[1]!.body).toBe(sayBody(SAY_IMAGE));
  });

  /** 2차 최종 리뷰 c — Task 2 의 판단 읽기가 이미 푼다. 라우트에서 저장한 줄로 한 번 더 잰다. */
  it("AI 말 답이 표시 머리로 시작해도 머리말 · 물음 줄로 안 읽힌다", async () => {
    판단 = { wants: "talk", reply: "say:안녕하세요", ratio: "", look: "" };
    await 보낸다({ prompt: "안녕" });
    expect(남긴줄[1]!.body).toBe("say：안녕하세요");
  });

  /** Review Focus 2 */
  it("머리말 뒤에 기획이 실패해도 실패 줄이 남는다", async () => {
    기획실패 = true;
    판단 = { wants: "image", reply: "만들겠습니다.", ratio: "1:1", look: "" };
    await 보낸다({});
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody("기획이 막혔습니다."));
  });
});
```

`apps/web/app/api/easy/__tests__/cardnews-route.test.ts` — Task 3 의 import 아래에 더한다:

```ts
const { sayBody } = await import("../../../easy/row-marks");
const { SAY_CARDNEWS } = await import("../../../easy/turn-words");
```

「분위기 참고가 있으면 만들기 → 원고…」의 `expect(남긴줄.map((r) => r.role)).toEqual(["user", "image"]);` 를 바꾼다:

```ts
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "assistant", "image"]);
    expect(남긴줄[1]!.body).toBe(sayBody(SAY_CARDNEWS));
    expect(json.say).toMatchObject({ body: sayBody(SAY_CARDNEWS) });
```

「원고 0장이면 까닭을 말하고 원고 줄을 안 남긴다」의 두 기대를 바꾼다:

```ts
    expect(남긴줄.map((r) => r.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toContain("자막이 없습니다");
```

「장수 계산이 어긋난 실패는…」의 `expect(남긴줄[1]!.body).toBe(…)` 를 `expect(남긴줄[2]!.body).toBe("원고를 쓰다가 장수 계산이 어긋났습니다. 다시 보내 주시면 한 번 더 씁니다.");` 로 바꾼다.

`apps/web/app/api/easy/__tests__/generate-image-edit.test.ts` — Task 8 의 import 아래에 `const { sayBody } = await import("../../../easy/row-marks");` 와 `const { sayEditText } = await import("../../../easy/turn-words");` 를 더하고, 「모델이 revise 라고 해도…」의 `expect(남긴줄.map((row) => row.role)).toEqual(["user", "image"]);` 를 `expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "image"]);` 로 바꾼다. 그 `it` 바로 뒤에 넣는다:

```ts
  /**
   * 2차 최종 리뷰 b — 판단 읽기가 revise 를 이미지 고치기로 바꿔 읽으면, 모델이 revise 로 쓴 「원고를 고치겠습니다」는
   * 이 일과 안 맞는다. 판단 읽기가 그 reply 를 비우고 코드 문장이 머리말로 나간다.
   */
  it("revise 를 이미지 고치기로 바꿔 읽으면 처음 갈래로 쓴 말 대신 코드 문장을 머리말로 쓴다", async () => {
    판단 = { ...(판단 as object), wants: "revise", reply: "카드뉴스 원고를 짧게 고치겠습니다." };
    await 보낸다({ prompt: 로고바꿔줘 });
    expect(남긴줄[1]!.body).toBe(sayBody(sayEditText()));
  });
```

「말 뒤에 실패 안내를 남긴다」의 두 기대를 바꾼다:

```ts
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody("고치기가 막혔습니다."));
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/chat.test.ts app/easy/__tests__/chat-image-edit.test.ts app/easy/__tests__/turn-words.test.ts lib/easy/__tests__/image-edit-turn.test.ts app/easy/__tests__/message-row.test.tsx app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/cardnews-route.test.ts app/api/easy/__tests__/generate-image-edit.test.ts`
Expected: FAIL — `sayText is not a function`, 머리말 줄이 없다, 프롬프트에 「모든 갈래에서」 없음

- [ ] **Step 3: 머리말 문장을 더한다**

`apps/web/app/easy/turn-words.ts` 끝에 더한다:

```ts
/** 일하는 턴의 머리말 — AI 말이 비었거나 다른 갈래로 쓴 글이면 대신 쓴다(2차 D4 · 최종 리뷰 b). */
export const SAY_IMAGE = "말씀하신 내용으로 이미지 한 장을 만들겠습니다. 다 되면 이 자리에 보여 드릴게요.";
export const SAY_CARDNEWS = "카드뉴스 원고를 쓰겠습니다. 1~2분쯤 걸립니다.";
export const SAY_REVISE = "말씀하신 대로 카드뉴스 원고를 다시 쓰겠습니다. 1~2분쯤 걸립니다.";

export function sayEditText(n?: number): string {
  return n ? `이미지 ${n}번을 말씀대로 고치겠습니다.` : "방금 이미지를 말씀대로 고치겠습니다.";
}

/**
 * 머리말 · 안내 · 끝 문장. AI 가 쓴 글이 **비지 않았으면** 그것, 아니면 코드 문장(2차 최종 리뷰 3). 프롬프트가
 * 「다음에 할 수 있는 것도 덧붙이라」고 시켜 끝에 물음이 올 수 있다 — 그래도 받는다. 다른 갈래로 쓴 글은
 * 부르는 쪽이 `aiText(decision, wants)` 로 먼저 거른다(최종 리뷰 b).
 */
export function sayText(reply: string | undefined, fallback: string): string {
  return reply?.trim() || fallback;
}
```

- [ ] **Step 4: 판단 프롬프트가 모든 갈래에서 말하게 하고, 지난 대화를 사용자 말 단위로 자른다**

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/**
 * **AI 가 늘 말한다**(2026-10-07 2차 D4 · §3-4). 판단과 **같은 호출**에서 모든 갈래의 reply 를 받는다
 * — 추가 호출이 없다. 일하는 갈래는 이해한 것 · 할 일 · 다음에 할 수 있는 것, 갈래 · 모양 물음은
 * 물음 문장이다. 갈래 이름은 쓸 수 있는 것만 적는다(A1).
 */
export function easyReplyLines(wants: readonly EasyWant[]): string[] {
  const 일하는 = (["image", "cardnews", "revise", "image_edit"] as const).filter((one) => wants.includes(one));
  // 일을 마친 뒤에 남는 끝 문장(2차 최종 리뷰 g). 「고칠게요」면 시제가 틀린다.
  const 마친 = (["card_text", "caption"] as const).filter((one) => wants.includes(one));
  const 장갈래 = (["card_text", "card_redo"] as const).filter((one) => wants.includes(one));
  return [
    "**모든 갈래에서 `reply` 에 한국어로 1~2문장을 쓰세요.** 사용자는 그 말을 대화 창에서 바로 읽습니다.",
    "  talk 이면 물은 것에 답합니다. 두세 문장이면 충분합니다. 상대는 이미지를 만들러 온 사람입니다.",
    "    도움이 될 말을 하고, 필요하면 **무엇을 적으면 되는지 예를 들어** 주세요.",
    `  ${일하는.join(" · ")} 이면 무엇을 이해했고 지금 무엇을 하는지 말합니다. 붙인 사진이 있으면 어떻게 쓰는지,`,
    "    다음에 할 수 있는 것도 짧게 덧붙입니다. **아직 하는 중**으로 말하세요(「만들겠습니다」). 다 됐다고 하지 마세요.",
    ...(마친.length
      ? [`  ${마친.join(" · ")} 이면 일을 마친 뒤에 보이는 말입니다. 「2번 장 글을 짧게 고쳤습니다」처럼 **끝난 일**로 쓰세요.`]
      : []),
    "  either 이면 한 장으로 만들지 여러 장짜리 카드뉴스로 만들지 묻는 한 문장입니다.",
    "  image 인데 말에 비율 · 그림체가 없고 붙인 사진도 없으면, 어떤 모양으로 만들지 묻는 한 문장입니다.",
    "    안 골라도 정사각형으로 만든다고 덧붙입니다. 바로 앞에서 모양을 이미 물었으면 다시 묻지 말고 만든다고 말합니다.",
    "  detail_page 이면 아래 사실대로 「상세페이지 만들기」에서 만든다고 안내하고, 아래 단추로 열 수 있다고 말합니다.",
    ...(wants.includes("ad_specs") ? ["  ad_specs 이면 reply 는 빈 글로 두세요. 안내는 따로 씁니다."] : []),
    ...(장갈래.length ? [`  ${장갈래.join(" · ")} 인데 장 번호가 없거나 없는 번호면, 몇 번 장인지 묻는 한 문장입니다.`] : []),
  ];
}
```

`apps/web/app/easy/chat.ts`:

(a) chat-facts import 줄에 `easyReplyLines` 를 더한다.

(b) 지난 대화 창 — 아래를 찾아:

```ts
/** 지난 대화를 몇 줄까지 보여 줄까. */
const 되돌아볼줄 = 12;
```

이렇게 바꾼다:

```ts
/**
 * 지난 대화를 **사용자 말 몇 번**까지 보여 줄까(2026-10-07 2차 §3-4). 물음 줄 · 머리말 줄이 늘어
 * 줄 수로 자르면 사용자 말이 금방 절반으로 준다. 한 말 뒤에 줄이 끝없이 붙는 대화를 위해 줄 수
 * 상한도 둔다.
 */
const 되돌아볼말 = 8;
const 최대줄 = 40;

function 최근대화(history: readonly EasyMessage[]): readonly EasyMessage[] {
  const 말자리 = history.flatMap((message, at) => (message.role === "user" ? [at] : []));
  const 시작 = 말자리.length > 되돌아볼말 ? 말자리[말자리.length - 되돌아볼말]! : 0;
  return history.slice(시작).slice(-최대줄);
}
```

그리고 아래를 찾아:

```ts
  const 지난말 = history
    // 인사는 뺀다. 우리가 넣은 줄이라 대화의 내용이 아니다.
    .filter((message) => message.id !== "greeting")
    .slice(-되돌아볼줄)
    .map((message) => {
```

이렇게 바꾼다:

```ts
  // 인사는 뺀다. 우리가 넣은 줄이라 대화의 내용이 아니다.
  const 지난말 = 최근대화(history.filter((message) => message.id !== "greeting"))
    .map((message) => {
```

(c) reply 규칙 — 아래를 찾아:

```ts
    "`talk` 이면 `reply` 에 답을 쓰세요. 두세 문장이면 충분합니다.",
    "상대는 이미지를 만들러 온 사람입니다. 도움이 될 말을 하고, 필요하면",
    "**무엇을 적으면 되는지 예를 들어** 주세요.",
    "",
    `${빈답갈래(갈래)} 면 \`reply\` 는 빈 글로 두세요.`,
    ...(갈래.includes("card_text") ? ["`card` 는 말에 장 번호가 있을 때만 적고 없으면 0, `note` 는 없으면 빈 글로 두세요."] : []),
    "`detail_page` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다.",
    ...(갈래.includes("ad_specs") ? ["`ad_specs` 도 `reply` 는 빈 글로 두세요. 안내는 따로 드립니다."] : []),
    "",
```

이렇게 바꾼다:

```ts
    // 2차 D4: 모든 갈래에서 AI 가 말한다. 같은 판단 호출의 reply 다 — 추가 호출이 없다.
    ...easyReplyLines(갈래),
    ...(갈래.includes("card_text") ? ["`card` 는 말에 장 번호가 있을 때만 적고 없으면 0, `note` 는 없으면 빈 글로 두세요."] : []),
    "",
```

(d) 파일 끝의 아래 두 덩어리(이제 부르는 곳이 없다 — 이 Task 가 만든 고아)를 지운다:

```ts
/** 말 · 안내로 끝나는 갈래. 이것들은 `reply` 를 비우라는 줄에 넣지 않고 따로 적는다. */
const 따로적는갈래 = new Set<string>(["talk", "detail_page", "ad_specs"]);

/** `reply` 를 비워야 하는 갈래를 프롬프트에 적을 꼴로. 쓸 수 있는 것만 적는다(A1). */
function 빈답갈래(갈래: readonly EasyWant[]): string {
  return 갈래.filter((one) => !따로적는갈래.has(one)).map((one) => `\`${one}\``).join(" · ");
}

```

- [ ] **Step 5: 라우트 · 고치기가 머리말 줄을 남긴다**

`apps/web/app/api/easy/generate/route.ts`:

(a) import — `import { plainTyped, withPick } from "../../../easy/row-marks";` 를 `import { plainTyped, sayBody, withPick } from "../../../easy/row-marks";` 로, turn-words import 를 바꾼다:

```ts
import {
  KIND_QUESTION, RATIO_QUESTION, SAY_CARDNEWS, SAY_IMAGE, SAY_REVISE, TARGET_QUESTION,
  aiText, askText, photoQuestion, sayEditText, sayText,
} from "../../../easy/turn-words";
```

(b) 고치기에 머리말을 넘긴다 — Task 8 의 `        target: 고칠것.target, rowId: 고칠것.rowId, rows: 지난줄, attachments: 붙인것,` 아래에 더한다:

```ts
        // 일하는 턴의 AI 말(2차 D4). 이 갈래로 쓴 말이 없으면(바꿔 읽은 갈래 · 빈 말) 번호를 말하는 코드 문장.
        say: sayText(aiText(decision, wants), sayEditText(고칠것.n)),
```

(c) 이미지 길 — 아래 줄을 찾아:

```ts
    // ① 프로젝트
```

바로 **앞**에 더한다:

```ts
    /*
     * **일하는 턴에도 AI 가 말한다**(2026-10-07 2차 D4). 판단과 같은 호출의 reply 를 머리말 줄로
     * 남긴다 — 비었거나 다른 갈래로 쓴 글이면(고른 갈래가 이김 등, 최종 리뷰 b) 코드 문장(다시 묻지 않는다,
     * 값이 두 번 나간다). 차례는 사용자 줄 → 머리말 → 그림 줄이고, 머리말 뒤에 실패해도 실패 줄이 남는다
     * (`failure-row.ts` 가 머리말을 답으로 안 친다).
     */
    const 머리말 = await store.appendMessage({
      conversationId, role: "assistant", body: sayBody(sayText(aiText(decision, wants), SAY_IMAGE)),
    });

```

이미지 응답의 `      projectId,` 아래에 `      say: 머리말,` 를 더한다(첫 `return Response.json({\n      ok: true,\n      projectId,` 자리다).

(d) 카드뉴스 원고 턴 — ctx 모양의 `  decision: { ratio?: string; look?: string };` 를 `  decision: { wants: string; reply: string; ratio?: string; look?: string };` 로 바꾸고(라우트는 `decision` 을 그대로 넘긴다 — 머리말이 `aiText` 로 갈래를 맞춰 본다), 아래를 찾아:

```ts
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));

  // 빈 마지막 장은 고른 글 모델이 정리 문장으로 채운다(2026-09-30 사용자 결정 B).
```

이렇게 바꾼다:

```ts
  if (!ctx.conversation.title) await ctx.store.renameConversation(ctx.conversationId, easyTitle(ctx.prompt));
  // 일하는 턴의 AI 말(2차 D4). 원고는 1~2분 걸려 그동안 이 말이 보인다. 뒤에 실패해도 실패 줄이 남는다.
  const 머리말 = await ctx.store.appendMessage({
    conversationId: ctx.conversationId,
    role: "assistant",
    body: sayBody(sayText(aiText(ctx.decision, ctx.wants), ctx.wants === "revise" ? SAY_REVISE : SAY_CARDNEWS)),
  });

  // 빈 마지막 장은 고른 글 모델이 정리 문장으로 채운다(2026-09-30 사용자 결정 B).
```

같은 함수의 두 응답에 머리말을 싣는다 — `    return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });` 를 `    return Response.json({ ok: true, talked: true, message: saved, say: 머리말, textModel: ctx.textModel });` 로, Task 7 이 여러 줄로 바꾼 원고 응답의 `    ok: true, cardnews: { rowId: row.id, project }, message: row, photoRoles, textModel: ctx.textModel,` 를 `    ok: true, cardnews: { rowId: row.id, project }, message: row, say: 머리말, photoRoles, textModel: ctx.textModel,` 로 바꾼다.

`apps/web/lib/easy/image-edit-turn.ts`:

(a) import 아래에 `import { sayBody } from "../../app/easy/row-marks";` 를 더한다.

(b) `imageEditTurn` ctx 모양의 `  resultLabel?: string;`(Task 8) 아래에 더한다:

```ts
  /** 2차 D4: 일하는 턴의 AI 말. 있으면 사용자 줄 뒤 · 고치기 앞에 머리말 줄로 남긴다. */
  say?: string;
```

(c) 아래를 찾아:

```ts
  /*
   * **이번에 붙인 사진은 넣는다**(2026-10-07 2차 D3).
```

바로 **앞**에 더한다:

```ts
  // 일하는 턴의 AI 말(2차 D4). 고치기 라우트를 부르기 전에 남긴다 — 실패해도 실패 줄이 그 뒤에 남는다.
  const 머리말 = ctx.say
    ? await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "assistant", body: sayBody(ctx.say) })
    : undefined;

```

(d) 마지막 응답의 `    ...(ctx.resultLabel ? { resultLabel: ctx.resultLabel } : {}),` 아래에 `    ...(머리말 ? { say: 머리말 } : {}),` 를 더한다.

- [ ] **Step 6: 화면이 머리말을 그림 · 원고 자리 앞에 붙인다**

`apps/web/app/easy/easy-client.tsx` — Task 5 가 넣은 물음 갈래 바로 아래, 아래 줄 **앞**에:

```ts
      // 카드뉴스 원고 · 손보기(2단계 · 3단계). 값은 원고까지 안 든다.
```

더한다:

```ts
      // 일하는 턴의 AI 말(2차 D4). 그림 · 원고 자리 앞에 붙인다 — 0장 실패 안내도 그 뒤에 온다.
      if (body.ok && body.say?.id) setMessages((current) => [...current, { id: body.say.id, role: "assistant", body: body.say.body ?? "" }]);
```

- [ ] **Step 7: 시험 · 타입 · 줄 수를 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy`
Expected: PASS — 「talk 인데 답이 두 번 다 비면 그때만 기본 문장 (A3)」(`부른횟수.decide` 2)도 그대로다(재질문은 talk 만)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `wc -l apps/web/app/easy/easy-client.tsx apps/web/app/easy/chat.ts apps/web/app/api/easy/generate/route.ts`
Expected: `easy-client.tsx` 800 이하, `chat.ts` 400 근처(넘으면 보고), `route.ts` 800 아래. 보고에 적는다

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/app/easy/turn-words.ts apps/web/app/api/easy/generate/route.ts apps/web/lib/easy/image-edit-turn.ts apps/web/app/easy/easy-client.tsx apps/web/app/easy/__tests__/chat.test.ts apps/web/app/easy/__tests__/chat-image-edit.test.ts apps/web/app/easy/__tests__/turn-words.test.ts apps/web/lib/easy/__tests__/image-edit-turn.test.ts apps/web/app/easy/__tests__/message-row.test.tsx apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/cardnews-route.test.ts apps/web/app/api/easy/__tests__/generate-image-edit.test.ts
git commit -m "feat(easy): 만들기 · 고치기 · 원고 턴에도 AI 가 같은 판단의 말로 먼저 답한다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 고정 문장을 AI 글로 — 상세페이지 안내 · 몇 번 장 물음 · 손보기 끝 문장 · 카드 사실 (D4 ②)

**Files:**
- Modify: `apps/web/app/easy/detail-page.ts:9-17`, `apps/web/app/easy/_components/message.tsx` (상세페이지 안내 글)
- Modify: `apps/web/app/api/easy/generate/route.ts` (상세페이지 안내 · 카드 사실 · 손보기 넘김)
- Modify: `apps/web/lib/easy/cardnews-after-turn.ts` (장 번호 물음 저장 · 끝 문장)
- Modify: `apps/web/app/easy/chat.ts` · `chat-facts.ts` (`easyCardFactLines`), `apps/web/lib/easy/judge.ts` (`cards`)
- Modify: `apps/web/app/easy/ask-answers.ts` (`cardReply`), `apps/web/app/easy/_components/ask-row.tsx` (장 번호 단추)
- Test: `apps/web/app/easy/__tests__/detail-page.test.ts` (더함), `apps/web/app/easy/__tests__/message-row.test.tsx` (더함), `apps/web/app/easy/__tests__/chat.test.ts` (더함)
- Test (고침): `apps/web/app/api/easy/__tests__/generate-route.test.ts:151-159`, `apps/web/app/api/easy/__tests__/cardnews-route.test.ts` (번호 물음 · id · 단추 답)

**Interfaces:**
- Consumes: Task 1 — `guideBody`, `readGuide`. Task 2 — `settleTypedAnswer`(장 물음 뒤 장 갈래는 답). Task 3 — `askTurn`, `AskTurnContext`, `askText`, `aiText`. Task 8 — `EasyNumberAsk`(ask-row 안). Task 9 — `sayText`, 끝난 일로 쓰는 끝 문장 안내
- Produces:
  - `detail-page.ts`: `isDetailPageGuide` 가 `guide:detail:` 줄과 옛 완전일치 줄을 둘 다 안내로 본다
  - `cardAfterTurn` ctx 에 `물음: AskTurnContext`; 장 번호가 없거나 없는 번호면 `ask:card` 물음 줄(자료 `{ wants, count, note? }`)
  - `chat-facts.ts`: `easyCardFactLines(cards: { count: number; generating: boolean }): string[]`; `EasyPromptOptions.cards` · `EasyJudgeInput.cards`
  - `ask-answers.ts`: `cardReply(rowId: string, n: number): EasyButtonReply`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/app/easy/__tests__/detail-page.test.ts` — import 에 `import { guideBody } from "../row-marks";` 를 더하고 묶음 끝에 더한다:

```ts
  /** 2차 D4 — 안내 문장은 AI 가 쓰고 단추는 표시로 단다. Review Focus 6 — 옛 완전일치 줄도 안내다. */
  it("AI 가 쓴 안내는 표시(guide:detail:)로 알아보고, 옛 완전일치 줄도 안내로 본다", () => {
    expect(isDetailPageGuide({ role: "assistant", body: guideBody("detail", "상세페이지는 「상세페이지 만들기」에서 만들어요.") })).toBe(true);
    expect(isDetailPageGuide({ role: "assistant", body: DETAIL_PAGE_GUIDE })).toBe(true);
    expect(isDetailPageGuide({ role: "user", body: guideBody("detail", "x") })).toBe(false);
    expect(isDetailPageGuide({ role: "assistant", body: guideBody("ad", "x") })).toBe(false);
  });
```

`apps/web/app/easy/__tests__/message-row.test.tsx` — import 줄 `import { askBody, sayBody, withPick } from "../row-marks";` 를 `import { askBody, guideBody, sayBody, withPick } from "../row-marks";` 로 바꾸고 끝에 더한다:

```tsx
describe("상세페이지 안내 · 장 번호 (2차 D4)", () => {
  it("AI 가 쓴 상세페이지 안내는 표시를 떼고 보이고 「상세페이지 만들기 열기」를 단다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "d", role: "assistant", body: guideBody("detail", "상세페이지는 저쪽에서 만들어요.") }} />); });
    expect(글()).toContain("상세페이지는 저쪽에서 만들어요.");
    expect(글()).not.toContain("guide:");
    expect(view.root.findByType("a").props.href).toBe("/create");
  });

  it("몇 번 장 물음 줄은 장수만큼 번호 단추를 달고, 누르면 그 장을 보낸다", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q5", role: "assistant" as const, body: askBody("card", "몇 번 장인가요?", { wants: "card_text", count: 3 }) };
    act(() => {
      view = create(<EasyMessageRow message={물음} askControls={<EasyAskControls message={물음} asks={{} as never} attachments={[]} library={{} as never} onAttach={vi.fn()} onAnswer={onAnswer} />} />);
    });
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual(["1번", "2번", "3번"]);
    act(() => { 단추[2]!.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: "3번", answersRowId: "q5", pick: { card: 3 } });
  });
});
```

`apps/web/app/easy/__tests__/chat.test.ts` 끝에 더한다:

```ts
describe("카드뉴스 사실 (2차 D4)", () => {
  it("원고가 있으면 장수와 만드는 중인지 알린다 — 만드는 중이면 고치지 말고 말로 답하게", () => {
    const prompt = easyChatPrompt([], "3번 다시", 0, true, true, false, { cards: { count: 6, generating: true } });
    expect(prompt).toContain("이 대화의 카드뉴스는 6장입니다");
    expect(prompt).toContain("지금 카드를 만드는 중입니다");
    expect(easyChatPrompt([], "3번 다시", 0, true, true, false, { cards: { count: 6, generating: false } })).not.toContain("만드는 중입니다");
    expect(easyChatPrompt([], "안녕", 0, false, false, false, { cards: { count: 6, generating: false } })).not.toContain("6장입니다");
  });
});
```

`apps/web/app/api/easy/__tests__/generate-route.test.ts` — import 줄 `const { sayBody } = await import("../../../easy/row-marks");` 를 `const { guideBody, sayBody } = await import("../../../easy/row-marks");` 로 바꾸고, 「상세페이지 요청은 안내만 남기고…」 `it`(151~159줄)을 바꾼다:

```ts
  it("상세페이지 요청은 안내만 남기고, 사진을 안 읽고, 아무 라우트도 안 부른다 — reply 가 없으면 고정 안내", async () => {
    판단 = { wants: "detail_page", reply: "", ratio: "", look: "" };
    const { json } = await 보낸다({ prompt: "이 제품 상세페이지 만들어줘", referenceIds: [사진(1)] });

    expect(json.talked).toBe(true);
    expect(남긴줄[1]).toEqual({ conversationId: "c1", role: "assistant", body: guideBody("detail", DETAIL_PAGE_GUIDE) });
    expect(읽은사진).toEqual([]);
    expect(부른라우트).toEqual([]);
  });

  it("상세페이지 안내 문장은 AI 가 쓴 글이 먼저다 (2차 D4)", async () => {
    판단 = { wants: "detail_page", reply: "상세페이지는 「상세페이지 만들기」에서 섹션마다 확인하며 만들 수 있어요.", ratio: "", look: "" };
    await 보낸다({ prompt: "상세페이지 만들어줘" });
    expect(남긴줄[1]!.body).toBe(guideBody("detail", "상세페이지는 「상세페이지 만들기」에서 섹션마다 확인하며 만들 수 있어요."));
  });
```

`apps/web/app/api/easy/__tests__/cardnews-route.test.ts`:

(a) Task 3 의 `const { readAsk } = await import("../../../easy/row-marks");` 를 `const { askBody, readAsk, readPick } = await import("../../../easy/row-marks");` 로 바꾼다(Task 9 의 `sayBody` import 줄은 그대로).

(b) 「없는 번호 · 번호 없음은 몇 번인지 되묻고 아무것도 안 남긴다」 `it` 을 바꾼다:

```ts
  /** 3단계 Review Focus 4 · 2차 D1 — 물음도 대화에 남고 장 번호 단추가 달린다. */
  it("없는 번호 · 번호 없음은 몇 번인지 묻고 물음 줄을 남긴다 — AI 가 물음으로 쓴 글이 먼저", async () => {
    판단하면({ wants: "card_text", card: 9, note: "짧게" });
    const 첫 = (await 보낸다({ prompt: "9번 더 짧게" })).json;
    expect(readAsk(첫.message)).toEqual({ kind: "card", text: ASK_CARD_NUMBER, data: { wants: "card_text", count: 2, note: "짧게" } });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    남긴줄.length = 0;
    판단하면({ wants: "card_redo", card: 0, note: "", reply: "몇 번 장을 다시 그릴까요?" });
    await 보낸다({ prompt: "다시 그려줘" });
    expect(readAsk(남긴줄[1] as never)).toEqual({ kind: "card", text: "몇 번 장을 다시 그릴까요?", data: { wants: "card_redo", count: 2 } });
    expect(손본것).toEqual([]);
  });

  it("장 번호 단추로 답하면 판단 없이 그 장을 물을 때의 바라는 점으로 고친다 (2차 D1)", async () => {
    지난줄들 = [
      { id: "r1", role: "image", body: "", workId: "old" },
      { id: "u1", role: "user", body: "더 짧게 해줘", workId: null },
      { id: "q1", role: "assistant", body: askBody("card", ASK_CARD_NUMBER, { wants: "card_text", count: 2, note: "더 짧게" }), workId: null },
    ];
    판단 = undefined; // 판단 모델을 부르면 읽기가 실패한다 — 단추 답은 안 부른다
    const { status } = await 보낸다({ prompt: "2번", answersRowId: "q1", pick: { card: 2 } });
    expect(status).toBe(200);
    expect(손본것).toEqual([{ what: "edit", index: 2, change: { words: "더 짧게" } }]);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(readPick(남긴줄[0] as never)).toEqual({ card: 2 });
  });

  /** 2차 D4 · 최종 리뷰 g — 끝 문장은 고친 뒤에 남는다. 판단 모델에 끝난 일로 쓰게 했다(Task 9). */
  it("글 고치기 끝 문장은 AI 가 쓴 말이 먼저다 (2차 D4)", async () => {
    판단하면({ wants: "card_text", card: 2, note: "더 짧게", reply: "2번 장 본문을 더 짧게 고쳤습니다." });
    await 보낸다({ prompt: "2번 더 짧게" });
    expect(남긴줄.map((row) => row.body)).toEqual(["2번 더 짧게", "2번 장 본문을 더 짧게 고쳤습니다."]);
  });

  /** 2차 최종 리뷰 6 · Review Focus 8 — 장 물음 바로 뒤 장 갈래면 note 가 없어도 답이다. 바라는 점은 물을 때의 것. */
  it("장 물음에 말로 「2번」이라 답하면 note 가 없어도 물을 때의 바라는 점으로 그 장을 고친다", async () => {
    지난줄들 = [
      { id: "r1", role: "image", body: "", workId: "old" },
      { id: "u1", role: "user", body: "더 짧게 해줘", workId: null },
      { id: "q1", role: "assistant", body: askBody("card", ASK_CARD_NUMBER, { wants: "card_text", count: 2, note: "더 짧게" }), workId: null },
    ];
    판단하면({ wants: "card_text", card: 2, note: "" });
    await 보낸다({ prompt: "2번" });
    expect(손본것).toEqual([{ what: "edit", index: 2, change: { words: "더 짧게" } }]);
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
  });
```

(c) 「남기지 않은 답에는 id 를 안 준다(화면이 저마다 짓는다)」 `it` 을 바꾼다(번호 물음은 이제 남긴다 — 남기지 않는 답은 「만드는 중」이다):

```ts
  it("남기지 않은 답에는 id 를 안 준다(화면이 저마다 짓는다)", async () => {
    카드작업들 = { old: { ...만든원고(), status: "generating" } };
    판단 = { wants: "card_text", reply: "", ratio: "", look: "", card: 2, note: "" };
    const { json } = await 보낸다({ prompt: "2번 짧게" });
    expect(json.message).not.toHaveProperty("id");
  });
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy/__tests__/detail-page.test.ts app/easy/__tests__/message-row.test.tsx app/easy/__tests__/chat.test.ts app/api/easy/__tests__/generate-route.test.ts app/api/easy/__tests__/cardnews-route.test.ts`
Expected: FAIL — `guide:detail:` 줄이 안내가 아니다, 번호 물음이 줄을 안 남긴다, 카드 사실 없음

- [ ] **Step 3: 상세페이지 안내를 AI 글 + 표시로**

`apps/web/app/easy/detail-page.ts` — 맨 위에 `import { readGuide } from "./row-marks";` 를 더하고, 머리 주석의 「안내 문구는 **코드가 정한 한 문장**이다. … 화면은 이 문장과 **똑같은 도우미 줄**에만 단추를 단다 — 대화 표에 갈래를 더하지 않아도 다시 열었을 때 단추가 그대로 보인다.」 단락 끝에 한 줄 더한다:

```ts
 *
 * 2026-10-07 2차 D4: 안내 문장은 이제 AI 가 쓰고(비면 이 문장), 줄 글에 `guide:detail:` 표시를 붙여
 * 단추를 단다. 표시 없는 옛 줄(이 문장과 완전일치)도 계속 안내로 본다.
```

`isDetailPageGuide` 를 바꾼다:

```ts
export function isDetailPageGuide(message: { role: string; body: string }): boolean {
  return message.role === "assistant"
    && (message.body === DETAIL_PAGE_GUIDE || readGuide(message as { role: "assistant"; body: string })?.kind === "detail");
}
```

`apps/web/app/easy/_components/message.tsx` — 상세페이지 안내 갈래의 `            <p className={말풍선}>{message.body}</p>` 를 `            <p className={말풍선}>{visibleBody(message)}</p>` 로 바꾼다.

`apps/web/app/api/easy/generate/route.ts` — row-marks import 를 `import { guideBody, plainTyped, sayBody, withPick } from "../../../easy/row-marks";` 로 바꾸고, 아래를 찾아:

```ts
      const saved = await store.appendMessage({ conversationId, role: "assistant", body: DETAIL_PAGE_GUIDE });
```

이렇게 바꾼다:

```ts
      // 안내 문장은 AI 가 쓴다(2차 D4) — 비거나 물음이면 고정 안내. 단추는 표시(`guide:detail:`)로 단다.
      const saved = await store.appendMessage({
        conversationId, role: "assistant", body: guideBody("detail", sayText(aiText(decision, wants), DETAIL_PAGE_GUIDE)),
      });
```

- [ ] **Step 4: 몇 번 장 물음을 남기고 끝 문장은 AI 글로**

`apps/web/lib/easy/cardnews-after-turn.ts`:

(a) import 아래에 더한다:

```ts
import { aiText, askText, sayText } from "../../app/easy/turn-words";
import { askTurn, type AskTurnContext } from "./ask-turn";
```

(b) 머리 주석의 `* - 번호가 없거나 없는 번호면 몇 번인지 되묻는다(남기지 않는다)` 를 `* - 번호가 없거나 없는 번호면 몇 번인지 묻는다 — 물음 줄을 남기고 장 번호 단추를 단다(2차 D1)` 로 바꾼다.

(c) ctx 모양의 `  rows: ReadonlyArray<{ id: string; role: string; workId?: string | null }>;` 아래에 더한다:

```ts
  /** 2차 D1: 몇 번 장인지 물을 때 물음 줄을 남긴다. */
  물음: AskTurnContext;
```

(d) 게시글 끝 문장 — `    const message = await 주고받기를남긴다("게시글을 썼습니다. 카드뉴스 밑에서 복사할 수 있습니다.");` 를 바꾼다:

```ts
    // 끝 문장은 AI 가 쓴 말이 먼저(2차 D4), 비거나 물음이면 고정 문장.
    const message = await 주고받기를남긴다(sayText(aiText(ctx.decision, ctx.wants), "게시글을 썼습니다. 카드뉴스 밑에서 복사할 수 있습니다."));
```

(e) 번호 물음 — `  if (!index || !cardAt(project, index)) return 말로만(ASK_CARD_NUMBER);` 를 바꾼다:

```ts
  if (!index || !cardAt(project, index)) {
    /*
     * **몇 번 장인지 묻는다**(2차 D1 · D4). 물음도 대화에 남고 장 번호 단추를 단다. 문장은 AI 가 쓴
     * 물음이 먼저, 없으면 고정. 그때의 판단(갈래 · 바라는 점)을 적어 단추 답은 판단 없이 간다.
     */
    return askTurn(ctx.물음, {
      kind: "card",
      text: askText(aiText(ctx.decision, ctx.wants), ASK_CARD_NUMBER),
      data: {
        wants: ctx.wants,
        count: project.data.flow?.cards.length ?? 0,
        ...(ctx.decision.note ? { note: ctx.decision.note } : {}),
      },
    });
  }
```

(f) 글 고치기 끝 문장 — `  const message = await 주고받기를남긴다(\`${index}번 장 글을 고쳤습니다.\`);` 를 `  const message = await 주고받기를남긴다(sayText(aiText(ctx.decision, ctx.wants), \`${index}번 장 글을 고쳤습니다.\`));` 로 바꾼다. 이 문장은 고친 **뒤**에 남는다 — 판단 모델은 끝난 일로 쓴다(Task 9 의 `easyReplyLines`, 2차 최종 리뷰 g). 다른 갈래로 쓴 말이면 코드 문장(`aiText`, 최종 리뷰 b).

`apps/web/app/api/easy/generate/route.ts` — 손보기 넘김의 `        project: 고칠원고, rows: 지난줄,` 를 `        project: 고칠원고, rows: 지난줄, 물음: 물음맥락,` 로 바꾼다.

- [ ] **Step 5: 카드 사실을 판단 모델에 준다**

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/**
 * **카드뉴스 사실**(2026-10-07 2차 D4). 장수와 만드는 중인지를 사실로 준다 — 모델이 「몇 번 장?」 ·
 * 「다 만든 뒤에」를 제 말로 답하게. 코드가 갈래를 바꿔 읽으면 고정 문장이 나간다.
 */
export function easyCardFactLines(cards: { count: number; generating: boolean }): string[] {
  return [
    `이 대화의 카드뉴스는 ${cards.count}장입니다. 장 번호는 1부터 ${cards.count}까지입니다.`,
    ...(cards.generating
      ? ["**지금 카드를 만드는 중입니다.** 한 장 고치기 · 다시 그리기를 바라면 talk 로 다 만든 뒤에 하자고 답하세요."]
      : []),
    "",
  ];
}
```

`apps/web/app/easy/chat.ts`:

(a) chat-facts import 줄에 `easyCardFactLines` 를 더한다.

(b) `EasyPromptOptions` 의 `lastIsImage?: boolean;` 아래에 더한다:

```ts
  /** 2차 D4: 이 대화 카드뉴스의 장수 · 만드는 중인가. 원고가 있을 때만 싣는다. */
  cards?: { count: number; generating: boolean };
```

(c) 아래를 찾아:

```ts
        "원고에 대해 **묻기만** 하는 말(「원고 몇 장이야?」)은 talk 입니다.",
        "",
      ]
      : []),
```

바로 아래에 더한다:

```ts
    ...(갈래.includes("revise") && options.cards ? easyCardFactLines(options.cards) : []),
```

`apps/web/lib/easy/judge.ts` — `EasyJudgeInput` 의 `lastIsImage?: boolean;` 아래에 더한다:

```ts
  /** 2차 D4: 카드뉴스 장수 · 만드는 중인가. */
  cards?: { count: number; generating: boolean };
```

`        retry, adNegated, images: input.images, lastIsImage: input.lastIsImage,` 를 `        retry, adNegated, images: input.images, lastIsImage: input.lastIsImage, cards: input.cards,` 로 바꾼다.

`apps/web/app/api/easy/generate/route.ts` — `import { isMade } from "../../../easy/cardnews-after";` 를 `import { isGenerating, isMade } from "../../../easy/cardnews-after";` 로 바꾸고, 판단 입력의 `          lastIsImage: 이미지들.lastIsImage,` 아래에 더한다:

```ts
          // 카드뉴스 장수 · 만드는 중(2차 D4). 「몇 번 장?」 · 「다 만든 뒤에」를 AI 가 제 말로 답하게.
          cards: 고칠원고 ? { count: 고칠원고.data.flow?.cards.length ?? 0, generating: isGenerating(고칠원고) } : undefined,
```

- [ ] **Step 6: 장 번호 단추를 단다**

`apps/web/app/easy/ask-answers.ts` 끝에 더한다:

```ts
/** 몇 번 장인지(2차 D1). 서버는 물을 때의 갈래 · 바라는 점으로 판단 없이 간다. */
export function cardReply(rowId: string, n: number): EasyButtonReply {
  return { text: `${n}번`, answersRowId: rowId, pick: { card: n } };
}
```

`apps/web/app/easy/_components/ask-row.tsx` — ask-answers import 에 `cardReply` 를 더하고, Task 8 이 넣은 `if (ask.kind === "target") { … }` 아래에 더한다:

```tsx
  if (ask.kind === "card") {
    const count = typeof ask.data.count === "number" ? Math.min(Math.max(Math.trunc(ask.data.count), 0), 20) : 0;
    return (
      <EasyNumberAsk
        numbers={Array.from({ length: count }, (_, at) => at + 1)}
        label={(n) => `${n}번`}
        onPick={(n) => onAnswer(cardReply(message.id, n))}
      />
    );
  }
```

- [ ] **Step 7: 시험 · 타입을 본다**

Run: `pnpm --filter @fixup/web exec vitest run app/easy lib/easy app/api/easy`
Expected: PASS

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/easy/detail-page.ts apps/web/app/easy/_components/message.tsx apps/web/app/api/easy/generate/route.ts apps/web/lib/easy/cardnews-after-turn.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/lib/easy/judge.ts apps/web/app/easy/ask-answers.ts apps/web/app/easy/_components/ask-row.tsx apps/web/app/easy/__tests__/detail-page.test.ts apps/web/app/easy/__tests__/message-row.test.tsx apps/web/app/easy/__tests__/chat.test.ts apps/web/app/api/easy/__tests__/generate-route.test.ts apps/web/app/api/easy/__tests__/cardnews-route.test.ts
git commit -m "feat(easy): 상세페이지 안내 · 몇 번 장 물음 · 손보기 끝 문장을 AI 가 쓰고 단추는 표시로 단다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: 이미지를 본다 — 묻거나 볼 때만, 판정 예약 안에서 (D5)

**Files:**
- Modify: `apps/web/lib/llm/structured.ts` (이미지 입력 · 내용 짓기 함수)
- Modify: `apps/web/lib/easy/chat-provider.ts` (틀에 `see`, 보고 답하기 틀 `EASY_SEE_SPEC` · `writeSeenReply`)
- Modify: `apps/web/app/easy/chat.ts` (`EasyDecision.see` · 읽기 · 안내), `apps/web/app/easy/chat-facts.ts` (`easySeeLines`)
- Create: `apps/web/app/easy/see-prompt.ts`, `apps/web/lib/easy/see-turn.ts`(그림 바이트는 `apps/web/lib/poster/asset-bytes.ts` 의 `posterImageBytes` · `referenceBytes` 를 다시 쓴다 — 그 파일은 안 고친다, 2차 최종 리뷰 e)
- Modify: `apps/web/app/api/easy/generate/route.ts` (판정 예약 안에서 보고 답하기 · 못 봤을 때 문장)
- Test: `apps/web/lib/llm/__tests__/structured.test.ts` (더함), `apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts` (고침 · 더함), `apps/web/app/easy/__tests__/chat.test.ts` (더함), `apps/web/app/easy/__tests__/see-prompt.test.ts` (새), `apps/web/lib/easy/__tests__/see-turn.test.ts` (새), `apps/web/app/api/easy/__tests__/generate-see.test.ts` (새)

**Interfaces:**
- Consumes: Task 1 — `plainAiText`. Task 4 — `처음사진`(지금 붙은 사진, ⓪ 확인을 마친 것 — `posterReferencesByIds` 가 준 `storagePath` 가 있다) · 판정 예약 블록. Task 7 — `이미지들: EasyImageFacts`(`entries` · `pictures`), `EasyPicture`, `doneImageNumbers`
- Produces:
  - `structured.ts`: `export type StructuredImage = { url: string } | { mediaType: string; data: string }`, `StructuredProvider.generate(prompt: string, images?: readonly StructuredImage[])`, `anthropicUserContent(prompt, images?)`, `openaiUserContent(prompt, images?)` — 이미지가 없으면 지금처럼 글 하나(`string`)
  - `chat-provider.ts`: 말 판단 틀에 `see: { type: "array", items: { type: "string" } }`(required), 제공자 `writeSeenReply(prompt: string, images: readonly StructuredImage[]): Promise<unknown>`(`{ reply }`)
  - `chat.ts`: `EasyDecision.see?: string[]` — `talk` 일 때만, 모양(`^p?\d{1,3}$`)이 맞는 것만, 겹친 것 빼고 4개까지
  - `see-prompt.ts`: `export type EasySeeTarget = { kind: "image"; n: number } | { kind: "photo"; index: number }`, `seeTargets(see, entries, photoCount): EasySeeTarget[]`, `seeLabel(target): string`, `easySeePrompt({ history, prompt, labels }): string`, `SEE_FAILED`(「지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.」 — 2차 최종 리뷰 10)
  - `see-turn.ts`: `export type EasySeen = { kind: "seen"; reply: string } | { kind: "none" } | { kind: "failed" }`, `rewriteReplyBySeeing(input: { userId; rows; prompt; see; facts; photos: ReadonlyArray<{ id; url?; storagePath }>; write }): Promise<EasySeen>` — 던지지 않는다. 볼 것이 없으면 `none`(판단 모델의 답 그대로), 그림을 못 읽었거나 호출이 실패했거나 빈 답이면 `failed`(라우트가 `SEE_FAILED` 로 바꾼다). 다시 쓴 답에는 `plainAiText` 를 건다

**값을 안 쓰고 확인하는 법:** 보기 호출은 모두 가짜 `write`(see-turn 시험) · 가짜 `rewriteReplyBySeeing`(라우트 시험)로 잰다. 진짜 호출은 Task 12 에서 128px 그림 한 장으로 **딱 한 번**(값 몇 원) 한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/llm/__tests__/structured.test.ts` — import 를 `import { anthropicUserContent, openaiUserContent, unwrapStringified } from "../structured";` 로 바꾸고 끝에 더한다:

```ts
describe("이미지를 함께 보내기 (2026-10-07 「쉽게」 2차 D5)", () => {
  it("이미지가 없으면 지금처럼 글 하나다 — 다른 곳의 호출은 그대로", () => {
    expect(anthropicUserContent("말")).toBe("말");
    expect(openaiUserContent("말", [])).toBe("말");
  });

  it("주소 · base64 를 업체 모양으로 싣는다 — 그림 먼저, 글은 마지막", () => {
    expect(anthropicUserContent("말", [{ url: "https://x.test/a.png" }, { mediaType: "image/webp", data: "AAA" }])).toEqual([
      { type: "image", source: { type: "url", url: "https://x.test/a.png" } },
      { type: "image", source: { type: "base64", media_type: "image/webp", data: "AAA" } },
      { type: "text", text: "말" },
    ]);
    expect(openaiUserContent("말", [{ url: "https://x.test/a.png" }, { mediaType: "image/png", data: "BBB" }])).toEqual([
      { type: "input_image", image_url: "https://x.test/a.png", detail: "auto" },
      { type: "input_image", image_url: "data:image/png;base64,BBB", detail: "auto" },
      { type: "input_text", text: "말" },
    ]);
  });
});
```

`apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts` — Task 8 이 고친 `required` 기대를 바꾸고, 그 앞에 한 줄 더한다:

```ts
    // 2차 D5: 보고 답할 것(이미지 번호 · 붙인 사진 p1). talk 일 때만 쓴다.
    expect(schema.properties.see).toEqual({ type: "array", items: { type: "string" } });
    expect(schema.required).toEqual(["wants", "reply", "ratio", "look", "card", "note", "target", "see"]);
```

파일 끝 묶음에 더한다:

```ts
  it("보고 답하기 틀이 있고 두 업체 모두 이미지를 실어 부른다 (2차 D5)", () => {
    expect(제공자).toContain("EASY_SEE_SPEC");
    expect(제공자.match(/writeSeenReply: 보고부른다\(EASY_SEE_SPEC\)/g)).toHaveLength(2);
    expect(제공자.match(/\.generate\(prompt, images\)/g)).toHaveLength(2);
  });
```

`apps/web/app/easy/__tests__/chat.test.ts` 끝에 더한다:

```ts
describe("이미지를 보고 답할 때 (2차 D5)", () => {
  const 한장 = [{ n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "a" }];

  it("다 만든 이미지나 붙인 사진이 있을 때만 볼 것(see)을 적는 법을 알린다", () => {
    expect(easyChatPrompt([], "방금 거 어때?", 0, false, false, true, { images: 한장 })).toContain("`see` 에 볼 것을 적으세요");
    expect(easyChatPrompt([], "이 사진 어때?", 1)).toContain("「p1」");
    expect(easyChatPrompt([], "안녕")).not.toContain("`see`");
    // 카드뉴스 번호만 있으면 볼 이미지가 없다.
    expect(easyChatPrompt([], "어때?", 0, false, false, false, { images: [{ ...한장[0]!, kind: "cardnews" as const }] })).not.toContain("`see`");
  });

  /** 2차 최종 리뷰 10 — 볼 것이 없으면 판단 모델의 답이 그대로 나간다. 「살펴볼게요」 한마디로 두지 않게 한다. */
  it("볼 것을 적어도 reply 는 혼자서도 뜻이 통하게 쓰게 한다", () => {
    const prompt = easyChatPrompt([], "방금 거 어때?", 0, false, false, true, { images: 한장 });
    expect(prompt).toContain("reply 도 혼자서도 뜻이 통하게 쓰세요");
    expect(prompt).not.toContain("「살펴볼게요.」처럼 짧게");
  });

  it("볼 것은 talk 일 때만, 모양이 맞는 것만, 겹친 것 빼고 네 개까지 읽는다", () => {
    expect(readEasyDecision({ wants: "talk", reply: "살펴볼게요.", see: ["1", "p2", "x", "1", "p1", "3", "4"] }).see).toEqual(["1", "p2", "p1", "3"]);
    expect(readEasyDecision({ wants: "image", reply: "", see: ["1"] }).see).toBeUndefined();
    expect(readEasyDecision({ wants: "talk", reply: "네" })).toEqual({ wants: "talk", reply: "네" });
  });
});
```

`apps/web/app/easy/__tests__/see-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEE_FAILED, easySeePrompt, seeLabel, seeTargets } from "../see-prompt";

/** **볼 것 고르기**(2026-10-07 2차 D5). 다 만든 이미지와 지금 붙은 사진만, 네 개까지. 카드뉴스 번호는 안 본다. */
const 목록 = [1, 2, 3, 4, 5].map((n) => ({
  n, rowId: `i${n}`, workId: "p", kind: n === 5 ? "cardnews" as const : "image" as const,
  state: n === 2 ? "making" as const : "done" as const, words: "",
}));

describe("볼 것 고르기", () => {
  it("다 만든 이미지 번호와 지금 붙은 사진만, 네 개까지", () => {
    expect(seeTargets(["2", "1", "p1", "p3", "3", "4", "5"], 목록, 2)).toEqual([
      { kind: "image", n: 1 }, { kind: "photo", index: 1 }, { kind: "image", n: 3 }, { kind: "image", n: 4 },
    ]);
    expect(seeTargets(["9", "p0"], 목록, 1)).toEqual([]);
    expect(seeTargets(["5"], 목록, 0)).toEqual([]);
  });

  /** 2차 최종 리뷰 10 — 보기가 실패하면 판단의 짧은 답 대신 나가는 문장. 혼자서도 뜻이 통하고 줄표가 없다. */
  it("못 봤을 때 문장", () => {
    expect(SEE_FAILED).toBe("지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.");
    expect(SEE_FAILED).not.toContain("—");
  });

  it("이름표와 프롬프트는 보낸 차례 · 지난 대화 · 마지막 말을 싣는다", () => {
    expect(seeLabel({ kind: "image", n: 2 })).toBe("이 대화의 이미지 2번");
    expect(seeLabel({ kind: "photo", index: 1 })).toBe("사용자가 붙인 사진 1");
    const prompt = easySeePrompt({ history: ["사용자: 카페 포스터"], prompt: "방금 거 어때?", labels: ["이 대화의 이미지 1번"] });
    expect(prompt).toContain("1번째: 이 대화의 이미지 1번");
    expect(prompt).toContain("사용자: 카페 포스터");
    expect(prompt).toContain("방금 거 어때?");
    expect(prompt).not.toContain("—");
  });
});
```

`apps/web/lib/easy/__tests__/see-turn.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이미지를 보고 답하기**(2026-10-07 2차 D5). 값을 안 쓰고 잰다 — 글 모델 대신 가짜 `write` 가 받은
 * 그림 · 글을 본다. 운영은 서버가 서명한 주소, 로컬은 `lib/poster/asset-bytes.ts` 로 읽은 base64 다
 * (2차 최종 리뷰 e — 바이트 읽기를 따로 짜지 않는다).
 */
vi.mock("server-only", () => ({}));
let 로컬 = false;
let 읽기실패 = false;
const 읽은경로: string[] = [];
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => 로컬, localStoreRoot: () => "root" }));
vi.mock("../../storage/signing", () => ({ signPath: async (bucket: string, path: string) => `https://signed.test/${bucket}/${path}` }));
vi.mock("../../poster/asset-bytes", () => ({
  posterImageBytes: async (assetPath: string) => {
    읽은경로.push(assetPath);
    if (읽기실패) throw new Error("ENOENT");
    return { bytes: Buffer.from("poster-bytes"), contentType: "image/webp" };
  },
  referenceBytes: async (storagePath: string) => {
    읽은경로.push(storagePath);
    return { bytes: Buffer.from(`ref-${storagePath}`), contentType: "image/jpeg" };
  },
}));

const { rewriteReplyBySeeing } = await import("../see-turn");

const 사실 = {
  entries: [
    { n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "카페" },
    { n: 2, rowId: "i2", workId: "p2", kind: "image" as const, state: "making" as const, words: "배너" },
  ],
  posters: new Set(["p1", "p2"]),
  pictures: new Map([[1, {
    id: "img-1", projectId: "p1", generationRequestId: "r1", selected: false, assetPath: "me/p1/1.png", thumbPath: "me/p1/1.thumb.webp",
  }]]),
  madeImage: true,
  lastIsImage: true,
};
let 받은: Array<{ prompt: string; images: unknown[] }>;
const 쓴다 = (reply: unknown = { reply: "  배경이 밝아 글자가 잘 보여요.  " }) =>
  async (prompt: string, images: readonly unknown[]) => { 받은.push({ prompt, images: [...images] }); return reply; };
const 본다 = (over: Record<string, unknown> = {}) => rewriteReplyBySeeing({
  userId: "me", rows: [{ role: "user", body: "카페 포스터" }], prompt: "방금 거 어때?", see: ["1", "p1"], facts: 사실,
  photos: [{ id: "ref-1", url: "https://signed.test/ref-1", storagePath: "me/references/ref-1.jpg" }], write: 쓴다(), ...over,
});

beforeEach(() => { 로컬 = false; 읽기실패 = false; 받은 = []; 읽은경로.length = 0; });

describe("이미지를 보고 답하기", () => {
  it("운영에서는 결과 사본 · 붙인 사진을 서명한 주소로 넘기고, 다시 쓴 답을 준다", async () => {
    expect(await 본다()).toEqual({ kind: "seen", reply: "배경이 밝아 글자가 잘 보여요." });
    expect(받은[0]!.images).toEqual([{ url: "https://signed.test/library/me/p1/1.thumb.webp" }, { url: "https://signed.test/ref-1" }]);
    expect(받은[0]!.prompt).toContain("1번째: 이 대화의 이미지 1번");
    expect(받은[0]!.prompt).toContain("2번째: 사용자가 붙인 사진 1");
    expect(받은[0]!.prompt).toContain("사용자: 카페 포스터");
    expect(읽은경로).toEqual([]);
  });

  it("로컬에서는 asset-bytes 로 사본 · 붙인 사진을 읽어 base64 로 넘긴다", async () => {
    로컬 = true;
    await 본다();
    expect(읽은경로).toEqual(["me/p1/1.thumb.webp", "me/references/ref-1.jpg"]);
    expect(받은[0]!.images).toEqual([
      { mediaType: "image/webp", data: Buffer.from("poster-bytes").toString("base64") },
      { mediaType: "image/jpeg", data: Buffer.from("ref-me/references/ref-1.jpg").toString("base64") },
    ]);
  });

  it("다 안 만든 이미지 · 없는 번호 · 없는 사진이면 부르지 않는다 — 볼 것이 없다(none)", async () => {
    expect(await 본다({ see: ["2", "9", "p3"] })).toEqual({ kind: "none" });
    expect(받은).toEqual([]);
  });

  /** 2차 최종 리뷰 10 — 라우트가 「지금은 이미지를 볼 수 없었습니다…」로 바꾼다. */
  it("보고 답하기가 실패하거나 빈 답이거나 그림을 못 읽으면 failed", async () => {
    expect(await 본다({ write: async () => { throw new Error("timeout"); } })).toEqual({ kind: "failed" });
    expect(await 본다({ write: 쓴다({ reply: "" }) })).toEqual({ kind: "failed" });
    로컬 = true;
    읽기실패 = true;
    expect(await 본다({ see: ["1"] })).toEqual({ kind: "failed" });
  });

  /** 2차 최종 리뷰 c — 보고 다시 쓴 답도 표시 머리를 푼다. */
  it("다시 쓴 답의 표시 머리를 푼다", async () => {
    expect(await 본다({ write: 쓴다({ reply: "say:좋아 보여요." }) })).toEqual({ kind: "seen", reply: "say：좋아 보여요." });
  });
});
```

`apps/web/app/api/easy/__tests__/generate-see.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **이미지를 본다 — 묻거나 볼 때만**(2026-10-07 2차 설계 D5 · §3-5). 판단 모델이 볼 것(`see`)을 적은
 * talk 턴에만 두 번째 호출을 한다. 판정 예약(0크레딧 `easy:decide`)이 닫히기 전에 부른다 — relay
 * 단계를 늘리지 않는다. 그 밖의 턴은 값이 늘지 않는다. 보기 호출은 가짜로 잰다(값 0).
 */
vi.mock("server-only", () => ({}));

let 판단: unknown;
let 본결과: { kind: "seen"; reply: string } | { kind: "none" } | { kind: "failed" };
const 차례: string[] = [];
const 본것: Array<Record<string, unknown>> = [];
const 남긴줄: Array<{ role: string; body?: string }> = [];

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => { 차례.push("reserve"); return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined }; },
  settleAiUsage: async () => { 차례.push("settle"); return { remaining: 0 }; },
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => [
      { id: "u1", role: "user", body: "카페 포스터", workId: null },
      { id: "i1", role: "image", body: "", workId: "p1" },
    ],
    appendMessage: async (row: { role: string; body?: string }) => { 남긴줄.push(row); return { id: `m${남긴줄.length}`, ...row }; },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async () => { 차례.push("decide"); return 판단; },
    decideRoles: async () => ({ photos: [], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/image-list", () => ({
  loadEasyImages: async () => ({
    entries: [{ n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페 포스터" }],
    posters: new Set(["p1"]), pictures: new Map(), madeImage: true, lastIsImage: true,
  }),
}));
vi.mock("../../../../lib/easy/see-turn", () => ({
  rewriteReplyBySeeing: async (input: Record<string, unknown>) => { 차례.push("see"); 본것.push(input); return 본결과; },
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()), lastCardnewsProject: async () => null, cardnewsProjectIds: async () => new Set<string>(),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({ readEasyPhotos: async () => ({}) }));
vi.mock("../../../../lib/poster/references", () => ({ posterReferencesByIds: async () => [] }));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
const 라우트 = (step: string) => ({
  POST: async () => {
    차례.push(step);
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p9" } })
      : Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { SEE_FAILED } = await import("../../../easy/see-prompt");

const 보낸다 = async (prompt: string) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", prompt, imageModel: "gpt-image-2.5-flare" }),
  }));
  return { status: response.status, json: await response.json() };
};

beforeEach(() => {
  판단 = { wants: "talk", reply: "방금 이미지를 살펴보고 말씀드릴게요. 글자 크기와 배경을 보겠습니다.", ratio: "", look: "", card: 0, note: "", target: 0, see: ["1"] };
  본결과 = { kind: "seen", reply: "글자가 커서 멀리서도 잘 보여요. 배경을 조금 밝게 하면 더 좋겠어요." };
  차례.length = 0; 본것.length = 0; 남긴줄.length = 0;
});

describe("이미지를 보고 답하기 (2차 D5)", () => {
  it("볼 것을 적은 talk 턴이면 판정 예약 안에서 보고, 다시 쓴 답을 남긴다", async () => {
    const { json } = await 보낸다("방금 거 어때?");
    expect(차례).toEqual(["reserve", "decide", "see", "settle"]);
    expect(본것[0]).toMatchObject({ see: ["1"], prompt: "방금 거 어때?", userId: "me-1" });
    expect(json.message.body).toBe("글자가 커서 멀리서도 잘 보여요. 배경을 조금 밝게 하면 더 좋겠어요.");
  });

  it("볼 것이 없으면 부르지 않는다 — 값이 늘지 않는다", async () => {
    판단 = { wants: "talk", reply: "네, 안녕하세요.", ratio: "", look: "", card: 0, note: "", target: 0, see: [] };
    await 보낸다("안녕");
    expect(차례).not.toContain("see");
  });

  it("만들기 턴에는 볼 것을 적어도 부르지 않는다 — 고치기 · 만들기 모델이 직접 본다", async () => {
    판단 = { wants: "image", reply: "만들겠습니다.", ratio: "1:1", look: "", card: 0, note: "", target: 0, see: ["1"] };
    await 보낸다("이거랑 비슷하게 하나 더");
    expect(차례).not.toContain("see");
    expect(차례).toContain("project");
  });

  it("볼 것이 실제로 없었으면(없는 번호) 판단 모델의 답 그대로다 — 혼자서도 뜻이 통하게 쓴 답이다", async () => {
    본결과 = { kind: "none" };
    const { json } = await 보낸다("방금 거 어때?");
    expect(json.message.body).toBe("방금 이미지를 살펴보고 말씀드릴게요. 글자 크기와 배경을 보겠습니다.");
  });

  /** 2차 최종 리뷰 10 — 보기가 실패하면 「살펴볼게요」류의 짧은 답을 남기지 않고 못 봤다고 사실대로 말한다. */
  it("보기가 실패하면 판단의 답 대신 「지금은 이미지를 볼 수 없었습니다」를 남긴다", async () => {
    본결과 = { kind: "failed" };
    const { json } = await 보낸다("방금 거 어때?");
    expect(json.message.body).toBe(SEE_FAILED);
    expect(차례).toEqual(["reserve", "decide", "see", "settle"]);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/llm/__tests__/structured.test.ts lib/easy/__tests__/chat-provider-wiring.test.ts app/easy/__tests__/chat.test.ts app/easy/__tests__/see-prompt.test.ts lib/easy/__tests__/see-turn.test.ts app/api/easy/__tests__/generate-see.test.ts`
Expected: FAIL — `anthropicUserContent is not a function`, `Failed to resolve import "../see-prompt"` · `"../see-turn"`, 틀에 `see` 없음

- [ ] **Step 3: 공용 어댑터에 이미지 입력을 더한다**

`apps/web/lib/llm/structured.ts`:

(a) `export type StructuredSpec = …;` 아래에 더한다:

```ts
/**
 * 판단 · 답에 함께 보일 이미지(2026-10-07 「쉽게」 2차 D5). 서버가 서명한 주소 또는 base64 원문.
 * 새 파일에서 SDK 를 부르지 않게 여기에만 더한다(`ai-cost-call-sites.test.ts`).
 */
export type StructuredImage = { url: string } | { mediaType: string; data: string };
```

(b) `StructuredProvider` 를 바꾼다:

```ts
export interface StructuredProvider {
  generate(prompt: string, images?: readonly StructuredImage[]): Promise<unknown>;
}

/** Anthropic 의 사용자 글. 이미지가 없으면 지금처럼 글 하나다 — 다른 곳의 호출은 그대로다. 그림이 먼저다. */
export function anthropicUserContent(prompt: string, images: readonly StructuredImage[] = []) {
  if (!images.length) return prompt;
  return [
    ...images.map((image) => ("url" in image
      ? { type: "image" as const, source: { type: "url" as const, url: image.url } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType as "image/png", data: image.data } })),
    { type: "text" as const, text: prompt },
  ];
}

/** OpenAI 의 사용자 글. 그림은 주소 또는 `data:` 주소로 싣는다(`lib/pdp/providers.ts` 와 같은 모양). */
export function openaiUserContent(prompt: string, images: readonly StructuredImage[] = []) {
  if (!images.length) return prompt;
  return [
    ...images.map((image) => ({
      type: "input_image" as const,
      image_url: "url" in image ? image.url : `data:${image.mediaType};base64,${image.data}`,
      detail: "auto" as const,
    })),
    { type: "input_text" as const, text: prompt },
  ];
}
```

(c) `AnthropicStructuredProvider.generate` — `  async generate(prompt: string): Promise<unknown> {` 를 `  async generate(prompt: string, images: readonly StructuredImage[] = []): Promise<unknown> {` 로, `      messages: [{ role: "user", content: prompt }],` 를 `      messages: [{ role: "user", content: anthropicUserContent(prompt, images) }],` 로 바꾼다.

(d) `OpenAIStructuredProvider.generate` — 같은 머리 줄을 같은 꼴로 바꾸고, `        { role: "user", content: prompt },` 를 `        { role: "user", content: openaiUserContent(prompt, images) },` 로 바꾼다.

- [ ] **Step 4: 판단 틀에 볼 것 · 보고 답하기 틀을 더한다**

`apps/web/lib/easy/chat-provider.ts`:

(a) structured import 를 바꾼다:

```ts
import {
  AnthropicStructuredProvider,
  OpenAIStructuredProvider,
  type StructuredImage,
  type StructuredSpec,
} from "../llm/structured";
```

(b) 말 판단 틀 — Task 8 의 `        target: { type: "integer" },` 아래에 더하고 `required` 를 바꾼다:

```ts
        // 2차 D5: 보고 답할 것 — 이 대화의 이미지 번호(「2」) · 붙인 사진(「p1」). 없으면 빈 목록.
        see: { type: "array", items: { type: "string" } },
      },
      required: ["wants", "reply", "ratio", "look", "card", "note", "target", "see"],
```

(c) `EASY_CARD_EDIT_SPEC` 아래에 더한다:

```ts
/**
 * **이미지를 보고 다시 쓴 답**(2026-10-07 2차 D5). 판단 모델이 볼 것(`see`)을 적은 talk 턴에만
 * 부른다. `reply` 하나다.
 */
const EASY_SEE_SPEC: StructuredSpec = {
  name: "easy_seen_reply",
  description: "보여 준 이미지를 직접 보고 사용자의 말에 답한다.",
  schema: {
    type: "object",
    properties: { reply: { type: "string" } },
    required: ["reply"],
  },
};
```

(d) OpenAI 갈래 — `    const 부른다 = (spec: StructuredSpec) => (prompt: string) =>\n      new OpenAIStructuredProvider(openai, textModel!, spec).generate(prompt);` 아래에 더한다:

```ts
    const 보고부른다 = (spec: StructuredSpec) => (prompt: string, images: readonly StructuredImage[]) =>
      new OpenAIStructuredProvider(openai, textModel!, spec).generate(prompt, images);
```

그 갈래의 `return { … writeAdGuide: 부른다(EASY_AD_GUIDE_SPEC) };` 줄 끝 ` };` 앞에 `, writeSeenReply: 보고부른다(EASY_SEE_SPEC)` 를 더한다.

(e) Anthropic 갈래 — `  const 부른다 = (spec: StructuredSpec) => (prompt: string) =>\n    new AnthropicStructuredProvider(anthropic, model, spec).generate(prompt);` 아래에 더한다:

```ts
  const 보고부른다 = (spec: StructuredSpec) => (prompt: string, images: readonly StructuredImage[]) =>
    new AnthropicStructuredProvider(anthropic, model, spec).generate(prompt, images);
```

그 갈래의 `return { … writeAdGuide: 부른다(EASY_AD_GUIDE_SPEC) };` 줄 끝 ` };` 앞에 `, writeSeenReply: 보고부른다(EASY_SEE_SPEC)` 를 더한다.

- [ ] **Step 5: 볼 것을 읽고 판단 모델에 고르는 법을 알린다**

`apps/web/app/easy/chat-facts.ts` 끝에 더한다:

```ts
/**
 * **이미지를 보고 답해야 하는 말**(2026-10-07 2차 D5). 묻거나 볼 때만 본다 — 그 밖의 턴은 글로만
 * 판단해 값이 늘지 않는다. 다 만든 이미지나 붙인 사진이 있을 때만 싣는다.
 */
export function easySeeLines(): string[] {
  return [
    "── 이미지를 보고 답해야 하는 말 ──",
    "이미지에 대해 **묻는** 말(「방금 거 어때?」 · 「1번이랑 2번 중 뭐가 나아?」 · 「이 사진에서 뭐가 문제야?」)이면",
    "talk 로 고르고 `see` 에 볼 것을 적으세요. 이 대화의 이미지는 번호(「2」), 붙인 사진은 「p1」 · 「p2」 입니다.",
    "그러면 그 이미지를 직접 보고 답을 다시 씁니다. 네 개까지입니다.",
    // 2차 최종 리뷰 10 — 볼 것이 실제로 없으면(없는 번호) 이 reply 가 그대로 나간다. 「살펴볼게요」 한마디면 답이 아니다.
    "이때 reply 도 혼자서도 뜻이 통하게 쓰세요. 보지 못하면 그 말이 그대로 나갑니다. 보이지 않는 것을 지어내지는 마세요.",
    "그 밖의 말은 `see` 를 빈 목록으로 두세요. 만들거나 고쳐 달라는 말에도 빈 목록입니다.",
    "",
  ];
}
```

`apps/web/app/easy/chat.ts`:

(a) chat-facts import 에 `easySeeLines` 를 더한다.

(b) `EasyDecision` 의 `  target?: number;` 아래에 더한다:

```ts
  /** 2차 D5: 보고 답할 것(이 대화의 이미지 번호 「2」 · 붙인 사진 「p1」). talk 일 때만 있다. */
  see?: string[];
```

(c) Task 7 이 넣은 `    ...easyResultListLines(options.images ?? []),` 아래에 더한다(`doneImageNumbers` 는 Task 8 이 import 했다):

```ts
    // 2차 D5: 다 만든 이미지나 붙인 사진이 있으면 보고 답해야 하는 말을 고르는 법을 알린다(카드뉴스 번호는 안 본다).
    ...(doneImageNumbers(options.images ?? []).length || attachmentCount > 0 ? easySeeLines() : []),
```

(d) `readEasyDecision` — `value` 의 모양에 `see?: unknown;` 을 더하고(`target?: unknown;` 뒤), Task 8 의 `const target = …` 줄 아래에 더한다:

```ts
  // 2차 D5: 보고 답할 것. 모양이 맞는 것만, 겹친 것은 빼고 네 개까지. talk 일 때만 쓴다.
  const see = Array.isArray(value?.see)
    ? [...new Set((value!.see as unknown[])
      .filter((one): one is string => typeof one === "string")
      .map((one) => one.trim())
      .filter((one) => /^p?\d{1,3}$/.test(one)))].slice(0, 4)
    : [];
```

돌려주는 객체의 `    ...(target && wants === "image_edit" ? { target } : {}),` 아래에 더한다:

```ts
    ...(see.length && wants === "talk" ? { see } : {}),
```

- [ ] **Step 6: 볼 것 고르기 · 보고 답하기를 만든다**

`apps/web/app/easy/see-prompt.ts`:

```ts
import { doneImageNumbers, type EasyResultEntry } from "./image-numbers";

/**
 * **이미지를 보고 답하기 — 볼 것 고르기 · 프롬프트**(2026-10-07 2차 설계 D5 · §3-5).
 *
 * 판단 모델이 적은 `see`(이 대화의 이미지 번호 「2」 · 붙인 사진 「p1」)에서 실제로 볼 수 있는 것만
 * 고른다 — 다 만든 이미지(카드뉴스 번호는 안 본다) · 지금 붙은 사진. 한 턴 네 장까지(값 · 기다림을 묶어 둔다).
 */
export type EasySeeTarget = { kind: "image"; n: number } | { kind: "photo"; index: number };

/**
 * 보고 답하기가 실패했을 때 판단의 답 대신 남길 말(2차 최종 리뷰 10). 판단의 답은 「살펴볼게요」처럼 볼 것을
 * 기대한 글일 수 있다 — 못 봤으면 못 봤다고 사실대로 말한다.
 */
export const SEE_FAILED = "지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.";

const 최대 = 4;

export function seeTargets(see: readonly string[], entries: readonly EasyResultEntry[], photoCount: number): EasySeeTarget[] {
  const 다만든 = new Set(doneImageNumbers(entries));
  return see.flatMap((one): EasySeeTarget[] => {
    if (one.startsWith("p")) {
      const index = Number(one.slice(1));
      return Number.isInteger(index) && index >= 1 && index <= photoCount ? [{ kind: "photo", index }] : [];
    }
    const n = Number(one);
    return 다만든.has(n) ? [{ kind: "image", n }] : [];
  }).slice(0, 최대);
}

export function seeLabel(target: EasySeeTarget): string {
  return target.kind === "image" ? `이 대화의 이미지 ${target.n}번` : `사용자가 붙인 사진 ${target.index}`;
}

export function easySeePrompt(input: { history: readonly string[]; prompt: string; labels: readonly string[] }): string {
  return [
    "당신은 이미지를 만들어 주는 도우미입니다. 한국어로 답합니다.",
    "사용자가 이미지에 대해 물었습니다. 함께 보낸 이미지를 **직접 보고** 답하세요. 보이지 않는 것을 지어내지 마세요.",
    "",
    "── 보낸 이미지 (보낸 차례) ──",
    ...input.labels.map((label, at) => `${at + 1}번째: ${label}`),
    "",
    ...(input.history.length ? ["── 지난 대화 ──", ...input.history, ""] : []),
    "── 사용자의 마지막 말 ──",
    input.prompt,
    "",
    "`reply` 에 2~4문장으로 답하세요. 보이는 것을 근거로 말하고, 고치고 싶은 점이 있으면 「이미지 2 배경만 파랗게」처럼",
    "말해 달라고 안내해도 됩니다. 「그림」이라 하지 말고 「이미지」라고 쓰세요.",
  ].join("\n");
}
```

`apps/web/lib/easy/see-turn.ts`:

```ts
import { easySeePrompt, seeLabel, seeTargets, type EasySeeTarget } from "../../app/easy/see-prompt";
import { plainAiText, visibleBody } from "../../app/easy/row-marks";
import type { EasyMessage } from "../../app/easy/turn";
import { isLocalStoreEnabled } from "../local-store";
import type { StructuredImage } from "../llm/structured";
import { posterImageBytes, referenceBytes } from "../poster/asset-bytes";
import { signPath } from "../storage/signing";
import type { EasyImageFacts, EasyPicture } from "./image-list";

/**
 * **이미지를 보고 답한다 — 묻거나 볼 때만**(2026-10-07 2차 설계 D5 · §3-5).
 *
 * 판단 모델이 볼 것(`see`)을 적은 talk 턴에만 라우트가 부른다. 그 이미지 · 붙인 사진을 넣어 두 번째
 * 호출로 reply 를 다시 쓴다. 값은 회원 크레딧이 아니라 회사 원가다(판정 예약 안, 0크레딧).
 *
 * 그림은 운영에서 서버가 서명한 주소(5분), 로컬에서 `lib/poster/asset-bytes.ts` 로 읽은 base64 로 넘긴다 —
 * 로컬 저장소 주소는 바깥에서 못 받는다. 바이트 읽기를 따로 짜지 않는다(2차 최종 리뷰 e). 그 파일은 경로를
 * 안 거르므로 넘기는 경로의 출처를 적어 둔다: 결과 그림은 본인 포스터 저장소의 그림 행(`image-list.ts` —
 * `posterStoresForUser`), 붙인 사진은 ⓪ 확인(`posterReferencesByIds`)이 걸러 준 행의 `storagePath` 다.
 * 결과 그림은 사본(작다)이 있으면 그것 — 이미지 토큰이 준다.
 *
 * **던지지 않는다.** 볼 것이 없으면 `none`(판단 모델의 답 그대로), 못 읽었거나 호출이 실패했거나 빈 답이면
 * `failed`(라우트가 「지금은 이미지를 볼 수 없었습니다…」로 바꾼다, 2차 최종 리뷰 10). 대화가 멈추지 않는다.
 */
interface SeeInput {
  userId: string;
  rows: ReadonlyArray<Pick<EasyMessage, "role" | "body">>;
  prompt: string;
  see: readonly string[];
  facts: EasyImageFacts;
  /** 지금 붙은 사진(⓪ 확인을 마친 것). 붙인 순서다 — 「p1」이 첫 장. */
  photos: ReadonlyArray<{ id: string; url?: string | null; storagePath: string }>;
  write: (prompt: string, images: readonly StructuredImage[]) => Promise<unknown>;
}

export type EasySeen = { kind: "seen"; reply: string } | { kind: "none" } | { kind: "failed" };

const 서명시간 = 300;

async function 결과그림(picture: EasyPicture): Promise<StructuredImage> {
  const 경로 = picture.thumbPath || picture.assetPath;
  if (!isLocalStoreEnabled()) return { url: await signPath("library", 경로, 서명시간) };
  const { bytes, contentType } = await posterImageBytes(경로);
  return { mediaType: contentType, data: bytes.toString("base64") };
}

async function 붙인사진(photo: SeeInput["photos"][number]): Promise<StructuredImage> {
  if (!isLocalStoreEnabled() && photo.url) return { url: photo.url };
  const { bytes, contentType } = await referenceBytes(photo.storagePath);
  return { mediaType: contentType, data: bytes.toString("base64") };
}

async function 보낼그림(input: SeeInput, target: EasySeeTarget): Promise<StructuredImage | undefined> {
  if (target.kind === "photo") {
    const photo = input.photos[target.index - 1];
    return photo ? 붙인사진(photo) : undefined;
  }
  const picture = input.facts.pictures.get(target.n);
  return picture ? 결과그림(picture) : undefined;
}

export async function rewriteReplyBySeeing(input: SeeInput): Promise<EasySeen> {
  const targets = seeTargets(input.see, input.facts.entries, input.photos.length);
  if (!targets.length) return { kind: "none" };
  try {
    const 그림들 = await Promise.all(targets.map(async (target) => ({ target, image: await 보낼그림(input, target) })));
    const 보낼것 = 그림들.flatMap((one) => (one.image ? [{ label: seeLabel(one.target), image: one.image }] : []));
    if (!보낼것.length) return { kind: "none" };
    const history = input.rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .slice(-6)
      .map((row) => `${row.role === "user" ? "사용자" : "도우미"}: ${visibleBody(row).slice(0, 200)}`);
    const raw = await input.write(
      easySeePrompt({ history, prompt: input.prompt, labels: 보낼것.map((one) => one.label) }),
      보낼것.map((one) => one.image),
    );
    const reply = (raw as { reply?: unknown } | null)?.reply;
    // 보고 다시 쓴 답도 AI 글이다 — 표시 머리를 푼다(2차 최종 리뷰 c).
    return typeof reply === "string" && reply.trim() ? { kind: "seen", reply: plainAiText(reply.trim()) } : { kind: "failed" };
  } catch (error) {
    console.warn("[easy] 이미지를 보고 답하지 못했습니다", error instanceof Error ? error.message : error);
    return { kind: "failed" };
  }
}
```

- [ ] **Step 7: 라우트가 판정 예약 안에서 보고 답한다**

`apps/web/app/api/easy/generate/route.ts`:

(a) `import { loadEasyImages } from "../../../../lib/easy/image-list";` 아래에 두 줄 더한다:

```ts
import { rewriteReplyBySeeing } from "../../../../lib/easy/see-turn";
import { SEE_FAILED } from "../../../easy/see-prompt";
```

(b) 판정 예약 안의 규격 안내 블록을 찾아:

```ts
        if (decision.wants === "ad_specs" && !옛골랐나) {
          광고안내 = await writeAdGuide((text) => provider.writeAdGuide(text), {
            prompt,
            imageCount: await countEasyImages(auth.member.userId, 지난줄),
          });
        }
```

바로 아래에 더한다(같은 `try` 안이다 — `catch` 와 정산 앞):

```ts
        /*
         * **이미지를 보고 답한다 — 묻거나 볼 때만**(2026-10-07 2차 D5). 판단 모델이 볼 것(`see`)을 적은
         * talk 턴에만 두 번째 호출로 그 이미지 · 붙인 사진을 넣어 reply 를 다시 쓴다. 판정 예약 안에서
         * 부른다 — 회원 크레딧은 0(`easy:decide`)이고 값은 회사 원가로 계량기에 적힌다. 대화는 멈추지
         * 않는다: 볼 것이 없었으면 판단의 답 그대로(혼자서도 뜻이 통하게 쓰게 했다), 보기가 실패했으면
         * 「볼게요」류의 답을 남기지 않고 못 봤다고 사실대로 말한다(`SEE_FAILED`, 2차 최종 리뷰 10).
         */
        if (decision.wants === "talk" && decision.see?.length) {
          const 본것 = await rewriteReplyBySeeing({
            userId: auth.member.userId, rows: 지난줄, prompt, see: decision.see, facts: 이미지들,
            photos: 처음사진.photos, write: (text, images) => provider.writeSeenReply(text, images),
          });
          if (본것.kind === "seen") decision = { ...decision, reply: 본것.reply };
          if (본것.kind === "failed") decision = { ...decision, reply: SEE_FAILED };
        }
```

- [ ] **Step 8: 시험 · 타입 · 원가 감시를 본다**

Run: `pnpm --filter @fixup/web exec vitest run lib/llm lib/easy app/easy app/api/easy lib/__tests__/ai-cost-call-sites.test.ts`
Expected: PASS — `ai-cost-call-sites.test.ts` 의 「알려진 목록과 같다」가 그대로(새 파일이 SDK 를 import 하지 않는다)

Run: `pnpm --filter @fixup/web typecheck`
Expected: 에러 0

Run: `grep -nE "from \"(@anthropic-ai/sdk|openai)\"" apps/web/lib/easy/see-turn.ts apps/web/app/easy/see-prompt.ts`
Expected: 출력 없음

Run: `grep -nE "readFile|node:fs" apps/web/lib/easy/see-turn.ts`
Expected: 출력 없음(그림 바이트는 `lib/poster/asset-bytes.ts` 를 다시 쓴다 — 2차 최종 리뷰 e)

- [ ] **Step 9: 커밋**

```bash
git add apps/web/lib/llm/structured.ts apps/web/lib/easy/chat-provider.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/app/easy/see-prompt.ts apps/web/lib/easy/see-turn.ts apps/web/app/api/easy/generate/route.ts apps/web/lib/llm/__tests__/structured.test.ts apps/web/lib/easy/__tests__/chat-provider-wiring.test.ts apps/web/app/easy/__tests__/chat.test.ts apps/web/app/easy/__tests__/see-prompt.test.ts apps/web/lib/easy/__tests__/see-turn.test.ts apps/web/app/api/easy/__tests__/generate-see.test.ts
git commit -m "feat(easy): 이미지에 대해 물으면 그 이미지를 직접 보고 답한다" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 실제 모델 확인 · 전체 검증 · 로컬 화면 확인

**Files:**
- Create (저장소 밖): `C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/easy-ai-assistant-eval.mts`
- 저장소 파일은 바꾸지 않는다(실패가 나오면 멈추고 보고한다)

**Interfaces:**
- Consumes: Task 1~11 전부 — `createEasyChatProvider`(`decide` · `writeSeenReply`), `judgeEasyTurn`(`images` · `lastIsImage` · `cards`), `askBody` · `sayBody`, `askChain` · `askInstruction` · `ASK_ANSWER_NOTE`, `ASK_TARGET_NOTE`, `KIND_QUESTION` · `RATIO_QUESTION` · `askText`, `ASK_CARD_NUMBER`, `easySeePrompt`
- Produces: 검증 결과(사용자 보고용)

**값:** 2차 확인 13경우 × 2번 + 보기 진짜 호출 1번 + 1차 회귀 묶음 1번 + 로컬 화면 판단 1번 — 판단 한 번에 약 2~3센트(추정, 판정 프롬프트가 길어졌다). 모두 합쳐 1천~2천 원 안팎(추정). 회원 크레딧은 안 쓴다(스크립트는 예약을 안 거치고, 로컬 화면의 판단도 0크레딧 판정이다). 이미지 생성 값은 0 — 만들기 요청은 모두 가로챈다.

- [ ] **Step 1: 실제 모델 확인 스크립트를 쓴다**

**Write 도구로** 만든다(heredoc 은 `\n` 을 먹는다). 키는 파일 안에서 읽고 출력하지 않는다.

```ts
import { readFileSync } from "node:fs";
import { createEasyChatProvider } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/lib/easy/chat-provider.ts";
import { judgeEasyTurn } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/lib/easy/judge.ts";
import { askBody, sayBody } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/row-marks.ts";
import { ASK_ANSWER_NOTE, askChain, askInstruction } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/ask-chain.ts";
import { ASK_CARD_NUMBER } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/cardnews-after.ts";
import { ASK_TARGET_NOTE } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/chat-facts.ts";
import { KIND_QUESTION, RATIO_QUESTION, askText } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/turn-words.ts";
import { easySeePrompt } from "file:///C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/app/easy/see-prompt.ts";

const 웹 = "C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web";
// 키 이름만 고른다. 값은 출력하지 않는다.
const env = Object.fromEntries(
  readFileSync("C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local", "utf8").split(/\r?\n/)
    .filter((line) => line.startsWith("ANTHROPIC_API_KEY="))
    .map((line) => [line.split("=")[0], line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const provider = createEasyChatProvider(env, "claude-sonnet-5");

type Row = { id: string; role: "user" | "assistant" | "image"; body: string; workId?: string };
type Decision = Awaited<ReturnType<typeof judgeEasyTurn>>;
type Entry = { n: number; rowId: string; workId: string; kind: "image"; state: "done"; words: string };
const 없음 = { hasDraft: false, made: false, madeImage: false };
// 물음은 「?」가 어디든 있으면 된다(물음 뒤 설명이 붙어도 — 2차 최종 리뷰 3, `askText` 와 같은 규칙).
const 물음표 = /[?？]/;

const 한이미지: Row[] = [
  { id: "u1", role: "user", body: "카페 딸기라떼 포스터 만들어줘" },
  { id: "s1", role: "assistant", body: sayBody("딸기라떼 포스터를 만들겠습니다.") },
  { id: "i1", role: "image", body: "", workId: "p1" },
];
const 두이미지: Row[] = [
  ...한이미지,
  { id: "u2", role: "user", body: "겨울 세일 배너도 만들어줘" },
  { id: "s2", role: "assistant", body: sayBody("겨울 세일 배너를 만들겠습니다.") },
  { id: "i2", role: "image", body: "", workId: "p2" },
];
const 목록: Entry[] = [
  { n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페 딸기라떼 포스터 만들어줘" },
  { n: 2, rowId: "i2", workId: "p2", kind: "image", state: "done", words: "겨울 세일 배너도 만들어줘" },
];
const 갈래물음: Row[] = [
  { id: "u1", role: "user", body: "신메뉴 딸기라떼 홍보물 만들어줘" },
  { id: "q1", role: "assistant", body: askBody("kind", KIND_QUESTION, { ids: [] }) },
];
const 모양물음: Row[] = [
  { id: "u1", role: "user", body: "바다 풍경 이미지 만들어줘" },
  { id: "q1", role: "assistant", body: askBody("ratio", RATIO_QUESTION, { wants: "image" }) },
];
const 이미지있음 = { ...없음, madeImage: true };

interface Case {
  name: string;
  history: Row[];
  prompt: string;
  choices?: typeof 없음;
  images?: Entry[];
  cards?: { count: number; generating: boolean };
  /** 통과면 null, 아니면 까닭. */
  check: (d: Decision) => string | null;
}

const cases: Case[] = [
  {
    name: "만들기 턴 AI 말", history: [], prompt: "카페 딸기라떼 포스터 세로로 만들어줘",
    check: (d) => (d.wants !== "image" ? `갈래 ${d.wants}` : !d.reply ? "빈 말" : null),
  },
  {
    name: "「한 장? 카드뉴스?」를 AI 가 묻기", history: [], prompt: "신메뉴 홍보물 만들어줘",
    check: (d) => (d.wants !== "either" ? `갈래 ${d.wants}` : askText(d.reply, KIND_QUESTION) !== d.reply ? `물음 아님: ${d.reply}` : null),
  },
  {
    name: "모양을 AI 가 묻기", history: [], prompt: "바다 풍경 이미지 만들어줘",
    check: (d) => (d.wants !== "image" ? `갈래 ${d.wants}` : d.ratio ? `비율을 지어냄 ${d.ratio}`
      : askText(d.reply, RATIO_QUESTION) !== d.reply ? `물음 아님: ${d.reply}` : null),
  },
  {
    name: "말로 「한 장으로」 답 → 처음 말로 만들기", history: 갈래물음, prompt: "한 장으로 해줘",
    check: (d) => (d.wants !== "image" ? `갈래 ${d.wants}` : d.note !== ASK_ANSWER_NOTE ? "답 표시 없음"
      : askInstruction(askChain(갈래물음), "한 장으로 해줘", "typed").includes("딸기라떼") ? null : "처음 말 잃음"),
  },
  {
    name: "「아까 첫 번째 거 배경만」 → 이미지 1 고치기", history: 두이미지, prompt: "아까 첫 번째 거 배경만 파랗게 바꿔줘",
    choices: 이미지있음, images: 목록,
    check: (d) => (d.wants !== "image_edit" ? `갈래 ${d.wants}` : d.target !== 1 ? `번호 ${d.target ?? 0}` : null),
  },
  {
    name: "「방금 거 배경만」 → 마지막 이미지", history: 두이미지, prompt: "방금 거 배경만 하얗게 해줘",
    choices: 이미지있음, images: 목록,
    check: (d) => (d.wants !== "image_edit" ? `갈래 ${d.wants}` : d.target && d.target !== 2 ? `번호 ${d.target}` : null),
  },
  {
    name: "이미지 둘 이상에서 「고쳐줘」 → 어느 것인지 묻기",
    history: [...두이미지, { id: "u3", role: "user", body: "고마워" }, { id: "a3", role: "assistant", body: "천만에요! 더 필요한 게 있으면 말씀해 주세요." }],
    prompt: "글자를 더 크게 고쳐줘", choices: 이미지있음, images: 목록,
    check: (d) => (d.wants === "talk" && d.note === ASK_TARGET_NOTE && 물음표.test(d.reply) ? null : `갈래 ${d.wants} · note ${d.note ?? ""}`),
  },
  {
    name: "「방금 거 어때?」 → 이미지를 보기로", history: 한이미지, prompt: "방금 거 어때?",
    choices: 이미지있음, images: 목록.slice(0, 1),
    check: (d) => (d.wants !== "talk" ? `갈래 ${d.wants}` : (d.see ?? []).includes("1") ? null : `볼 것 ${JSON.stringify(d.see ?? [])}`),
  },
  {
    name: "「상세페이지 만들 수 있어?」 → AI 답", history: [], prompt: "여기서 상세페이지도 만들 수 있어?",
    check: (d) => (d.wants !== "talk" ? `갈래 ${d.wants}` : d.reply.includes("상세페이지 만들기") ? null : "답 부족"),
  },
  {
    name: "「상세페이지 만들어줘」 → 안내를 AI 가 씀", history: [], prompt: "우리 화장품 상세페이지 만들어줘",
    check: (d) => (d.wants !== "detail_page" ? `갈래 ${d.wants}` : !d.reply ? "빈 안내" : null),
  },
  {
    name: "번호 없이 「다시 그려줘」 → 몇 번 장 묻기",
    history: [{ id: "u1", role: "user", body: "건강 카드뉴스 만들어줘" }, { id: "c1", role: "image", body: "", workId: "s1" }],
    prompt: "다시 그려줘", choices: { hasDraft: true, made: true, madeImage: false }, cards: { count: 6, generating: false },
    check: (d) => ((d.wants === "card_redo" || d.wants === "card_text") && !d.card
      ? (askText(d.reply, ASK_CARD_NUMBER) === d.reply ? null : `물음 아님: ${d.reply}`)
      : d.wants === "talk" && 물음표.test(d.reply) ? null : `갈래 ${d.wants} · 장 ${d.card ?? 0}`),
  },
  {
    name: "사진 없이 「같은 사진으로 하나 더」 → 다시 붙여 달라", history: 한이미지, prompt: "같은 사진으로 하나 더 만들어줘",
    choices: 이미지있음, images: 목록.slice(0, 1),
    check: (d) => (d.wants === "talk" && d.reply.includes("다시 붙여") ? null : `갈래 ${d.wants}: ${d.reply.slice(0, 60)}`),
  },
  {
    // 2차 최종 리뷰 6 — 서버는 모양 물음 뒤 모양을 다시 안 묻는다. 그때 AI 말이 또 묻는 글이면 머리말이 어긋난다.
    name: "모양 물음에 「그냥 알아서 해줘」 → 다시 안 묻고 만든다는 말", history: 모양물음, prompt: "그냥 알아서 해줘",
    check: (d) => (d.wants !== "image" ? `갈래 ${d.wants}` : 물음표.test(d.reply) ? `또 물음: ${d.reply.slice(0, 60)}` : null),
  },
];

async function 한번(one: Case): Promise<{ 까닭: string | null; decision: Decision }> {
  const decision = await judgeEasyTurn({
    decide: (text, wants) => provider.decide(text, wants),
    history: one.history as never, prompt: one.prompt, attachmentCount: 0,
    choices: one.choices ?? 없음, images: one.images as never, lastIsImage: true, cards: one.cards,
  });
  return { 까닭: one.check(decision), decision };
}

// 이미지를 보고 답하기 — 진짜 호출 딱 한 번(값 몇 원). 우리 도우미 얼굴 그림(128px)을 보여 준다.
async function 보기(): Promise<{ ok: boolean; reply: string }> {
  const data = readFileSync(`${웹}/public/easy/assistant.webp`).toString("base64");
  const raw = await provider.writeSeenReply(
    easySeePrompt({ history: [], prompt: "이 이미지에 무엇이 있나요? 한 문장으로요.", labels: ["이 대화의 이미지 1번"] }),
    [{ mediaType: "image/webp", data }],
  ) as { reply?: string } | null;
  const reply = raw?.reply ?? "";
  return { ok: /로봇|캐릭터|인물|얼굴|손/.test(reply), reply };
}

const runs = Number(process.argv[2] ?? 2);
let 실패 = 0;
for (const one of cases) {
  for (let i = 0; i < runs; i += 1) {
    const { 까닭, decision } = await 한번(one);
    if (까닭) 실패 += 1;
    process.stdout.write(`${까닭 ? "FAIL" : "OK  "} ${one.name} #${i + 1}: ${decision.wants}${까닭 ? ` (${까닭})` : ""} | ${decision.reply.slice(0, 80)}\n`);
  }
}
const 본결과 = await 보기();
if (!본결과.ok) 실패 += 1;
process.stdout.write(`${본결과.ok ? "OK  " : "FAIL"} 이미지를 보고 답하기(진짜 호출 1번): ${본결과.reply.slice(0, 120)}\n`);
process.stdout.write(`\n실패 ${실패}건\n`);
```

- [ ] **Step 2: 2차 확인을 실제 모델로 돌린다**

Run:
```bash
cd C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web && NODE_PATH="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/stubs" npx tsx --conditions react-server "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/easy-ai-assistant-eval.mts" 2
```
Expected: 마지막 줄 `실패 0건`. **하나라도 FAIL 이면 다음 단계로 가지 않는다** — 출력 전체를 사용자에게 그대로 보고하고 결정을 묻는다(프롬프트를 몰래 고치지 않는다). 키가 출력에 없는지 눈으로 확인한다.

- [ ] **Step 3: 1차 회귀 묶음을 그대로 돌린다**

1차 스크립트(`easy-chat-flow-eval.mts`)는 손대지 않고 그대로 돈다 — 1차의 `adImageInstruction` · `judgeEasyTurn` 이름과 모양을 2차가 바꾸지 않았다.

Run:
```bash
cd C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web && NODE_PATH="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/stubs" npx tsx --conditions react-server "C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/easy-chat-flow-eval.mts" 1
```
Expected: 마지막 줄 `실패 0건`. FAIL 이면 Step 2 와 같이 멈추고 보고한다

- [ ] **Step 4: 전체 시험 · 타입 · 린트 · 비용 화면 검사**

워크트리 뿌리에서 각각 새로 돌리고 출력 끝까지 읽는다:

Run: `pnpm test`
Expected: 모든 패키지 실패 0

Run: `pnpm -r typecheck`
Expected: 모든 패키지 에러 0

Run: `pnpm lint`
Expected: 에러 0 (경고는 이번 변경 파일에 새로 생긴 것이 없어야 한다)

Run: `pnpm check:cost-forecast`
Expected: exit 0

- [ ] **Step 5: 처음 만들기 경로 0줄 · 크기 · 줄표 확인**

Run: `git diff --stat $(git merge-base master HEAD) -- apps/web/app/api/poster apps/web/app/api/sns packages apps/web/app/poster apps/web/app/sns`
Expected: 출력 없음

Run: `wc -l apps/web/app/easy/easy-client.tsx apps/web/app/api/easy/generate/route.ts apps/web/app/easy/chat.ts apps/web/app/easy/chat-facts.ts apps/web/app/easy/row-marks.ts apps/web/app/easy/ask-chain.ts apps/web/app/easy/image-numbers.ts apps/web/app/easy/ask-answers.ts apps/web/app/easy/use-easy-asks.ts apps/web/app/easy/_components/ask-row.tsx apps/web/app/easy/turn-words.ts apps/web/app/easy/see-prompt.ts apps/web/app/easy/attachments-after.ts apps/web/lib/easy/ask-turn.ts apps/web/lib/easy/edit-target.ts apps/web/lib/easy/image-list.ts apps/web/lib/easy/see-turn.ts`
Expected: `easy-client.tsx` ≤ 800(처음 800), `route.ts` · `chat.ts` < 800, 새 파일은 모두 < 400. 줄 수를 보고에 적는다

Run: `pnpm --filter @fixup/web exec vitest run app/__tests__/ui-text-dash.test.ts app/__tests__/upload-rights-notice.test.ts lib/__tests__/ai-cost-call-sites.test.ts app/api/easy/__tests__/generate-wiring.test.ts`
Expected: PASS(줄표 0 · 업로드 권리 안내 · 공급자 파일 목록 · 라우트 배선)

Run: `git status --short`
Expected: 출력 없음(모두 커밋됨)

- [ ] **Step 6: 로컬 화면 확인 준비 (만들기 값은 들지 않는다)**

로컬에서 보는 것은 둘이다 — ① 물음 줄이 남고 새로고침 뒤에도 단추가 나오며, 단추 답이 처음 말 대신 물음 줄 id · 고른 값만 보내는지(판단 한 번만 진짜, 만들기는 가로챈다) ② 일하는 턴의 머리말 · 「이미지 N」 · 첨부 비우기(전부 가로챈다).

워크트리에는 `.env.local` 이 없다. 메인 폴더의 것을 복사한다(`.gitignore` 의 `.env*` 로 커밋되지 않는다). 이 파일은 **Supabase 가 비어 있어** 로컬 파일 저장소만 쓴다(CLAUDE.md). **dev 서버를 띄운 이 워크트리에서는 빌드하지 않는다.**

Run: `cp C:/Users/PC/Desktop/coding/fixup-image-agent/apps/web/.env.local C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/.env.local`

Run (run_in_background): `cd C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow && pnpm --filter @fixup/web exec next dev -p 3108`
Expected: 출력에 `Ready` (Monitor 로 기다린다)

- [ ] **Step 7: 물음 줄 · 새로고침 · 단추 답 약속 — 브라우저 도구 한 번(단독 메시지)**

`mcp__plugin_playwright_playwright__browser_run_code_unsafe` 에 아래 code 를 넣는다. 첫 요청(판단)은 진짜로 간다 — 0크레딧 판정 한 번(값 몇십 원). 단추 답은 **가로채서** 서버로 안 보낸다 — 만들기 값이 안 든다.

```js
async (page) => {
  const 보낸것 = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/easy/generate') && req.method() === 'POST') 보낸것.push(JSON.parse(req.postData() || '{}'));
  });
  await page.goto('http://localhost:3108/easy');
  const skip = page.getByRole('button', { name: '없이 시작' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole('textbox').fill('바다 풍경 이미지 만들어줘');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '이대로 만들기' }).waitFor({ timeout: 90000 });
  await page.reload();
  await page.getByRole('button', { name: '이대로 만들기' }).waitFor({ timeout: 30000 });
  const 표시가샜나 = (await page.content()).includes('ask:ratio');
  await page.route('**/api/easy/generate', (route) => route.request().method() !== 'POST'
    ? route.continue()
    : route.fulfill({ status: 400, json: { ok: false, message: '확인용으로 여기서 멈췄습니다', retryable: false } }));
  await page.getByRole('button', { name: '이대로 만들기' }).click();
  await page.getByText('확인용으로 여기서 멈췄습니다').waitFor();
  return {
    표시가샜나,
    보낸것: 보낸것.map((one) => ({ prompt: one.prompt, answersRowId: one.answersRowId ?? null, pick: one.pick ?? null, kind: one.kind ?? null })),
  };
}
```

Expected: `표시가샜나: false`, `보낸것` 이 두 개 — `[{ prompt: "바다 풍경 이미지 만들어줘", answersRowId: null, pick: null, kind: null }, { prompt: "이대로 만들기", answersRowId: "<물음 줄 id>", pick: { ratio: "1:1" }, kind: null }]`. 새로고침 뒤에도 「이대로 만들기」가 보였다(물음 줄이 대화에 남았다). 첫 요청이 판단 단계에서 실패하면(로컬 키 · 판정 예약) 멈추고 그 글을 그대로 보고한다 — 돌아가는 길을 만들지 않는다

- [ ] **Step 8: 머리말 · 「이미지 N」 · 첨부 비우기 — 브라우저 도구 한 번(단독 메시지)**

모든 요청을 가로챈다(사진 올리기 · 만들기 · 결과 받기). 값이 안 든다.

```js
async (page) => {
  const P = 'p-fake';
  await page.route('**/api/reference-images', (route) => route.request().method() !== 'POST'
    ? route.continue()
    : route.fulfill({ json: { ok: true, image: { id: '00000000-0000-4000-8000-000000000001', title: 'own.png', signedUrl: null } } }));
  await page.route('**/api/easy/generate', (route) => route.request().method() !== 'POST' ? route.continue() : route.fulfill({ json: {
    ok: true, projectId: P, submission: { requestRowId: 'r-fake', falRequestId: 'f', endpoint: 'e' }, textModel: 'claude-sonnet-5',
    ratio: '1:1', photoRoles: [], resultLabel: '이미지 2',
    say: { id: 'say-fake', role: 'assistant', body: 'say:카페 포스터를 만들겠습니다. 다 되면 보여 드릴게요.' },
  } }));
  await page.route(`**/api/poster/projects/${P}/status`, (route) => route.fulfill({ json: {
    ok: true, done: true, images: [{ id: 'img-fake', url: '/easy/assistant.webp', generationRequestId: 'r-fake' }],
  } }));
  await page.goto('http://localhost:3108/easy');
  await page.locator('input[type=file]').setInputFiles('C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/784d2a2c-9751-46a0-950a-37d14786dbdf/scratchpad/own.png');
  await page.getByRole('button', { name: '빼기' }).first().waitFor({ timeout: 30000 });
  const 붙인수 = await page.getByRole('button', { name: '빼기' }).count();
  await page.getByRole('textbox').fill('이 사진으로 카페 포스터 만들어줘');
  await page.keyboard.press('Enter');
  await page.getByText('카페 포스터를 만들겠습니다. 다 되면 보여 드릴게요.').waitFor();
  await page.getByText('이미지 2', { exact: true }).first().waitFor({ timeout: 30000 });
  return {
    붙인수,
    남은첨부: await page.getByRole('button', { name: '빼기' }).count(),
    머리말표시샜나: (await page.content()).includes('say:카페'),
  };
}
```

Expected: `{ 붙인수: 1, 남은첨부: 0, 머리말표시샜나: false }` — 머리말이 표시 없이 보이고, 그림 밑에 「이미지 2」가 있고, 쓴 사진이 입력창에서 내려갔다

- [ ] **Step 9: 정리**

dev 서버를 끈다:

Run: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3108 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`

복사한 `.env.local` 을 지운다(이 Task 의 Step 6 에서 만든 복사본이다):

Run: `rm C:/Users/PC/Desktop/coding/fixup-image-agent/.worktrees/easy-chat-flow/apps/web/.env.local`

Run: `git status --short`
Expected: 출력 없음. **푸시하지 않는다.**

- [ ] **Step 10: 보고**

사용자에게 쉬운 말로 적는다: 각 명령의 실제 결과(통과 수 · 에러 0 · exit 0), 2차 실제 모델 표(13 경우 × 2번 · 보기 1번 · 실패 수), 1차 회귀 묶음 결과, 로컬 두 확인의 결과, `easy-client.tsx` 줄 수(처음 800 → 지금), 0줄 확인 출력, 쓴 값(추정). 배포 뒤 사용자 손 확인이 남았다고 적는다 — 만들기 → 고치기 → 또 만들기 → 「아까 것」 고치기, 이미지 보고 이야기하기(설계 §5). 되돌리기 메모(이 계획 머리)도 한 줄로 알린다.

---

## 자체 점검 (작성 뒤)

**1. 설계 대조**

| 설계 | Task |
|---|---|
| §3-0 표시 한 벌(`ask:` · `;data=` · `;pick=` · `guide:` · `say:`), `visibleBody` 한 함수, 옛 표시와 안 섞임 · AI 글의 표시 머리 풀기 | 1 (`row-marks.ts` · `plainAiText`) · 7 (`;from=`) |
| D1 물음 출구마다 사용자 줄 + 물음 줄(갈래 · 비율 · 사진 · 레퍼런스 · 이미지 번호 · 카드 번호) | 3 (갈래 · 비율 · 사진 · 레퍼런스) · 8 (`ask:target`) · 10 (`ask:card`) |
| D1 이어 답하기 약속(단추 = 답 글 + `answersRowId` + `pick`, 말 = `prompt`), 지금 답할 수 있는 물음 줄만(단추 답 실패 짝은 머리말 줄이 끼어도 건너뜀) | 1 (광고 `물음자리`) · 2 (`readButtonAnswer` · `answerableAskId`) · 4 (라우트) · 5 (화면) |
| D1 단추 답은 판단 **호출만** 생략(0크레딧 판정 예약 · 정산은 함), 지금 사실로 다시 봄 | 2 (`buttonDecision` · `fitButtonDecision`) · 4 (예약 블록 · 막이) · 8 (고칠 이미지 사실) |
| D1 말로 한 답은 판단 모델이 마지막 물음을 보고 가른다(note=answer 일반화 · 물음 갈래마다 답하는 법 · 되풀이 없음) | 2 (`settleTypedAnswer`) · 4 (`easyAskAnswerLines`) |
| D1 지시 조립 `askChain`(처음 말 + 말 답들, 이미지 · 카드뉴스 둘 다) | 2 · 4 (`지시` 를 카드뉴스 원고 턴에도) |
| D1 사진: 첨부가 비었으면 물음 줄의 id(판단에 주는 붙인 장수도) · 사진 고르기 중 친 말은 그 물음의 답 | 4 (`이을사진` · `정한사진` · `typed`) · 5 (`photoTypedReply`) · 6 (붙인 장수) |
| D1 단추는 그 자리에서만, 다시 열면 kind · ratio · target · card 단추 · photo · reference 문장만 | 5 (`EasyAskControls` · `answerableAskId`) · 8 · 10 |
| D1 `generate-wiring` 두 시험 뒤집기(까닭 주석), 나머지 규칙 유지 | 3 · 4 (Step 6 `grep -c 'role: "user"'` · 막이 글자 시험) |
| D2 **결과물** 번호(이미지 · 카드뉴스 · 지운 것 모두 대화 차례, 표시 · SQL 없이 옛 줄도 안 바뀜, 고친 줄도 번호 · 고친 관계), 화면 · 서버 같은 함수, 화면 「이미지 N」 · 「카드뉴스 N」 | 7 (`numberEasyResults` · `resultLabel` · `load.ts` · 응답 `resultLabel`) |
| D2 프롬프트의 결과물 목록(`#N 이미지` · `#N 카드뉴스` · `#N (지운 결과)`) | 7 (`easyResultListLines` · `easyResultRowText`) |
| D2 `target` · 서버 검증(줄 단위 · 이미지 번호일 때만 · 카드뉴스 · 지운 결과 · 만드는 중) | 8 (`edit-target.ts` · `고칠그림`) |
| D2 둘 이상이고 모르면 AI 가 묻는다 | 8 (`ASK_TARGET_NOTE` · `targetAskNumbers`) |
| D2 마지막 결과가 무엇인가(카드뉴스면 콕 집지 않은 고치기 = 원고) | 7 (`lastIsImage`) · 8 (`easyLastResultLines`) |
| D3 만들기에 쓴 턴만 첨부 비우기 | 6 (`usedAttachments`) |
| D3 고치기 첨부 = 이번 새 재료, `editAddedOf` 거르기 뺌, 지킬 사진만 거름 | 6 (`keptIds`) |
| D3 사진 없이 「같은 사진으로」 → 다시 붙여 달라는 사실 줄(새로고침 뒤 물음의 사진은 붙인 것으로 셈) | 6 (`easyPhotoGoneLines` · 붙인 장수) |
| D4 같은 판단 호출에서 모든 갈래 reply, 실행하는 갈래로 쓴 글만, 비면 코드 문장(재질문 없음) | 3 (`aiText`) · 9 (`easyReplyLines` · `sayText`) |
| D4 저장 차례 사용자 → `say:` → 그림, 실패 줄 규칙 | 1 (`failure-row.ts`) · 9 |
| D4 갈래 · 비율 물음을 AI 글로(물음 뒤 설명 허용), 사진 물음 고정, 광고 물음 사용자 문장 | 3 (`askText`) · 9 (물음 쓰는 법) |
| D4 상세페이지 안내 `guide:detail:` + 옛 완전일치 · 카드 끝 문장(끝난 일로) · 몇 번 장. 고칠 것 없음 · 아직 안 만듦 · 만드는 중 · 번호 틀림은 코드 사실 문장(의도한 차이 — 설계 §3-2 · §4) | 10 · 8 · 9 (끝난 일) · 「정한 것」 |
| D4 카드 장수 · 만드는 중을 사실 줄로 | 10 (`easyCardFactLines`) |
| D4 `draftFailureMessage` · 기본 「무엇을 만들어 드릴까요?」 고정 | 9 (손대지 않음 — 0장 실패 줄은 머리말 뒤에 그대로) |
| D4 지난 대화 창 「사용자 말 8번」 | 9 (`최근대화`) |
| D5 `see` · talk 일 때만 두 번째 호출 · 판정 예약 안 · 고치기에는 안 넣음 · 못 보면 `SEE_FAILED` | 11 |
| D5 공용 어댑터 이미지 입력(새 파일 SDK 없음) · 서명 주소 / 로컬은 `asset-bytes.ts` 로 읽은 base64 | 11 (`structured.ts` · `see-turn.ts`) |
| D5 값은 회사 원가 | 11 (0크레딧 `easy:decide` 안 · 계량기 기록) · Global Constraints |
| §3-6 `easy-client.tsx` 800 상한 — 묻기 상태 · 렌더를 먼저 뺀다 | 5 (첫 화면 Task) · 6 · 7 · 9 줄 수 확인 |
| §3-6 `route.ts` 새 저장 · 조립은 lib 헬퍼로 | 3 (`ask-turn.ts`) · 7 (`image-list.ts`) · 8 (`edit-target.ts`) · 11 (`see-turn.ts`) |
| §3-6 처음 만들기 경로 0줄 · DB 스키마 0 | Global Constraints · 12 Step 5 |
| §4 하지 않는 것(카드뉴스 장 번호로 고르기 · 원고 실패 안내 · 사진 물음 AI 글 · 모든 턴 보기) | 어느 Task 도 안 한다(카드뉴스 줄은 결과물 번호만 받는다 — 손보기는 지금처럼 마지막 원고) |
| §5 단위 시험 목록 | 1~11 |
| §5 실제 모델(만들기 말 · 갈래 묻기 · 말로 한 장 · 아까 첫 번째 · 둘 이상 고쳐줘 · 방금 거 어때 · 상세페이지 · 모양 물음 뒤 다시 안 묻기) + 1차 회귀 | 12 Step 1~3 |
| §5 로컬 화면(물음 줄 · 단추 · 새로고침 유지 · 「이미지 N」 · 첨부 비우기) | 12 Step 7 · 8 |

빠진 것 없음.

**2. 2차 최종 리뷰 반영(2026-10-07)**

| 리뷰 | 반영한 곳 |
|---|---|
| 1 (치명) 단추 답이 쓸 수 없는 갈래로 새어 값 | Task 2 `availableWant` · `fitButtonDecision` + 시험 · Task 4 Step 5(f) 단추 답 다시 보기 · (o) 만들기 앞의 막이 + 「고칠 것이 사라진 장 · 번호 단추 답」 시험 · 막이 글자 시험 · Task 8 Step 6(c) 고칠 이미지 사실 |
| 2 머리말 줄이 단추 답 실패 짝을 깬다 | Task 1 Step 4(e) 광고 `물음자리` + 시험 · Task 2 `물음자리` · `answerableAskId` + 시험 · Task 5 Step 7(d)(h) 화면 단추 자리 · 사용자 줄 `withPick` + 시험 |
| 3 AI 물음 · 머리말 받기 | Task 3 `askText`(「?」 어디든) · `aiText` + 시험 · Task 9 `sayText`(비지 않으면) + 시험 · `easyReplyLines` 안내 정리 |
| 4 단추 답도 판정 예약 · 정산 | Global Constraints · 정한 것 · Task 4 Step 5(f) · 「판정 예약 · 정산은 한다」 시험(`reserve: 1`) |
| 5 결과물 번호(옛 줄도 안 바뀜) | Global Constraints · 정한 것 · Task 7 전체(다시 씀) · Task 8 `pickEditTarget`(이미지 번호만) + 시험 · 설계 §2 D2 · §3-2 |
| 6 말로 한 답의 되풀이 · 처음 말 | Task 2 `settleTypedAnswer` + 시험 · Task 4 Step 3 물음 갈래마다 답하는 법 · Step 5(f)(n) + 시험 셋 · Task 8 · 10 말 번호 답 시험 · Task 12 13번째 경우 |
| 7 새로고침 뒤 사진 물음에 말로 답 | Task 6 Step 5 붙인 장수 + 시험 둘 |
| 8 사진 고르기 중 친 말 | Task 2 `EasyPick.typed` + 시험 · Task 4 「사진 고르기가 열린 채 말로 친 답」 · Task 5 `photoTypedReply` + 시험 |
| 9 `collect.test.ts` 글자 | Task 5 Files · Step 1 |
| 10 보기 실패 문장 · 혼자 서는 답 | Task 11 `SEE_FAILED` · `EasySeen` · `easySeeLines` + 시험 |
| a 만드는 중은 「아직 준비 안 됨」 | Task 7 `madeImage`(지운 것만 뺌) + 시험 · Task 8 「만드는 중인 이미지를 고쳐 달라면」 |
| b 실행 갈래 = 판단 갈래일 때만 AI 글 | Task 2 `availableWant`(바꿔 읽으면 reply 비움) · Task 3 `aiText` · Task 9 · 10 모든 AI 글 자리 + 시험 |
| c AI 글의 표시 머리 풀기 | Task 1 `plainAiText` + 시험 · Task 2 판단 읽기 · Task 9 라우트 시험 · Task 11 보고 쓴 답 |
| d 코드 사실 문장은 의도한 차이 | 정한 것 · 설계 §3-2 · §4 |
| e `asset-bytes.ts` 다시 쓰기 | Task 11 `see-turn.ts` · Step 8 grep |
| f 롤백 SQL | 되돌리기 메모(1차 `ad-guide:` · 트랜잭션 · 백업 · 승인) |
| g 카드 끝 문장 시제 | Task 9 `easyReplyLines`(끝난 일) + 시험 · Task 10 Step 4(f) · 시험 |
| 줄 번호 바로잡기 | Task 5(`photo-ask.tsx:38-68` · `reference-ask.tsx:5, 61` · `cardnews-state.ts:95-109`) · Task 7(`judge.ts:1-6, 31, 43` · `load.ts:10, 89, 115, 157` · `row-image.ts:32, 42-45, 55-70`) · Task 8(`chat-provider.ts:69-71`) |

**3. 자리 채우기 검사** — 「TBD」 · 「적절히」 · 「Task N 과 같이」 없음. 모든 코드 단계에 코드가 있다. 지우는 줄 · 바꾸는 줄은 찾을 글을 그대로 적었다.

**4. 이름 맞추기** — `askBody`/`readAsk`/`withPick`/`readPick`/`plainTyped`/`plainAiText`/`guideBody`/`readGuide`/`sayBody`/`isSayBody`/`visibleBody`(1 → 2 · 3 · 4 · 5 · 7 · 9 · 10 · 11) · `EasyPick`(`typed`)/`EasyAskChain`/`askChain`/`askInstruction`/`answerableAskId`/`readButtonAnswer`/`buttonDecision`/`chosenFor`/`settleTypedAnswer`/`EasyTypedAnswer`/`ASK_ANSWER_NOTE`/`EasyAnswerWay`/`EasyChosen`(2 → 4 · 5) · `EasyAvailability`/`availableWant`/`fitButtonDecision`/`CANNOT_DO_NOW`(2 → 4 · 8) · `AskTurnContext`/`askTurn`(3 → 4 · 8 · 10)/`replyTurn`(8) · 라우트 `물음맥락`(3, 4 에서 `userBody: 사용자글` · `cont: 답방식 !== "none"`) · `말한것`(3) · `처음사진`/`정한사진`/`이을사진`/`고른단추`/`말답`(4 → 6 은 `이을사진.length`, 11 은 `처음사진.photos`) · `KIND_QUESTION`/`RATIO_QUESTION`/`photoQuestion`/`askText`/`aiText`(3 → 8 · 9 · 10) · `TARGET_QUESTION`(8) · `SAY_*`/`sayEditText`/`sayText`(9 → 10) · `EasyButtonReply`/`kindReply`/`ratioReply`/`photoReply`/`photoTypedReply`/`referenceReply`(5) · `askNumbers`/`targetReply`(8) · `cardReply`(10) · `useEasyAsks`/`EasyAsks`(5) · `EasyAskControls`(5, 8 · 10 이 갈래를 더한다) · `EasyNumberAsk`(8 → 10) · `usedAttachments`(6) · `keptIds`(6 → 8 의 `projectTarget`) · `withRowFrom`/`rowFromOf`(7 → 8) · `numberEasyResults`/`nextResultNumber`/`describeEasyResults`/`resultKindOf`/`resultLabel`/`doneImageNumbers`/`EasyResultNumber`/`EasyResultEntry`/`EasyResultKind`/`EasyImageState`(7 → 8 · 11) · `cardnewsProjectIds`(7) · `loadEasyImages`/`EasyImageFacts`/`EasyPicture`/`이미지들`(7 → 8 · 11) · `easyResultListLines`/`easyResultRowText`(7) · `ASK_TARGET_NOTE`/`easyTargetLines`/`easyLastResultLines`(8) · `pickEditTarget`/`targetAskNumbers`/`projectTarget`(8) · `easyReplyLines`(9) · `easyCardFactLines`(10) · `StructuredImage`/`anthropicUserContent`/`openaiUserContent`/`writeSeenReply`/`EASY_SEE_SPEC`(11) · `seeTargets`/`seeLabel`/`easySeePrompt`/`SEE_FAILED`/`rewriteReplyBySeeing`/`EasySeen`(11 → 12). `EasyDecision` 에 `target`(2) · `see`(11), `EasyPromptOptions` 에 `images`(7, `EasyResultEntry[]`) · `lastIsImage`(8) · `cards`(10), `EasyJudgeInput` 에 같은 셋. `imageEditTurn` ctx 에 `userBody`(4) · `rowId` · `resultLabel`(8) · `say`(9), `cardAfterTurn` ctx 에 `userBody`(4) · `물음`(10), `cardnewsTurn` ctx 에 `물음` · `말한것`(3) · `고른` · `지시` · `userBody`(4) · `결과번호`(7) · `decision.wants` · `decision.reply`(9). 응답 칸 `resultLabel`(7 이미지 · 카드뉴스 원고, 8 고치기), 화면 prop `initialResultLabels` · `resultLabel`(7).

**5. Review Focus** — 여덟 줄 모두 소유 Task 에 시험이 있다: 1 → Task 1 「단추 답 실패 짝 사이에 머리말 줄이 끼어도 건너뛴다」 · Task 2 「지난 물음 줄 id · 없는 id · 광고 물음이면 받지 않는다」 · 「머리말 줄이 끼어든 단추 답 실패 짝도 건너뛴다」 · 「지금 답할 수 있는 물음 줄」 묶음 · Task 4 「지난 물음 줄 id 로 온 단추 답은 새 말로 본다」 · Task 5 「지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만 단추를 넘긴다」, 2 → Task 1 「머리말 줄은 답으로 치지 않는다」 · Task 9 「머리말 뒤에 기획이 실패해도 실패 줄이 남는다」, 3 → Task 1 「자료와 문장에 표시 글자 · 줄바꿈이 섞여도」 · 「친 말에 섞인 표시 글자는 풀어 둔다」 · 「AI 가 쓴 글의 표시 머리를 푼다」 · Task 4 「친 말에 고른 값 표시 글자가 있어도」 · Task 7 「고친 줄 표시 · 넣은 사진 · 고친 대상 · 받을 정보가 안 섞인다」, 4 → Task 7 「지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다」(번호 · 사실 둘 다) · Task 8 「번호로 고른 줄의 그림을 고친다」 · 「「이미지 1 고쳐줘」는 1번 줄의 그림을 고친다」 · 「카드뉴스 번호는 이미지 고치기로 안 고치고」 · 「지운 결과의 번호면 값 없이」, 5 → Task 2 「사슬이 없으면 옛 화면이 보낸 칸만 쓴다」 · Task 4 「모양 물음 뒤 답이 아닌 새 주문은 그 말 그대로」, 6 → Task 1 「표시 없는 옛 줄 · 그림 줄은 손대지 않는다」 · Task 7 「표시 없는 옛 줄도 · 지운 작업 줄도 자리를 지킨다」 · Task 10 「옛 완전일치 줄도 안내로 본다」, 7 → Task 2 「쓸 수 없게 된 단추 답은 다른 일로 새지 않고 사실 문장으로 끝낸다」 · Task 4 「고칠 것이 사라진 장 · 번호 단추 답은 값 없이 사실만 말한다」 · 「프로젝트를 만들기 바로 앞에서 image 가 아닌 갈래를 끝낸다」, 8 → Task 2 「말로 한 답의 갈래 정리」 · Task 4 「모양 물음에 모양 없는 말로 답하면」 · 「갈래 물음 뒤 또 either 면」 · 「사진 고르기가 열린 채 말로 친 답」 · Task 6 「이미지를 만든 대화에서 새로고침 뒤 사진 물음에 말로 답하면」 · Task 8 「번호 물음에 말로 「1번」이라 답하면」 · Task 10 「장 물음에 말로 「2번」이라 답하면」.
