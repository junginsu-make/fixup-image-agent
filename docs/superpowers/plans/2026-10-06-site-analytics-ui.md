# 방문 분석 탭 가독성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 관리자 「방문 분석」 탭을 숫자·표 위주에서 한눈에 읽히는 화면으로 바꾼다 — 화면 주소를 한글 이름으로, 유입·기기 비율을 막대로, 일별 그래프에 날짜 축, 숫자마다 지난 기간 대비 증감.

**Spec:** 사용자 요청(2026-10-06): 「관리자 페이지에 프론트엔드도 가독성 있게 다양한 데이터를 수집 분석한 결과들을 볼 수 있게」 → 컨트롤러가 제안한 다섯 가지(한글 화면 이름, 비율 막대, 날짜 축, 지난 기간 대비 증감, 휴대폰·컴퓨터 폭 눈 확인)를 사용자가 승인: 「부족한 부분들을 개선 후 한번에 배포하겠습니다」.

**Architecture:** DB·SQL 은 그대로 둔다. 지난 기간은 같은 보고 함수를 `p_now` 만 앞당겨 한 번 더 부른다. 그림은 새 패키지 없이 서버에서 그리는 SVG·CSS 로(이 저장소의 `@fixup/ui` 에는 차트·표·진행 막대가 없고, 새 의존성을 넣지 않기로 했다). 기존 `Card`·`Badge` 와 `lucide-react` 아이콘을 쓴다.

## Global Constraints
- 작업 위치: `.worktrees/site-analytics`(브랜치 `feat/site-analytics`). 메인 폴더·`.worktrees/easy-image-edit` 는 건드리지 않는다.
- 새 npm 패키지 없음. SQL·마이그레이션 변경 없음.
- `@fixup/ui` 의 `Card`·`CardHeader`·`CardTitle`·`CardContent`·`Badge`·`cn` 과 `lucide-react` 아이콘만 쓴다. 조건부 클래스는 `cn()`.
- 화면 글에 줄표(—, –)를 쓰지 않는다(`app/__tests__/ui-text-dash.test.ts`).
- 모바일 먼저: 390px 에서 가로 스크롤 없음. 표는 휴대폰에서 줄 단위 목록처럼 읽혀야 한다.
- 접근성: 그래프는 `role="img"` + 요약 `aria-label`, 막대마다 `<title>`. 증감은 색만이 아니라 ▲▼ 기호와 글자로도 알린다. 대비 AA.
- 파일 400줄 미만, 함수 50줄 미만, 불변 패턴, console.log 없음, 기존 주석 말투(한국어).
- 서버 컴포넌트 유지(`'use client'` 안 씀 — 상호작용 없음).
- 시험 실패 0 유지(기존 `analytics-panels.test.tsx` 단언이 바뀌면 같은 뜻으로 고친다).
- 커밋 꼬리: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. 지난 기간 창이 이번 창과 정확히 같은 길이로, 겹치지 않고 바로 앞에 붙는가(한국 날짜 기준).
2. 지난 기간이 0 일 때 증감을 「새로 생김」 등으로 보이고 무한대·NaN 을 내지 않는가.
3. 모르는 주소·유입처는 지어낸 이름 없이 원래 값을 보이는가.
4. 휴대폰 폭에서 그래프·막대·표가 넘치지 않는가.
5. 지난 기간 보고를 못 읽어도 이번 기간 화면은 그대로 열리는가(증감만 빠짐).

---

### Task 13: 순수 규칙 — 지난 기간 끝 시각, 증감, 한글 이름표

**Files:**
- Create: `apps/web/lib/analytics/compare.ts`, Test: `apps/web/lib/analytics/__tests__/compare.test.ts`
- Modify: `apps/web/app/admin/analytics/labels.ts`, Test: `apps/web/app/admin/__tests__/analytics-labels.test.ts`

**Interfaces (Produces):**
- `previousWindowEnd(days: number, now: Date): Date` — 이번 창의 첫날(한국 날짜, `today - (days-1)`) 0시 한국 시각에서 1초 앞. 예: `days=7`, now=`2026-10-06T03:00:00Z`(KST 12:00) → 이번 창 첫날 2026-09-30 KST → 반환 `2026-09-29T14:59:59Z`(KST 9/29 23:59:59). `days=1` 이면 어제 23:59:59 KST.
- `type Change = { kind: "up" | "down" | "same"; percent: number } | { kind: "new" } | { kind: "none" }`
- `change(current: number, previous: number | null): Change` — previous 가 null → `none`; previous 0 이고 current 0 → `same, 0`; previous 0 이고 current > 0 → `new`; 그 밖은 `Math.round((current - previous) / previous * 100)` 로 up/down/same(0%).
- `changeText(c: Change): string` — up `"▲ 12%"`, down `"▼ 8%"`, same `"변화 없음"`, new `"새로 생김"`, none `""`.
- `labels.ts` 추가: `pageLabel(path: string): string` — `APP_ROUTES`(`lib/access/routes.ts`)의 path→label 을 쓰고, 더해 `"/"`→`"첫 화면"`, `"/login"`→`"로그인"`, `"/signup"`→`"회원가입"`, `"/about"`→`"소개"`, `"/easy"`→`"쉽게 만들기"`, `"/onboarding"`→`"가입 정보 확인"`, `"/access"`→`"승인 대기"`, `"/forgot-password"`→`"비밀번호 찾기"`, `"/reset-password"`→`"비밀번호 바꾸기"`, `"/ad"`→`"광고 규격 만들기"`, `"/auth/confirm"`→`"메일 인증"`. 정확히 같은 주소가 없으면 **가장 긴 앞부분**이 맞는 이름 + `" · "` + 나머지 조각(예: `/guide/ad` → `"사용 설명서 · ad"`, `/library/:id` → `"라이브러리 · 하나 보기"` — `:id` 조각은 `"하나 보기"`로). 아무것도 안 맞으면 원래 주소 그대로.
- `sourceLabel` 확장(기존 `(direct)`·`(unknown)` 유지): 도메인·utm 값을 소문자로 비교해 `instagram`·`instagram.com`·`l.instagram.com` → `"인스타그램"`, `facebook`·`facebook.com`·`m.facebook.com`·`l.facebook.com` → `"페이스북"`, `youtube`·`youtube.com`·`m.youtube.com` → `"유튜브"`, `naver`·`naver.com`·`m.naver.com` → `"네이버"`, `search.naver.com`·`m.search.naver.com` → `"네이버 검색"`, `blog.naver.com`·`m.blog.naver.com` → `"네이버 블로그"`, `google`·`google.com`·`google.co.kr` → `"구글 검색"`, `daum.net`·`search.daum.net`·`m.search.daum.net` → `"다음 검색"`, `kakao`·`kakaotalk` → `"카카오톡"`, `threads.net`·`threads.com` → `"스레드"`, `x.com`·`t.co`·`twitter.com` → `"X(트위터)"`. 모르는 값은 그대로.

- [ ] 시험 먼저(위 예시 전부 + 모르는 값 그대로 + `change` 경계 6가지 + `previousWindowEnd` 의 days=1·7·30 과 한국 0시 직후 now 하나) → RED → 구현 → GREEN → 커밋 `feat(analytics): 지난 기간 비교와 한글 이름표 규칙`.

### Task 14: 지난 기간 보고 읽기

**Files:** Modify `apps/web/lib/analytics/report.ts` (+ `__tests__/report.test.ts`), `apps/web/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `previousWindowEnd` (Task 13).
- `readReport` 가 선택 인자 `now?: Date` 를 받아 있으면 RPC 에 `p_now: now.toISOString()` 을 함께 넘긴다.
- Produces: `getSiteTrafficBefore(days: number, now: Date): Promise<SiteTraffic | null>` = `admin_site_traffic` 을 `p_now = previousWindowEnd(days, now)` 로; `getSitePeopleBefore(days, now)` 같은 방식. 못 읽으면 null(경고 한 줄, 기존 모양).
- `page.tsx`: `const now = new Date()` 하나로 네 보고를 `Promise.all` 로 읽고, 패널에 `previous` 를 넘긴다(`TrafficPanel({ report, previous })`, `PeoplePanel({ report, previous })`, `SourcesPanel` 은 그대로).
- 시험: RPC 가 `{ p_days: 7, p_now: "2026-09-29T14:59:59.000Z" }` 로 불리는지(가짜 `createSupabaseAdminClient` 로 인자 기록), 기존 `p_days` 만 넘기는 호출은 그대로인지.
- [ ] 커밋 `feat(analytics): 지난 기간 보고를 함께 읽는다`.

### Task 15: 화면 — 숫자 칸 증감, 날짜 축 그래프, 비율 막대 목록

**Files:**
- Create: `apps/web/app/admin/analytics/stat-tile.tsx`, `trend-chart.tsx`, `rank-list.tsx`
- Modify: `traffic-panel.tsx`, `sources-panel.tsx`, `people-panel.tsx`, Test: `apps/web/app/admin/__tests__/analytics-panels.test.tsx` (+ 새 단언)

**Interfaces / design:**
- `StatTile({ label, value, change?, hint?, icon? })` — 큰 숫자, 아래 작은 글씨 라벨, 오른쪽 위 `Badge` 로 `changeText` (up=초록 계열, down=빨강 계열, 그 밖=회색; 글자에 ▲▼ 포함이라 색 없이도 읽힌다). `hint` 는 작은 회색 한 줄(예 「지난 7일 대비」).
- `TrendChart({ daily })` — 너비 100% 반응형 SVG(`viewBox` 고정 + `preserveAspectRatio="none"` 은 글자가 찌그러지므로 쓰지 말고, 막대 영역만 SVG, 날짜 글자는 아래 HTML flex 로). 방문자 막대 + 가입이 있는 날 막대 위 작은 점. 가로 눈금선 2~3개와 왼쪽 최댓값 글자. 날짜는 `MM/DD`, 최대 7개만(처음·끝 포함 고르게). 막대마다 `<title>` 「10/06 방문 2 · 회원 1 · 가입 1」. `role="img"` + `aria-label="최근 N일 방문자, 최고 X명(MM/DD), 합계 Y"`.
- `RankList({ title, rows, label, sublabel?, unit })` — 한 줄: 이름(굵게) · 오른쪽 숫자와 비율(%), 아래 가로 막대(합계 대비 비율, 최소 2% 너비). `sublabel` 은 작은 회색 글씨(화면 목록에서 원래 주소). 빈 목록은 「기록이 없습니다.」. 상위 8개만 보이고 나머지는 `<details>` 「더 보기 (N개)」.
- `TrafficPanel({ report, previous })`: 숫자 칸 8개를 `StatTile` 로(방문 합·들어온 회원·화면 수는 `change(현재, previous?.…)`, 오늘 방문자는 `daily` 의 마지막 날 vs 그 전날), 그 아래 `TrendChart`, 설명 글, 접힌 일별 표(그대로).
- `SourcesPanel`: 여섯 표를 `RankList` 로. 화면 목록은 `label=pageLabel`, `sublabel=원래 주소`. 유입은 `sourceLabel`. 데스크톱 두 칸, 휴대폰 한 칸.
- `PeoplePanel({ report, previous })`: 숫자 칸 3개 `StatTile`(활동 회원은 증감), 「가입 방법」·「가입자가 처음 들어온 경로」를 `RankList` 로, 「많이 쓴 기능」은 `RankList`(호출 수 기준, sublabel 「쓴 회원 N명 · 실패 M번」), 「많이 쓴 회원」 표는 휴대폰에서 넘치지 않게(이름·이메일 줄바꿈).
- 시험: 기존 단언 의미 유지 + `▲`/`새로 생김` 표시, `pageLabel` 적용(「상세페이지 만들기」), 「더 보기」, 그래프 `aria-label` 에 합계, 빈 데이터에서 깨지지 않음, 지난 기간 null 이면 증감 배지 없음.
- [ ] 커밋 `feat(admin): 방문 분석 탭을 한눈에 읽히게 — 증감, 날짜 축, 비율 막대, 한글 이름`.

### Task 16: 눈 확인(컨트롤러) — 커밋하지 않는 임시 미리보기 화면에 가짜 자료를 넣어 390px·1366px 스크린샷, 고칠 점이 있으면 Task 15 구현자에게 되돌림. 끝나면 임시 파일 삭제.
